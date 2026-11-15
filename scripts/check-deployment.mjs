// Smoke-test a deployed origin: the app, cache headers from public/_headers, and the files
// the service worker needs. Usage: node scripts/check-deployment.mjs https://elsewhere.orangely.xyz
// Retries for a few minutes, because a new custom domain can take that long to get its certificate.
import assert from 'node:assert/strict';

const origin = new URL(process.argv[2] ?? 'https://elsewhere.orangely.xyz').origin;
const attempts = Number(process.env.DEPLOY_CHECK_ATTEMPTS ?? 12);

async function get(path) {
  const response = await fetch(origin + path, {
    redirect: 'follow',
    headers: { 'Cache-Control': 'no-cache' },
  });
  return { response, cache: response.headers.get('cache-control') ?? '' };
}

async function check() {
  const home = await get('/');
  assert.equal(home.response.status, 200, '/ status');
  assert.match(home.cache, /no-cache/, '/ must revalidate');
  const html = await home.response.text();
  // Cloudflare's Bot Fight Mode, JavaScript detections and Web Analytics add scripts to HTML at the edge.
  // public/credits.html promises no analytics and no background tracking, so nothing may be injected.
  const injected = [...new Set(html.match(/\/cdn-cgi\/[\w./-]+|static\.cloudflareinsights\.com/g) ?? [])];
  assert.deepEqual(
    injected,
    [],
    'Cloudflare injected scripts into the page; see docs/RELEASE.md, one-time setup',
  );
  const script = html.match(/\/assets\/[\w.-]+\.js/)?.[0];
  assert(script, 'index.html references no hashed script');

  const asset = await get(script);
  assert.equal(asset.response.status, 200, `${script} status`);
  assert.match(asset.cache, /immutable/, `${script} must be immutable`);

  const worker = await get('/sw.js');
  assert.equal(worker.response.status, 200, '/sw.js status');
  assert.match(worker.cache, /no-cache/, '/sw.js must revalidate');
  const manifest = await worker.response.text();
  for (const path of JSON.parse(manifest.match(/const FILES=(\[.*?\])/)[1])) {
    const { response } = await get('/' + path);
    assert.equal(response.status, 200, `Precached /${path} status`);
    await response.body?.cancel();
  }

  const hidden = await get('/_headers');
  assert.equal(hidden.response.status, 404, '/_headers must not be served');
  return manifest.match(/const CACHE="([^"]+)"/)?.[1];
}

for (let attempt = 1; ; attempt += 1) {
  try {
    const cache = await check();
    console.log(`Deployment at ${origin} passed (service worker cache ${cache}).`);
    break;
  } catch (error) {
    if (attempt >= attempts) throw error;
    console.log(`Attempt ${attempt} failed: ${error.message}. Retrying in 20 s.`);
    await new Promise((resolve) => setTimeout(resolve, 20000));
  }
}
