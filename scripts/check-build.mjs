import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const paths = await readdir('dist/assets');
let gzip = 0,
  largest = 0;
for (const path of paths.filter((p) => p.endsWith('.js'))) {
  const content = await readFile('dist/assets/' + path);
  gzip += gzipSync(content).length;
  largest = Math.max(largest, content.length);
  assert(
    !content.includes('Deterministic unavailable-weather scenario'),
    'Development fixtures leaked into production',
  );
  assert(!content.includes('Simulate graphics loss'), 'Development controls leaked into production');
}
assert(gzip < 500000, `Total JS gzip ${gzip} exceeds 500 kB`);
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
  return new Response(await readFile('dist' + url.pathname));
};
const caches = {
  keys: async () => [...stores.keys()],
  delete: async (key) => stores.delete(key),
  open: async (key) => {
    if (!stores.has(key)) stores.set(key, new Map());
    const store = stores.get(key);
    return {
      addAll: async (urls) => {
        for (const url of urls) store.set(url, await fetchLocal(url));
      },
      match: async (req) => store.get(typeof req === 'string' ? req : req.url)?.clone(),
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
reply = undefined;
listeners.get('fetch')({
  request: { url: 'https://api.open-meteo.com/v1/forecast', method: 'GET' },
  respondWith: (p) => {
    reply = p;
  },
});
assert.equal(reply, undefined, 'Service worker must not intercept third-party weather requests');
console.log(
  `Build budgets: JS ${Math.round(gzip / 1000)} kB gzip; largest chunk ${Math.round(largest / 1000)} kB. Offline manifest, navigation fallback, and API exclusion passed.`,
);
