import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const html = `<!doctype html><meta charset="utf-8"><canvas width="640" height="480"></canvas>
<script type="module">
try {
  const sdk = await import('./sky-engine.mjs');
  const scene = await sdk.createSkyScene({
    latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York',
    instant: new Date('2026-09-18T04:00:00Z'), weather: 'clear',
    view: { heading: 180, altitude: 25, fov: 66 }, aspect: 4 / 3,
    loadCatalog: async (signal) => {
      const response = await fetch('./stars.json', { signal });
      if (!response.ok) throw new Error('Catalog unavailable');
      return sdk.decodeStarColumns(await response.json());
    },
  });
  const canvas = document.querySelector('canvas');
  await sdk.renderIllustration(canvas, scene, { composition: 'current' });
  document.body.dataset.stars = scene.sky.stars.length;
  document.body.dataset.ready = 'true';
} catch (error) {
  document.body.dataset.error = String(error);
}
</script>`;

// An independent host, not Vite or Elsewhere. Its host owns the offline caching policy.
const worker = `const cacheName = 'sdk-smoke-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) =>
    cache.addAll(['/', '/sky-engine.mjs', '/stars.json'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
});`;

test('published browser ESM works on an independent host, including offline reload', async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'Standalone offline distribution is checked in Chromium.');
  test.setTimeout(90000);
  const directory = join(process.cwd(), 'dist-sdk', 'release');
  const assets = new Map([
    ['/', { type: 'text/html', content: Buffer.from(html) }],
    ['/sw.js', { type: 'text/javascript', content: Buffer.from(worker) }],
    [
      '/sky-engine.mjs',
      { type: 'text/javascript', content: await readFile(join(directory, 'sky-engine.mjs')) },
    ],
    ['/stars.json', { type: 'application/json', content: await readFile(join(directory, 'stars.json')) }],
  ]);
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const path = req.url ?? '/';
    requests.push(path);
    const asset = assets.get(path);
    if (!asset) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'no-store' }).end(asset.content);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    const origin = 'http://127.0.0.1:' + address.port;
    const unexpected: string[] = [];
    context.on('request', (request) => {
      if (!request.url().startsWith(origin + '/')) unexpected.push(request.url());
    });
    // Force the bundled fallback even on browsers with native Temporal.
    await page.addInitScript(() =>
      Object.defineProperty(globalThis, 'Temporal', { value: undefined, configurable: true }),
    );
    await page.goto(origin);
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
    await expect(page.locator('body')).toHaveAttribute('data-stars', '5070');
    const drawing = page.locator('canvas');
    const metrics = await drawing.evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0;
      const colors = new Set<number>();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 255) opaque++;
        colors.add(data[i] * 65536 + data[i + 1] * 256 + data[i + 2]);
      }
      return { opaque, pixels: canvas.width * canvas.height, colors: colors.size };
    });
    expect(metrics.opaque).toBe(metrics.pixels);
    expect(metrics.colors).toBeGreaterThan(100);
    const image = await drawing.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const count = requests.filter(
      (path) => path === '/' || path === '/sky-engine.mjs' || path === '/stars.json',
    ).length;
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
    await expect(page.locator('body')).toHaveAttribute('data-stars', '5070');
    const offlineImage = await drawing.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    expect(offlineImage).toBe(image);
    const offlineCount = requests.filter(
      (path) => path === '/' || path === '/sky-engine.mjs' || path === '/stars.json',
    ).length;
    expect(offlineCount).toBe(count);
    expect(unexpected).toEqual([]);
    expect(requests.filter((path) => !assets.has(path) && path !== '/favicon.ico')).toEqual([]);
    await info.attach('offline-sdk.png', {
      body: Buffer.from(image.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
