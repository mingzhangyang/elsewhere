import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// The published module renders the four image kinds inside a module Worker, into OffscreenCanvas,
// with ImageBitmap landscape artwork and a Moon texture decoded there. Labels stay on: both sides
// load the same web font (a Worker cannot see document.fonts), so the comparison also covers the
// illustration's lettering; the charts' fixed system-ui captions use the same system font in both.
//
// The Worker's pixels must equal the main thread's exactly when both draw into an OffscreenCanvas.
// Against a DOM canvas, Chromium itself rasterises a few operations slightly differently (a shadow
// drawn inside a clip, for example, differs on a 2-D canvas element and an OffscreenCanvas with no
// Sky Engine code involved), so that comparison allows a small, bounded difference; the Moon
// portrait and the minimal map have no such operations and must match exactly there too.
const shared = `
async function renderAll(sdk, makeCanvas, fonts) {
  const font = new FontFace('Sky Worker Test', 'url(./label.woff2)', { weight: '600' });
  fonts.add(font);
  await font.load();
  const catalog = async (signal) => sdk.decodeStarColumns(await (await fetch('./stars.json', { signal })).json());
  const observer = {
    latitude: 46.55, longitude: 7.98, timezone: 'Europe/Zurich',
    instant: new Date('2026-01-14T19:30:00Z'), aspect: 4 / 3, loadCatalog: catalog,
    view: { heading: 120, altitude: 22, fov: 70 },
    layers: { stars: true, lines: true, labels: true },
  };
  const clear = await sdk.createSkyScene({ ...observer, weather: 'clear' });
  const cloudy = await sdk.createSkyScene({
    ...observer,
    weather: { ...sdk.defaultWeatherValues(), cloudCover: 55, visibilityKm: 30 },
  });
  const valley = await createImageBitmap(await (await fetch('./valley.webp')).blob());
  sdk.installMoonTexture(await sdk.loadMoonTexture('./moon-lroc.jpg'));
  const read = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const out = {};
  let canvas = makeCanvas(640, 480);
  await sdk.renderIllustration(canvas, clear, {
    composition: 'current', landscape: 'mountains', landscapeArt: valley, font: '"Sky Worker Test"',
  });
  out.illustration = read(canvas);
  canvas = makeCanvas(640, 480);
  await sdk.renderIllustration(canvas, cloudy, {
    composition: 'current', landscape: 'mountains',
    loadLandscape: async () => valley, font: '"Sky Worker Test"',
  });
  out.clouds = read(canvas);
  canvas = makeCanvas(600, 750);
  sdk.renderSkyChart(canvas, clear, { theme: 'midnight' });
  out.chart = read(canvas);
  canvas = makeCanvas(600, 600);
  sdk.renderMinimalSkyMap(canvas, clear, { composition: 'current', layers: { lines: true, labels: true } });
  out.map = read(canvas);
  canvas = makeCanvas(512, 512);
  await sdk.renderMoonPhase(canvas, clear, { background: 'dark', earthshine: true });
  out.moon = read(canvas);
  return out;
}`;

const workerScript = `import * as sdk from './sky-engine.mjs';
${shared}
self.onmessage = async () => {
  try {
    if (typeof document !== 'undefined') throw new Error('A Worker has no document');
    const out = await renderAll(sdk, (width, height) => new OffscreenCanvas(width, height), self.fonts);
    self.postMessage({ out }, Object.values(out).map((data) => data.buffer));
  } catch (error) {
    self.postMessage({ error: String(error && error.stack || error) });
  }
};`;

const html = `<!doctype html><meta charset="utf-8">
<script type="module">
import * as sdk from './sky-engine.mjs';
${shared}
try {
  const dom = await renderAll(sdk, (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }, document.fonts);
  const offscreen = await renderAll(sdk, (width, height) => new OffscreenCanvas(width, height), document.fonts);
  const worker = new Worker('./worker.mjs', { type: 'module' });
  const reply = await new Promise((resolve) => {
    worker.onmessage = (event) => resolve(event.data);
    worker.onerror = (event) => resolve({ error: event.message || 'Worker failed to start' });
    worker.postMessage('render');
  });
  if (reply.error) throw new Error('Worker: ' + reply.error);
  const compare = (expected, actual) => {
    let differing = 0;
    let max = 0;
    let opaque = 0;
    for (let i = 0; i < expected.length; i++) {
      const difference = Math.abs(expected[i] - actual[i]);
      if (difference) differing++;
      if (difference > max) max = difference;
      if (i % 4 === 3 && expected[i] === 255) opaque++;
    }
    return { bytes: expected.length, sameLength: expected.length === actual.length, differing, max, opaque };
  };
  const results = {};
  for (const name of Object.keys(dom)) {
    results[name] = {
      offscreen: compare(offscreen[name], reply.out[name]),
      dom: compare(dom[name], reply.out[name]),
    };
  }
  document.body.dataset.results = JSON.stringify(results);
} catch (error) {
  document.body.dataset.error = String(error && error.stack || error);
}
</script>`;

test('Worker rendering into OffscreenCanvas matches the main thread', async ({ page }, info) => {
  test.skip(
    !['chromium', 'mobile-chromium'].includes(info.project.name),
    'Worker pixels are compared in Chromium, where Worker and page share one font stack; other ' +
      'engines may resolve the charts’ fixed system-ui captions differently in a Worker.',
  );
  test.setTimeout(90000);
  const release = join(process.cwd(), 'dist-sdk', 'release');
  const assets = new Map([
    ['/', { type: 'text/html', content: Buffer.from(html) }],
    ['/worker.mjs', { type: 'text/javascript', content: Buffer.from(workerScript) }],
    [
      '/sky-engine.mjs',
      { type: 'text/javascript', content: await readFile(join(release, 'sky-engine.mjs')) },
    ],
    ['/stars.json', { type: 'application/json', content: await readFile(join(release, 'stars.json')) }],
    ['/moon-lroc.jpg', { type: 'image/jpeg', content: await readFile(join(release, 'moon-lroc.jpg')) }],
    [
      '/valley.webp',
      {
        type: 'image/webp',
        content: await readFile(join(process.cwd(), 'src/assets/valley/winter-night.webp')),
      },
    ],
    [
      '/label.woff2',
      {
        type: 'font/woff2',
        content: await readFile(
          join(process.cwd(), 'node_modules/@fontsource/caveat/files/caveat-latin-600-normal.woff2'),
        ),
      },
    ],
  ]);
  const server = createServer((req, res) => {
    const asset = assets.get(req.url ?? '/');
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
    await page.goto('http://127.0.0.1:' + address.port);
    const body = page.locator('body');
    await expect
      .poll(
        async () => (await body.getAttribute('data-error')) ?? (await body.getAttribute('data-results')),
        {
          timeout: 60000,
        },
      )
      .not.toBeNull();
    expect(await body.getAttribute('data-error')).toBeNull();
    type Comparison = { bytes: number; sameLength: boolean; differing: number; max: number; opaque: number };
    const results = JSON.parse((await body.getAttribute('data-results'))!) as Record<
      string,
      { offscreen: Comparison; dom: Comparison }
    >;
    await info.attach('worker-pixel-comparison.json', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });
    expect(Object.keys(results).sort()).toEqual(['chart', 'clouds', 'illustration', 'map', 'moon']);
    for (const [name, { offscreen, dom }] of Object.entries(results)) {
      for (const result of [offscreen, dom]) {
        expect(result.sameLength, name).toBe(true);
        // Each image is substantial, not an empty canvas on both sides.
        expect(result.opaque, name).toBeGreaterThan(result.bytes / 4 / 10);
      }
      expect({ name, differing: offscreen.differing }).toEqual({ name, differing: 0 });
      if (name === 'moon' || name === 'map') {
        expect({ name, differing: dom.differing }).toEqual({ name, differing: 0 });
      } else {
        expect(dom.differing / dom.bytes, name).toBeLessThan(0.005);
        expect(dom.max, name).toBeLessThanOrEqual(24);
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
