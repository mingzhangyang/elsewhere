import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const html = `<!doctype html><meta charset="utf-8">
<canvas id="illustration" width="640" height="480"></canvas>
<canvas id="chart" width="800" height="1000"></canvas>
<canvas id="minimal" width="800" height="800"></canvas>
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
  const canvas = document.querySelector('#illustration');
  await sdk.renderIllustration(canvas, scene, { composition: 'current' });

  const chart = document.querySelector('#chart');
  const snapshot = sdk.renderSkyChart(chart, scene, { theme: 'midnight' });
  const comparison = document.createElement('canvas');
  comparison.width = chart.width;
  comparison.height = chart.height;
  const faint = sdk.renderSkyChart(comparison, scene, { theme: 'midnight', limitingMagnitude: -5 });
  const sample = snapshot.objects.find((object) =>
    object.kind === 'star' && object.altitude > 20 && object.magnitude < 2 &&
    faint.objects.every((other) => Math.hypot(object.x - other.x, object.y - other.y) > 0.08));
  if (!sample) throw new Error('Fixture must have an isolated bright star');
  const alt = sample.altitude * Math.PI / 180;
  const az = sample.azimuth * Math.PI / 180;
  const radius = 1 - alt / (Math.PI / 2);
  const unit = 0.8;
  // Independently evaluate the north-up, east-left geometry of the 800x1000 chart.
  const px = Math.round(400 - radius * Math.sin(az) * 408 * unit);
  const py = Math.round((1000 - 57 * unit) / 2 - radius * Math.cos(az) * 408 * unit);
  const region = (target) => target.getContext('2d').getImageData(px - 2, py - 2, 5, 5).data;
  const expected = region(chart);
  const without = region(comparison);
  if (!expected.some((value, index) => value !== without[index])) {
    throw new Error('Calculated star position has no rendered pixels');
  }
  if (sdk.renderSkyChart(comparison, scene, { theme: 'paper' }).objects.length !== snapshot.objects.length) {
    throw new Error('Theme changed chart geometry');
  }
  if (chart.toDataURL() === comparison.toDataURL()) throw new Error('Themes are not distinct');

  const map = document.querySelector('#minimal');
  const bright = scene.sky.stars.filter((star) => star.altitude > 20 && star.magnitude <= 4);
  const pair = bright.flatMap((a) => bright.filter((b) =>
    a.id !== b.id && Math.abs(a.altitude - b.altitude) < 12 &&
    Math.abs(((a.azimuth - b.azimuth + 540) % 360) - 180) < 15 &&
    Math.hypot(a.altitude - b.altitude, ((a.azimuth - b.azimuth + 540) % 360) - 180) > 6
  ).slice(0, 1).map((b) => [a, b]))[0];
  if (!pair) throw new Error('Fixture must have two nearby bright stars');
  const patterns = [{ id: 'signature', lines: [[pair[0].id, pair[1].id]] }];
  const framed = sdk.renderMinimalSkyMap(map, scene, {
    composition: { pattern: 'signature' }, patterns, layers: { stars: true, lines: true },
  });
  comparison.width = map.width;
  comparison.height = map.height;
  sdk.renderMinimalSkyMap(comparison, framed, { composition: 'current', patterns: [], layers: { lines: true } });
  const project = sdk.createCoverProjection(framed.view, framed.aspect, map.width, map.height - 57).toCanvas;
  const a = project(pair[0].altitude, pair[0].azimuth);
  const b = project(pair[1].altitude, pair[1].azimuth);
  const mx = Math.round((a.x + b.x) / 2);
  const my = Math.round((a.y + b.y) / 2);
  if (!a.front || !b.front || mx < 2 || mx >= map.width - 2 || my < 2 || my >= map.height - 59) {
    throw new Error('Custom pattern is not framed');
  }
  const line = map.getContext('2d').getImageData(mx - 2, my - 2, 5, 5).data;
  const noLine = comparison.getContext('2d').getImageData(mx - 2, my - 2, 5, 5).data;
  if (!line.some((value, index) => value !== noLine[index])) throw new Error('Custom line pixels missing');
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
    const drawing = page.locator('#illustration');
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
    const images = await page.locator('canvas').evaluateAll((canvases) =>
      canvases.map((canvas) => (canvas as HTMLCanvasElement).toDataURL()),
    );
    expect(new Set(images).size).toBe(3);
    for (const id of ['chart', 'minimal']) {
      const stats = await page.locator('#' + id).evaluate((canvas: HTMLCanvasElement) => {
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let opaque = 0;
        const colors = new Set<number>();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 255) opaque++;
          colors.add(data[i] * 65536 + data[i + 1] * 256 + data[i + 2]);
        }
        return { opaque, pixels: canvas.width * canvas.height, colors: colors.size };
      });
      expect(stats.opaque).toBe(stats.pixels);
      expect(stats.colors).toBeGreaterThan(20);
    }
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
    const offlineImages = await page.locator('canvas').evaluateAll((canvases) =>
      canvases.map((canvas) => (canvas as HTMLCanvasElement).toDataURL()),
    );
    expect(offlineImages).toEqual(images);
    const offlineCount = requests.filter(
      (path) => path === '/' || path === '/sky-engine.mjs' || path === '/stars.json',
    ).length;
    expect(offlineCount).toBe(count);
    expect(unexpected).toEqual([]);
    expect(requests.filter((path) => !assets.has(path) && path !== '/favicon.ico')).toEqual([]);
    for (const [index, name] of ['illustration', 'chart', 'minimal'].entries()) {
      await info.attach('offline-sdk-' + name + '.png', {
        body: Buffer.from(images[index].split(',')[1], 'base64'),
        contentType: 'image/png',
      });
    }
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
