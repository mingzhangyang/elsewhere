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

// Startup: the entry chunk, what it imports statically, and one language catalog with its imports.
// Everything else (renderer, three.js, star catalog, time-zone lookup, the other language) loads later.
const STARTUP_BUDGET = 115000;
const LANGUAGE_BUDGET = 15000;
const html = await readFile('dist/index.html', 'utf8');
const entry = html.match(/src="\/assets\/(index-[\w-]+\.js)"/)?.[1];
assert(entry, 'Entry chunk not found in index.html');
const sizes = new Map();
const gzipOf = async (path) => {
  if (!sizes.has(path)) sizes.set(path, gzipSync(await readFile('dist/assets/' + path)).length);
  return sizes.get(path);
};
/** A chunk and its static imports, recursively (dynamic `import()` calls are not followed). */
const staticGraph = async (path, seen = new Set()) => {
  if (seen.has(path)) return seen;
  seen.add(path);
  const code = await readFile('dist/assets/' + path, 'utf8');
  for (const [, dep] of code.matchAll(/(?:from|import)\s*"\.\/([\w.-]+\.js)"/g)) await staticGraph(dep, seen);
  return seen;
};
const startupChunks = await staticGraph(entry);
const entryCode = await readFile('dist/assets/' + entry, 'utf8');
assert(!/from\s*"\.\/three-/.test(entryCode), 'three.js must not load at startup');
const languages = paths.filter((p) => /^(en|zh-Hans)-[\w-]{8}\.js$/.test(p));
assert.equal(languages.length, 2, 'Each language must be its own chunk');
let startup = 0;
for (const chunk of startupChunks) startup += await gzipOf(chunk);
let languageStartup = 0;
for (const language of languages) {
  const own = await gzipOf(language);
  assert(own < LANGUAGE_BUDGET, `${language} is ${own} bytes gzip, over ${LANGUAGE_BUDGET}`);
  let extra = 0;
  for (const chunk of await staticGraph(language))
    if (!startupChunks.has(chunk)) extra += await gzipOf(chunk);
  languageStartup = Math.max(languageStartup, extra);
}
for (const chunk of startupChunks)
  for (const text of ['Below the horizon', '天狼星'])
    assert(!(await readFile('dist/assets/' + chunk, 'utf8')).includes(text), `Catalog text in ${chunk}`);
startup += languageStartup;
assert(startup < STARTUP_BUDGET, `Startup JavaScript ${startup} bytes gzip exceeds ${STARTUP_BUDGET}`);
const moonMap = paths.find((p) => /^moon-lroc-[\w-]{8}\.jpg$/.test(p));
assert(moonMap, 'Moon map missing or not content-hashed');
assert((await readFile('dist/assets/' + moonMap)).length < 600000, 'Moon asset exceeds 600 kB');
// Cloudflare serves everything under /assets/ as immutable (public/_headers), so every file there must be content-hashed.
for (const path of paths) assert(/-[\w-]{8}\.\w+$/.test(path), `Unhashed file under dist/assets: ${path}`);

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
console.log(
  `Build budgets: JS and data ${Math.round(gzip / 1000)} kB gzip; startup ${Math.round(startup / 1000)} kB gzip with the larger language; largest chunk ${Math.round(largest / 1000)} kB. Offline assets with Vary: Origin, navigation fallback, and API exclusion passed.`,
);
