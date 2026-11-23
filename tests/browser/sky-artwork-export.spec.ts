import { expect, test } from '@playwright/test';

/**
 * SM3-B visual evidence only. No SM3-C route or UI is installed.
 * Fictional event times are deliberately different from UTC calendar dates.
 */
test('encoded keepsakes preserve SM3-A layout, both themes and both languages', async ({
  page,
}, testInfo) => {
  await page.goto('/?scenario=day');
  for (const [theme, locale] of [
    ['midnight', 'en'],
    ['paper', 'zh-Hans'],
  ] as const) {
    const proof = await page.evaluate(
      async ({ theme, locale }) => {
        const { createSkyArtwork } = await import('../../src/lib/skyArtwork.ts');
        const { exportSkyChartPng } = await import('../../src/lib/skyArtworkExport.ts');
        const {
          canvasSkyChartTextMetrics,
          drawSkyChartArtwork,
          layoutSkyChartArtwork,
          prepareSkyChartFonts,
        } = await import('../../src/moment/skyChart.ts');
        const event = {
          state: 'resolved' as const,
          kind: 'reference' as const,
          localDate: '2026-06-21',
          reference: { localTime: '21:15', source: 'user' as const },
          utc: '2026-06-22T01:15:00.000Z',
          offset: '-04:00',
          disambiguation: null,
          location: {
            id: 'fictional-nyc',
            name: 'New York',
            country: 'United States',
            latitude: 40.71,
            longitude: -74.01,
            elevation: 10,
            timezone: 'America/New_York',
          },
        };
        const snapshot = {
          formatVersion: 1 as const,
          utc: event.utc,
          time: {
            kind: 'reference' as const,
            referenceSource: 'user' as const,
            offset: event.offset,
            disambiguation: null,
          },
          location: { ...event.location },
          options: { limitingMagnitude: 6 },
          provenance: {
            catalog: 'HYG v4.1 derivative' as const,
            catalogStarCount: 5070,
            calculation: 'calculateSky / astronomy-engine' as const,
            refraction: 'normal' as const,
            projection: 'azimuthal-equidistant' as const,
            selection: 'SM2-B' as const,
            catalogHash: null,
          },
          objects: [
            {
              kind: 'sun' as const,
              id: 'sun' as const,
              altitude: 45,
              azimuth: 0,
              x: 0,
              y: -0.5,
              distanceKm: 150000000,
            },
            {
              kind: 'moon' as const,
              id: 'moon' as const,
              altitude: 0,
              azimuth: 90,
              x: -1,
              y: 0,
              phase: 'first-quarter' as const,
              illumination: 0.5,
              phaseAngle: 90,
              waxing: true,
              distanceKm: 380000,
            },
            {
              kind: 'star' as const,
              id: 'hyg-1',
              name: '',
              altitude: 40,
              azimuth: 135,
              x: -0.4,
              y: 0.4,
              magnitude: 1,
              colorIndex: 0.3,
            },
          ],
        };
        const art = createSkyArtwork({
          event,
          snapshot,
          theme,
          locale,
          title: locale === 'en' ? 'An imaginary sky ✨' : '想象中那一夜的天空',
          phrase: locale === 'en' ? 'The stars remember an imaginary moment.' : '愿这份虚构的星光长存 🌙',
        });
        const fonts = await prepareSkyChartFonts();
        const preview = document.createElement('canvas');
        preview.width = 1200;
        preview.height = 1500;
        const previewCtx = preview.getContext('2d');
        if (!previewCtx) throw new Error('Canvas 2D unavailable for preview.');
        const layout = layoutSkyChartArtwork(art, canvasSkyChartTextMetrics(previewCtx), fonts);
        drawSkyChartArtwork(previewCtx, layout, fonts);
        const encoded = await exportSkyChartPng({
          artwork: art,
          prepareFonts: async () => fonts,
          requestId: 'proof',
        });
        const raw = new Uint8Array(await encoded.blob.slice(0, 24).arrayBuffer());
        const signature = [...raw.slice(0, 8)];
        const urlLease = encoded.objectUrl();
        const image = document.createElement('img');
        image.id = 'sm3-b-png-proof';
        image.style.cssText = 'position:fixed;left:0;top:0;width:min(480px,100vw);height:auto;z-index:999999';
        image.src = urlLease.url;
        document.body.append(image);
        await image.decode();
        const decoded = document.createElement('canvas');
        decoded.width = encoded.width;
        decoded.height = encoded.height;
        const ctx = decoded.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D unavailable for PNG decode.');
        ctx.drawImage(image, 0, 0);
        const points = [
          [0, 0],
          [600, 498],
          [600, 972],
          [600, 1453],
        ] as const;
        const drift = points.map(([x, y]) => {
          const a = previewCtx.getImageData(x, y, 1, 1).data;
          const b = ctx.getImageData(x, y, 1, 1).data;
          return Math.max(...Array.from(a).map((value, i) => Math.abs(value - b[i])));
        });
        const colors = points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
        const result = {
          size: [image.naturalWidth, image.naturalHeight],
          blobSize: encoded.blob.size,
          mime: encoded.blob.type,
          file: encoded.file.name,
          signature,
          drift,
          colors,
          objectCount: layout.objects.length,
          positionsUnchanged: layout.objects.every((o) => {
            const original = snapshot.objects.find((value) => value.id === o.id);
            return original && o.px === 600 + original.x * 418 && o.py === 498 + original.y * 418;
          }),
          text: layout.blocks.flatMap((b) => b.lines).join(' '),
          compass: layout.compass.map((item) => item.text),
        };
        // Keep the lease alive for the screenshot; the test releases it just afterward.
        (image as HTMLImageElement & { releaseArtwork?: () => void }).releaseArtwork = () => {
          urlLease.release();
          encoded.release();
        };
        return result;
      },
      { theme, locale },
    );
    expect(proof.size).toEqual([1200, 1500]);
    expect(proof.blobSize).toBeGreaterThan(2000);
    expect(proof.mime).toBe('image/png');
    expect(proof.file).toBe('elsewhere-sky-2026-06-21.png');
    expect(proof.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(proof.drift.every((value) => value <= 3)).toBe(true);
    expect(new Set(proof.colors.map((v) => v.join(','))).size).toBeGreaterThan(1);
    expect(proof.objectCount).toBe(3);
    expect(proof.positionsUnchanged).toBe(true);
    expect(proof.text).toContain('CC BY-SA 4.0');
    expect(proof.text).toContain('Astronomy Engine');
    expect(proof.text).toContain('21:15');
    expect(proof.text).toContain(
      'Reference time'.replace('Reference time', locale === 'en' ? 'Reference time' : '参考时刻'),
    );
    expect(proof.compass).toEqual(locale === 'en' ? ['N', 'E', 'S', 'W'] : ['北', '东', '南', '西']);
    await testInfo.attach('sm3-b-export-' + theme + '-' + locale + '.png', {
      body: await page.locator('#sm3-b-png-proof').screenshot({ scale: 'css' }),
      contentType: 'image/png',
    });
    await page.locator('#sm3-b-png-proof').evaluate((element) => {
      (element as HTMLImageElement & { releaseArtwork?: () => void }).releaseArtwork?.();
      element.remove();
    });
  }
});

test('real HYG snapshot can be encoded as PNG without recomputing star positions', async ({
  page,
}, testInfo) => {
  await page.goto('/?scenario=day');
  const proof = await page.evaluate(async () => {
    const { createSkyChartSnapshotCoordinator } = await import('../../src/services/skyChartSnapshot.ts');
    const { createSkyArtwork } = await import('../../src/lib/skyArtwork.ts');
    const { exportSkyChartPng } = await import('../../src/lib/skyArtworkExport.ts');
    const event = {
      state: 'resolved' as const,
      kind: 'exact' as const,
      localDate: '2026-06-21',
      localTime: '12:00',
      utc: '2026-06-21T16:00:00.000Z',
      offset: '-04:00',
      disambiguation: null,
      location: {
        id: 'fictional-nyc',
        name: 'New York',
        country: 'United States',
        latitude: 40.71,
        longitude: -74.01,
        elevation: 10,
        timezone: 'America/New_York',
      },
    };
    const state = await createSkyChartSnapshotCoordinator().generate({ time: event });
    if (state.status !== 'ready') throw new Error('HYG catalog not ready: ' + state.status);
    const source = state.snapshot.objects.map((obj) => [obj.id, obj.x, obj.y]);
    const artwork = createSkyArtwork({ snapshot: state.snapshot, event, locale: 'en', theme: 'midnight' });
    const output = await exportSkyChartPng({ artwork });
    const lease = output.objectUrl();
    const image = document.createElement('img');
    image.id = 'sm3-b-hyg-proof';
    image.style.cssText = 'position:fixed;left:0;top:0;width:min(480px,100vw);height:auto;z-index:999999';
    image.src = lease.url;
    document.body.append(image);
    await image.decode();
    const result = {
      dimensions: [image.naturalWidth, image.naturalHeight],
      stars: state.snapshot.objects.filter((obj) => obj.kind === 'star').length,
      unchanged:
        JSON.stringify(source) ===
        JSON.stringify(state.snapshot.objects.map((obj) => [obj.id, obj.x, obj.y])),
      filename: output.filename,
    };
    (image as HTMLImageElement & { releaseArtwork?: () => void }).releaseArtwork = () => {
      lease.release();
      output.release();
    };
    return result;
  });
  expect(proof.dimensions).toEqual([1200, 1500]);
  expect(proof.stars).toBeGreaterThan(100);
  expect(proof.unchanged).toBe(true);
  expect(proof.filename).toBe('elsewhere-sky-2026-06-21.png');
  await testInfo.attach('sm3-b-real-hyg.png', {
    body: await page.locator('#sm3-b-hyg-proof').screenshot({ scale: 'css' }),
    contentType: 'image/png',
  });
  await page.locator('#sm3-b-hyg-proof').evaluate((element) => {
    (element as HTMLImageElement & { releaseArtwork?: () => void }).releaseArtwork?.();
    element.remove();
  });
});

test('browser download requests original PNG from a genuine button click, and share cancel is distinct', async ({
  page,
}) => {
  await page.goto('/?scenario=day');
  const behavior = await page.evaluate(async () => {
    const { SkyArtworkPng } = await import('../../src/lib/skyArtworkExport.ts');
    const { downloadSkyArtwork, shareSkyArtwork, skyArtworkShareCapability } = await import(
      '../../src/lib/skyArtworkDelivery.ts'
    );
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 15;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unsupported');
    ctx.fillStyle = '#193659';
    ctx.fillRect(0, 0, 12, 15);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('No PNG'))), 'image/png'),
    );
    const file = new SkyArtworkPng(blob, 'elsewhere-sky-2026-06-21.png', 12, 15, 4);
    const native = {
      canShare: () => true,
      share: () => Promise.reject(new DOMException('cancel', 'AbortError')),
    };
    const capability = skyArtworkShareCapability(file, native);
    const share = await shareSkyArtwork(file, native);
    const button = document.createElement('button');
    button.id = 'sm3-b-gesture-download';
    button.textContent = 'Download PNG';
    button.addEventListener('click', () => {
      button.dataset.status = downloadSkyArtwork(file).status;
    });
    document.body.append(button);
    return { capability, share };
  });
  expect(behavior.capability).toBe('files');
  expect(behavior.share).toBe('cancelled');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PNG' }).click(),
  ]);
  expect((await page.locator('#sm3-b-gesture-download').getAttribute('data-status'))).toBe(
    'download-requested',
  );
  expect(download.suggestedFilename()).toBe('elsewhere-sky-2026-06-21.png');
});
