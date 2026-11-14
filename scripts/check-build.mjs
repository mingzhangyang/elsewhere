import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const paths = await readdir('dist/assets');
let gzip = 0,
  largest = 0;
// The star catalog ships as a JSON asset fetched at runtime; it counts toward the download budget.
for (const path of paths.filter((p) => p.endsWith('.js') || p.endsWith('.json'))) {
  const content = await readFile('dist/assets/' + path);
  gzip += gzipSync(content).length;
  if (path.endsWith('.json')) continue;
  largest = Math.max(largest, content.length);
  assert(
    !content.includes('Deterministic unavailable-weather scenario'),
    'Development fixtures leaked into production',
  );
  assert(!content.includes('Simulate graphics loss'), 'Development controls leaked into production');
}
assert(gzip < 500000, `Total JS and data gzip ${gzip} exceeds 500 kB`);
assert(largest < 500000, `Largest JS chunk ${largest} exceeds 500 kB`);
assert((await readFile('dist/assets/moon-lroc.jpg')).length < 600000, 'Moon asset exceeds 600 kB');

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
  return new Response(await readFile('dist' + url.pathname), { headers: { Vary: 'Origin' } });
};
const caches = {
  keys: async () => [...stores.keys()],
  delete: async (key) => stores.delete(key),
  open: async (key) => {
    if (!stores.has(key)) stores.set(key, new Map());
    const store = stores.get(key);
    return {
      addAll: async (urls) => {
        for (const url of urls) {
          const request = new Request(url);
          store.set(request.url, { request, response: await fetchLocal(request) });
        }
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
assert.equal(await (await reply).text(), await readFile('dist/index.html', 'utf8'));
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
console.log(
  `Build budgets: JS and data ${Math.round(gzip / 1000)} kB gzip; largest chunk ${Math.round(largest / 1000)} kB. Offline assets with Vary: Origin, navigation fallback, and API exclusion passed.`,
);
