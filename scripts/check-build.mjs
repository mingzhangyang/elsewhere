import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { analyzeBuild, assertBuildBudgets, formatBuildReport } from './build-budget.mjs';

const report = await analyzeBuild();
await assertBuildBudgets(report);
const paths = report.assetNames;

const listeners = new Map(),
  stores = new Map([
    ['unrelated-app', new Map()],
    ['elsewhere-old', new Map()],
  ]);
const origin = 'http://localhost:4173';
let offline = false;
const fetchLocal = async (request) => {
  if (offline) throw new TypeError('Offline');
  const url = new URL(typeof request === 'string' ? request : request.url);
  // Vite's preview server varies responses by Origin. Crossorigin script/style
  // requests carry that header, while URL-only precache requests do not.
  // Like Cloudflare, answer /index.html and /credits.html through a redirect to / and /credits.
  const redirected = url.pathname.endsWith('.html');
  const response = new Response(await readFile('dist' + url.pathname), { headers: { Vary: 'Origin' } });
  if (redirected) Object.defineProperty(response, 'redirected', { value: true });
  return response;
};
const caches = {
  keys: async () => [...stores.keys()],
  delete: async (key) => stores.delete(key),
  open: async (key) => {
    if (!stores.has(key)) stores.set(key, new Map());
    const store = stores.get(key);
    return {
      put: async (request, response) => {
        store.set(request.url, { request, response });
      },
      match: async (req) => {
        const request = typeof req === 'string' ? new Request(req) : req;
        const entry = store.get(request.url);
        if (!entry) return undefined;
        const vary = entry.response.headers.get('Vary');
        if (
          vary?.split(',').some((name) => {
            const field = name.trim();
            return field === '*' || request.headers.get(field) !== entry.request.headers.get(field);
          })
        )
          return undefined;
        return entry.response.clone();
      },
    };
  },
};
vm.runInNewContext(await readFile('dist/sw.js', 'utf8'), {
  URL,
  Request,
  Response,
  caches,
  fetch: fetchLocal,
  self: {
    location: new URL(origin + '/sw.js'),
    registration: { scope: origin + '/' },
    clients: { claim: async () => {} },
    addEventListener: (type, handler) => listeners.set(type, handler),
  },
});
let pending;
listeners.get('install')({
  waitUntil: (p) => {
    pending = p;
  },
});
await pending;
listeners.get('activate')({
  waitUntil: (p) => {
    pending = p;
  },
});
await pending;
assert(stores.has('unrelated-app'));
assert(!stores.has('elsewhere-old'));
offline = true;
let reply;
listeners.get('fetch')({
  request: { url: origin + '/?unused=1', method: 'GET', mode: 'navigate' },
  respondWith: (p) => {
    reply = p;
  },
});
const shellReply = await reply;
assert.equal(shellReply.redirected, false, 'A navigation must not be answered with a redirected response');
assert.equal(await shellReply.text(), await readFile('dist/index.html', 'utf8'));
reply = undefined;
listeners.get('fetch')({
  request: { url: origin + '/credits', method: 'GET', mode: 'navigate' },
  respondWith: (p) => {
    reply = p;
  },
});
assert.equal(await (await reply).text(), await readFile('dist/credits.html', 'utf8'), 'Offline /credits');
const manifest = await readFile('dist/sw.js', 'utf8');
assert(!manifest.includes('_headers'), 'Host configuration must not be precached');
const shell = await caches.open([...stores.keys()].find((key) => key.startsWith('elsewhere-')));
for (const path of paths.filter((p) => /\.(js|css|jpg)$/.test(p))) {
  const url = `${origin}/assets/${path}`;
  const request = new Request(url, { headers: { Origin: origin } });
  assert.equal(await shell.match(request), undefined, 'The cache model must respect Vary: Origin');
  reply = undefined;
  listeners.get('fetch')({
    request,
    respondWith: (p) => {
      reply = p;
    },
  });
  assert(reply, `Missing offline asset handler: ${path}`);
  assert.deepEqual(
    Buffer.from(await (await reply).arrayBuffer()),
    await readFile('dist/assets/' + path),
    `Offline asset differs: ${path}`,
  );
}
for (const request of [
  new Request('https://api.open-meteo.com/v1/forecast'),
  new Request(origin + '/api/private'),
  new Request(origin + '/assets/' + paths[0] + '?variant=other'),
  new Request(origin + '/index.html', { method: 'POST' }),
]) {
  reply = undefined;
  listeners.get('fetch')({
    request,
    respondWith: (p) => {
      reply = p;
    },
  });
  assert.equal(reply, undefined, `Service worker must not intercept ${request.method} ${request.url}`);
}
const baseline = JSON.parse(await readFile(new URL('./build-budget-baseline.json', import.meta.url), 'utf8'));
console.log(formatBuildReport(report, baseline));
console.log('Offline assets with Vary: Origin, navigation fallback, and API exclusion passed.');
