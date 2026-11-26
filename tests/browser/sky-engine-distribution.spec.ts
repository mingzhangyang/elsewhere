import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

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
  const project = sdk.advanced.createCoverProjection(framed.view, framed.aspect, map.width, map.height - 57).toCanvas;
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
  // Line-only mode must use the same projected coordinates, even with star dots hidden.
  const lineOnly = document.createElement('canvas');
  lineOnly.width = map.width;
  lineOnly.height = map.height;
  const off = { stars: false, lines: false, labels: false };
  sdk.renderMinimalSkyMap(lineOnly, framed, {
    composition: 'current', patterns, layers: { ...off, lines: true },
  });
  sdk.renderMinimalSkyMap(comparison, framed, {
    composition: 'current', patterns, layers: off,
  });
  const lineOnlyPixels = lineOnly.getContext('2d').getImageData(mx - 2, my - 2, 5, 5).data;
  const offPixels = comparison.getContext('2d').getImageData(mx - 2, my - 2, 5, 5).data;
  if (!lineOnlyPixels.some((value, index) => value !== offPixels[index])) {
    throw new Error('Turning off star dots also removed the pattern line');
  }
  // A real daytime Sun and nearby HYG star are both selected and in view.
  // An invalid Sun-star edge must not alter either the framing or any pixels.
  const day = await sdk.createSkyScene({
    latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York',
    instant: new Date('2026-03-20T17:00:00Z'), weather: 'clear',
  });
  if (day.sky.sun.altitude <= 0) throw new Error('Daytime regression fixture has no Sun');
  const dayView = {
    ...day, aspect: map.width / (map.height - 57),
    view: { heading: day.sky.sun.azimuth, altitude: day.sky.sun.altitude, fov: 66 },
  };
  const dayProject = sdk.advanced.createCoverProjection(
    dayView.view, dayView.aspect, map.width, map.height - 57,
  ).toCanvas;
  const sun = dayProject(day.sky.sun.altitude, day.sky.sun.azimuth);
  const nearby = day.sky.stars.find((star) => {
    if (star.altitude <= 0 || star.magnitude > 4.5) return false;
    const p = dayProject(star.altitude, star.azimuth);
    const distance = Math.hypot(p.x - sun.x, p.y - sun.y);
    return p.front && distance > 40 && distance < 250;
  });
  if (!nearby) throw new Error('Daytime regression fixture has no nearby selected star');
  const nonstellar = [{ id: 'invalid', lines: [['sun', nearby.id]] }];
  const bodyLayers = { stars: true, lines: true, labels: false };
  const rejected = sdk.renderMinimalSkyMap(lineOnly, dayView, {
    composition: { pattern: 'invalid' }, patterns: nonstellar, layers: bodyLayers,
  });
  sdk.renderMinimalSkyMap(comparison, dayView, {
    composition: 'current', patterns: [], layers: bodyLayers,
  });
  if (JSON.stringify(rejected.view) !== JSON.stringify(dayView.view) ||
      rejected.aspect !== dayView.aspect || lineOnly.toDataURL() !== comparison.toDataURL()) {
    throw new Error('A nonstellar pattern endpoint changed framing or pixels');
  }
  // Labels are an independent layer: center a named bright star whose label
  // region is clear of every other object that can paint into it. Faint catalog
  // stars do not count — dots are hidden, so they cannot mark the sample.
  const paintsLabel = (object) => object.kind !== 'star' || (object.name && object.magnitude <= 1.5);
  const named = snapshot.objects.find((object) =>
    object.kind === 'star' && object.name && object.magnitude <= 1.5 && object.altitude > 20 &&
    snapshot.objects.every((other) => other.id === object.id || !paintsLabel(other) ||
      Math.hypot(object.x - other.x, object.y - other.y) > 0.04));
  if (!named) throw new Error('Fixture must have an isolated named bright star');
  const namedView = {
    ...scene, aspect: map.width / (map.height - 57),
    view: { heading: named.azimuth, altitude: named.altitude, fov: 40 },
  };
  sdk.renderMinimalSkyMap(lineOnly, namedView, {
    composition: 'current', patterns: [], layers: { ...off, labels: true },
  });
  sdk.renderMinimalSkyMap(comparison, namedView, {
    composition: 'current', patterns: [], layers: off,
  });
  const labelRegion = (target) => target.getContext('2d').getImageData(406, 362, 48, 20).data;
  const label = labelRegion(lineOnly);
  const noLabel = labelRegion(comparison);
  if (!label.some((value, index) => value !== noLabel[index])) {
    throw new Error('Turning off star dots also removed the bright star label');
  }
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

/** Fixture failures set data-error instead of data-ready; surface that text instead of waiting out the timeout. */
async function expectDistributionReady(page: Page) {
  const body = page.locator('body');
  await expect
    .poll(async () => (await body.getAttribute('data-error')) ?? (await body.getAttribute('data-ready')), {
      timeout: 30000,
    })
    .not.toBeNull();
  expect(await body.getAttribute('data-error')).toBeNull();
}

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
    await expectDistributionReady(page);
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
    const images = await page
      .locator('canvas')
      .evaluateAll((canvases) => canvases.map((canvas) => (canvas as HTMLCanvasElement).toDataURL()));
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
    await expectDistributionReady(page);
    await expect(page.locator('body')).toHaveAttribute('data-stars', '5070');
    const offlineImages = await page
      .locator('canvas')
      .evaluateAll((canvases) => canvases.map((canvas) => (canvas as HTMLCanvasElement).toDataURL()));
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

const moonHtml = `<!doctype html><meta charset="utf-8">
<script type="module">
try {
  const sdk = await import('./sky-engine.mjs');
  const texture = await sdk.loadMoonTexture('./moon-lroc.jpg');
  sdk.installMoonTexture(texture);
  const dates = ['2026-03-19', '2026-03-22', '2026-03-25', '2026-03-29',
    '2026-04-02', '2026-04-06', '2026-04-10', '2026-04-14'];
  const phases = ['new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous',
    'full', 'waning-gibbous', 'last-quarter', 'waning-crescent'];
  const canvas = (size) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };
  const makeScene = (date, latitude = 40.7128, longitude = -74.006) => sdk.createSkyScene({
    latitude, longitude, timezone: 'UTC', instant: new Date(date + 'T18:00:00Z'),
    loadCatalog: async (signal) => sdk.decodeStarColumns(await (await fetch('./stars.json', { signal })).json()),
  });
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const metrics = [];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const toBody = (alt, az) => {
    const c = Math.cos((alt * Math.PI) / 180);
    return [c * Math.sin((az * Math.PI) / 180), Math.sin((alt * Math.PI) / 180), -c * Math.cos((az * Math.PI) / 180)];
  };
  const angularError = (actual, expected) => Math.abs(((actual - expected + 540) % 360) - 180);
  // Geometric Sun projected onto the portrait plane. Not the snapshot's refracted brightLimbAngle.
  const terminatorAngle = (sunAlt, sunAz, moonAlt, moonAz, north, orientation) => {
    const M = toBody(moonAlt, moonAz);
    const S = toBody(sunAlt, sunAz);
    const front = [-M[0], -M[1], -M[2]];
    const observerUp = cross(front, [Math.cos((moonAz * Math.PI) / 180), 0, Math.sin((moonAz * Math.PI) / 180)]);
    let up = observerUp;
    if (orientation === 'north-up') {
      const nlen = Math.hypot(...north);
      const n = [north[0] / nlen, north[1] / nlen, north[2] / nlen];
      const dep = dot(n, front);
      const proj = [n[0] - dep * front[0], n[1] - dep * front[1], n[2] - dep * front[2]];
      const plen = Math.hypot(...proj);
      up = [proj[0] / plen, proj[1] / plen, proj[2] / plen];
    }
    const right = cross(up, front);
    return (Math.atan2(dot(S, right), dot(S, up)) * 180) / Math.PI;
  };
  for (let i = 0; i < dates.length; i++) {
    const scene = await makeScene(dates[i]);
    const target = canvas(1024);
    target.id = phases[i];
    document.body.append(target);
    const start = performance.now();
    await sdk.renderMoonPhase(target, scene);
    const ms = performance.now() - start;
    const data = target.getContext('2d').getImageData(0, 0, 1024, 1024).data;
    let disk = 0, lit = 0, x = 0, y = 0;
    const colors = new Set();
    for (let j = 0; j < data.length; j += 4) {
      if (data[j+3] !== 255) continue;
      disk++;
      if (data[j]+data[j+1]+data[j+2] === 0) continue;
      lit++;
      x += j/4 % 1024 + 0.5 - 512;
      y += 512 - Math.floor(j/4/1024) - 0.5;
      colors.add(data[j]);
    }
    const f = scene.sky.moon.illumination;
    const angle = terminatorAngle(
      scene.sky.sun.geometricAltitude,
      scene.sky.sun.azimuth,
      scene.sky.moon.geometricAltitude,
      scene.sky.moon.azimuth,
      scene.sky.moon.north,
      'observer',
    );
    const centroid = Math.atan2(x, y) * 180 / Math.PI;
    const error = angularError(centroid, angle);
    check(scene.sky.moon.phase === phases[i], 'Unexpected phase ' + dates[i]);
    check(Math.abs(lit / disk - f) < 0.012, 'Incorrect illuminated area ' + phases[i]);
    check(error < 2, 'Incorrect bright-limb direction ' + phases[i]);
    check(colors.size > 50 && data[3] === 0, 'Texture or alpha missing ' + phases[i]);
    metrics.push({ phase: phases[i], f, area: lit / disk, directionError: error, ms, colors: colors.size });
  }

  // A directional synthetic map provides independent longitude/latitude and libration landmarks.
  const marker = new ImageData(256, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
    const j = (y * 256 + x) * 4;
    marker.data.set([x, y * 2, 64, 255], j);
  }
  const base = await makeScene('2026-03-25', -33.8688, 151.2093);
  const synthetic = (overrides = {}) => ({
    ...base, sky: { ...base.sky,
      sun: { ...base.sky.sun, azimuth: 90, geometricAltitude: 0 },
      moon: {
      ...base.sky.moon, azimuth: 0, geometricAltitude: 0, illumination: 1, brightLimbAngle: 90,
      north: [0, 1, 0], prime: [0, 0, 1], ...overrides,
    } },
  });
  const probe = canvas(256);
  const pixel = (x, y) => Array.from(probe.getContext('2d').getImageData(x, y, 1, 1).data);
  await sdk.renderMoonPhase(probe, synthetic(), { texture: marker });
  check(pixel(185,128)[0] > pixel(70,128)[0] + 20, 'Longitude mapping reversed');
  check(pixel(128,70)[1] < pixel(128,185)[1] - 20, 'Latitude mapping reversed');
  const centered = pixel(128,128)[0];
  await sdk.renderMoonPhase(probe, synthetic({ prime: [0.5, 0, Math.sqrt(0.75)] }), { texture: marker });
  check(pixel(128,128)[0] < centered - 15, 'Changing libration did not move texture');
  const tilted = synthetic({ north: [1, 0, 0] });
  await sdk.renderMoonPhase(probe, tilted, { texture: marker, orientation: 'observer' });
  check(pixel(185,128)[1] < pixel(70,128)[1] - 20, 'Observer roll lost');
  await sdk.renderMoonPhase(probe, tilted, { texture: marker, orientation: 'north-up' });
  check(pixel(128,70)[1] < pixel(128,185)[1] - 20, 'Lunar north not up');
  const quarter = synthetic({ illumination: 0.5 });
  await sdk.renderMoonPhase(probe, quarter, { texture: marker, background: 'light' });
  check(pixel(0,0)[3] === 255 && pixel(70,128)[0] === 0, 'Light background or dark side incorrect');
  await sdk.renderMoonPhase(probe, quarter, { texture: marker, earthshine: true, background: 'dark' });
  check(pixel(0,0)[0] === 12 && pixel(70,128)[0] > 0, 'Earthshine or dark background incorrect');

  // Near the horizon and near opposition, refraction rotates the apparent limb by about 11°
  // while the airless terminator stays put. The stored brightLimbAngle is that wrong apparent value.
  const uniform = new ImageData(32, 16);
  for (let i = 0; i < uniform.data.length; i += 4) uniform.data.set([180, 180, 180, 255], i);
  const sunAz = 175;
  const tiltedNorth = [0.6, 0.8, 0];
  const apparent = (() => {
    const d = Math.PI / 180;
    const sa = 0.483 * d, ba = 0.483 * d, az = sunAz * d;
    const right = Math.cos(sa) * Math.sin(az);
    const up = Math.sin(sa) * Math.cos(ba) - Math.cos(sa) * Math.sin(ba) * Math.cos(az);
    return Math.atan2(right, up) / d;
  })();
  const opposition = synthetic({
    azimuth: 0, geometricAltitude: 0, altitude: 0.483, illumination: 0.85,
    brightLimbAngle: apparent, north: tiltedNorth,
  });
  opposition.sky.sun = { ...opposition.sky.sun, azimuth: sunAz, geometricAltitude: 0, altitude: 0.483 };
  const expectedObserver = terminatorAngle(0, sunAz, 0, 0, tiltedNorth, 'observer');
  const expectedNorth = terminatorAngle(0, sunAz, 0, 0, tiltedNorth, 'north-up');
  check(angularError(expectedObserver, 90) < 0.001, 'Geometric observer limb');
  check(angularError(apparent, 79.07) < 0.05, 'Refracted limb fixture');
  check(angularError(apparent, expectedObserver) > 10, 'Fixture no longer separates refraction');
  check(angularError(expectedNorth, expectedObserver) > 20, 'North-up fixture did not rotate');
  const litCentroid = () => {
    const data = probe.getContext('2d').getImageData(0, 0, 256, 256).data;
    let x = 0, y = 0, n = 0;
    for (let j = 0; j < data.length; j += 4) {
      if (data[j + 3] !== 255 || data[j] + data[j + 1] + data[j + 2] === 0) continue;
      n++;
      x += (j / 4) % 256 + 0.5 - 128;
      y += 128 - Math.floor(j / 4 / 256) - 0.5;
    }
    return { angle: Math.atan2(x, y) * 180 / Math.PI, n };
  };
  await sdk.renderMoonPhase(probe, opposition, { texture: uniform, orientation: 'observer' });
  const observerHit = litCentroid();
  check(angularError(observerHit.angle, expectedObserver) < 2, 'Airless terminator ' + observerHit.angle);
  check(angularError(observerHit.angle, apparent) > 8, 'Used refracted bright limb');
  await sdk.renderMoonPhase(probe, opposition, { texture: uniform, orientation: 'north-up' });
  const northHit = litCentroid();
  check(angularError(northHit.angle, expectedNorth) < 2, 'North-up airless terminator ' + northHit.angle);
  check(angularError(northHit.angle, expectedObserver) > 20, 'North-up ignored lunar roll');

  const hd = canvas(4096);
  hd.id = 'moon-hd';
  document.body.append(hd);
  const start = performance.now();
  await sdk.renderMoonPhase(hd, base, { orientation: 'north-up', earthshine: true });
  const ms = performance.now() - start;
  check(hd.getContext('2d').getImageData(0,0,1,1).data[3] === 0, '4096 corner not transparent');
  check(hd.getContext('2d').getImageData(2048,2048,1,1).data[3] === 255, '4096 center not opaque');
  document.body.dataset.metrics = JSON.stringify({
    phases: metrics,
    hdMs: ms,
    opposition: {
      apparent,
      expectedObserver,
      expectedNorth,
      observer: observerHit.angle,
      northUp: northHit.angle,
    },
  });
  document.body.dataset.ready = 'true';
} catch (error) {
  document.body.dataset.error = String(error);
}
</script>`;

test('realistic lunar portraits preserve phase, axes, optional texture and offline pixels', async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'Standalone lunar distribution is checked in Chromium.');
  test.setTimeout(120000);
  const directory = join(process.cwd(), 'dist-sdk', 'release');
  const moonWorker = worker.replace("'/stars.json'", "'/stars.json', '/moon-lroc.jpg'");
  const assets = new Map([
    ['/', { type: 'text/html', content: Buffer.from(moonHtml) }],
    ['/sw.js', { type: 'text/javascript', content: Buffer.from(moonWorker) }],
    [
      '/sky-engine.mjs',
      { type: 'text/javascript', content: await readFile(join(directory, 'sky-engine.mjs')) },
    ],
    ['/stars.json', { type: 'application/json', content: await readFile(join(directory, 'stars.json')) }],
    ['/moon-lroc.jpg', { type: 'image/jpeg', content: await readFile(join(directory, 'moon-lroc.jpg')) }],
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
    await page.goto('http://127.0.0.1:' + address.port);
    await expectDistributionReady(page);
    const images = await page
      .locator('canvas:not(#moon-hd)')
      .evaluateAll((canvases) => canvases.map((canvas) => (canvas as HTMLCanvasElement).toDataURL()));
    expect(images).toHaveLength(8);
    const names = await page
      .locator('canvas:not(#moon-hd)')
      .evaluateAll((canvases) => canvases.map((c) => c.id));
    for (const [index, name] of names.entries()) {
      await info.attach('moon-' + name + '.png', {
        body: Buffer.from(images[index].split(',')[1], 'base64'),
        contentType: 'image/png',
      });
    }
    const hd = await page.locator('#moon-hd').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await info.attach('moon-4096-north-up.png', {
      body: Buffer.from(hd.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
    await info.attach('moon-pixel-metrics.json', {
      body: (await page.locator('body').getAttribute('data-metrics')) ?? '',
      contentType: 'application/json',
    });
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const count = requests.filter((path) => path === '/moon-lroc.jpg').length;
    await context.setOffline(true);
    await page.reload();
    await expectDistributionReady(page);
    const offline = await page
      .locator('canvas:not(#moon-hd)')
      .evaluateAll((canvases) => canvases.map((canvas) => (canvas as HTMLCanvasElement).toDataURL()));
    expect(offline).toEqual(images);
    expect(requests.filter((path) => path === '/moon-lroc.jpg')).toHaveLength(count);
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
