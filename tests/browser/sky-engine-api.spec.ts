import { expect, test } from '@playwright/test';

test('standalone SDK renders the same pixels as the shared panel and respects pattern overrides', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto('/?scenario=day');
  const result = await page.evaluate(async () => {
    const sdk = await import('../../packages/sky-engine/src/index.ts');
    const { fetchStarCatalog } = await import('../../src/services/starCatalog.ts');
    const scene = await sdk.createSkyScene({
      latitude: 40.7128,
      longitude: -74.006,
      timezone: 'America/New_York',
      instant: new Date('2026-09-18T04:00:00Z'),
      weather: 'clear',
      view: { heading: 180, altitude: 25, fov: 66 },
      aspect: 0.7,
      loadCatalog: fetchStarCatalog,
    });
    const make = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 800;
      return canvas;
    };
    const a = make();
    const b = make();
    const framed = await sdk.renderIllustration(a, scene, { composition: 'current' });
    sdk.paintIllustrationPanel(b.getContext('2d')!, b.width, b.height, scene);
    const pixels = (canvas: HTMLCanvasElement) =>
      canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const first = pixels(a);
    const second = pixels(b);
    let maxDifference = 0;
    let opaque = 0;
    for (let i = 0; i < first.length; i++) {
      maxDifference = Math.max(maxDifference, Math.abs(first[i] - second[i]));
      if (i % 4 === 3 && first[i] === 255) opaque++;
    }
    const stars = scene.sky.stars.filter((star) => {
      const p = sdk.createProjection(scene.view, scene.aspect)(star.altitude, star.azimuth);
      return star.altitude > 5 && p.front && Math.abs(p.x) < 0.5 && Math.abs(p.y) < 0.5;
    });
    if (stars.length < 2) throw new Error('Fixture needs two projected stars.');
    const custom = make();
    await sdk.renderIllustration(custom, scene, {
      composition: 'current',
      layers: { lines: true },
      patterns: [{ id: 'signature', lines: [[stars[0].id, stars[1].id]] }],
      paintFinish: false,
    });
    const none = make();
    await sdk.renderIllustration(none, scene, {
      composition: 'current',
      layers: { lines: true },
      patterns: [],
      paintFinish: false,
    });
    const cp = pixels(custom);
    const np = pixels(none);
    let changed = 0;
    for (let i = 0; i < cp.length; i++) if (cp[i] !== np[i]) changed++;
    return {
      maxDifference,
      opaque,
      expectedOpaque: a.width * a.height,
      changed,
      heading: framed.view.heading,
      image: a.toDataURL('image/png').split(',')[1],
    };
  });
  expect(result.maxDifference).toBeLessThanOrEqual(1);
  expect(result.opaque).toBe(result.expectedOpaque);
  expect(result.changed).toBeGreaterThan(0);
  expect(result.heading).toBe(180);
  if (info.project.name === 'chromium') {
    await info.attach('standalone-sdk.png', {
      body: Buffer.from(result.image, 'base64'),
      contentType: 'image/png',
    });
  }
});
