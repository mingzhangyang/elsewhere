import { expect, test } from '@playwright/test';

/**
 * SM3-A proof only: import the isolated painter in the browser without registering
 * a route or a creator UI. Events are fictional; attached images are CI evidence.
 */
test('both palettes, both languages and long captions paint without clipping', async ({ page }, testInfo) => {
  await page.goto('/?scenario=day');
  for (const locale of ['en', 'zh-Hans'] as const) {
    for (const theme of ['midnight', 'paper'] as const) {
      const result = await page.evaluate(
        async ({ locale, theme }) => {
          const { createSkyArtwork } = await import('../../src/lib/skyArtwork.ts');
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
                altitude: 40,
                azimuth: 180,
                x: 0,
                y: 0.555,
                distanceKm: 150000000,
              },
              {
                kind: 'moon' as const,
                id: 'moon' as const,
                altitude: 30,
                azimuth: 90,
                x: -0.667,
                y: 0,
                phase: 'first-quarter' as const,
                illumination: 0.5,
                phaseAngle: 90,
                waxing: true,
                distanceKm: 385000,
              },
              {
                kind: 'planet' as const,
                id: 'venus' as const,
                altitude: 45,
                azimuth: 270,
                x: 0.5,
                y: 0,
                name: 'Venus',
                magnitude: -3.9,
                illumination: 0.7,
                phaseAngle: 45,
                distanceKm: 90000000,
                radiusKm: 6052,
                elongation: 65,
                apparition: 'evening' as const,
              },
              ...Array.from({ length: 120 }, (_, i) => {
                const theta = i * 2.399963229728653;
                const r = Math.sqrt((i + 0.5) / 121) * 0.94;
                return {
                  kind: 'star' as const,
                  id: 'hyg-' + (i + 1),
                  name: '',
                  altitude: 90 * (1 - r),
                  azimuth: ((theta * 180) / Math.PI + 360) % 360,
                  x: r * Math.cos(theta),
                  y: r * Math.sin(theta),
                  magnitude: 1 + i / 40,
                  colorIndex: 0.2 + (i % 6) * 0.25,
                };
              }),
            ],
          };
          const artwork = createSkyArtwork({
            event,
            snapshot,
            locale,
            theme,
            title: locale === 'en' ? 'An imaginary night, far away' : '想象中的一个美丽夜晚',
            phrase:
              locale === 'en'
                ? 'A small moment under an enormous sky, remembered in this fictional test.'
                : '这是一个虚构的纪念时刻，用来验证星图中文字的排版与留白。',
          });
          const canvas = document.createElement('canvas');
          canvas.width = 1200;
          canvas.height = 1500;
          canvas.id = 'sm3-visual-evidence';
          canvas.style.cssText =
            'position:fixed;left:0;top:0;width:min(480px,100vw);height:auto;z-index:999999';
          document.body.append(canvas);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas 2D unavailable');
          const fonts = await prepareSkyChartFonts();
          const layout = layoutSkyChartArtwork(artwork, canvasSkyChartTextMetrics(context), fonts);
          drawSkyChartArtwork(context, layout, fonts);
          const sample = context.getImageData(600, 498, 1, 1).data;
          return {
            size: [canvas.width, canvas.height],
            objects: layout.objects.length,
            blockEnds: layout.blocks.map((block) => block.top + block.lineHeight * block.lines.length),
            color: [...sample],
            science: layout.blocks[5].lines.join(' '),
            attribution: layout.blocks[7].lines.join(' '),
            reference: layout.blocks[3].lines.join(' '),
            fonts,
          };
        },
        { locale, theme },
      );
      expect(result.size).toEqual([1200, 1500]);
      expect(result.objects).toBe(123);
      expect(Math.max(...result.blockEnds)).toBeLessThan(1500);
      expect(result.attribution).toContain('CC BY-SA 4.0');
      expect(result.reference).toContain(locale === 'en' ? 'Reference time' : '参考时刻');
      expect(result.science).toContain(locale === 'en' ? 'Calculated' : '天体位置');
      const canvas = page.locator('#sm3-visual-evidence');
      await expect(canvas).toBeVisible();
      await testInfo.attach('sm3-a-' + theme + '-' + locale + '.png', {
        body: await canvas.screenshot({ animations: 'disabled', scale: 'css' }),
        contentType: 'image/png',
      });
      await canvas.evaluate((element) => element.remove());
    }
  }
});

test('a real HYG chart can paint directly from SM2-C ready state', async ({ page }, testInfo) => {
  await page.goto('/?scenario=day');
  const result = await page.evaluate(async () => {
    const { createSkyChartSnapshotCoordinator } = await import('../../src/services/skyChartSnapshot.ts');
    const { createSkyArtwork } = await import('../../src/lib/skyArtwork.ts');
    const { canvasSkyChartTextMetrics, drawSkyChartArtwork, layoutSkyChartArtwork, prepareSkyChartFonts } =
      await import('../../src/moment/skyChart.ts');
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
    if (state.status !== 'ready') throw new Error('SM2-C not ready: ' + state.status);
    const artwork = createSkyArtwork({ snapshot: state.snapshot, event, locale: 'en', theme: 'midnight' });
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1500;
    canvas.id = 'sm3-real-evidence';
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:min(480px,100vw);height:auto;z-index:999999';
    document.body.append(canvas);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D unavailable');
    const fonts = await prepareSkyChartFonts();
    const layout = layoutSkyChartArtwork(artwork, canvasSkyChartTextMetrics(context), fonts);
    drawSkyChartArtwork(context, layout, fonts);
    return {
      objects: layout.objects.length,
      stars: layout.objects.filter((object) => object.kind === 'star').length,
      sameCoordinates: layout.objects.every((object) => {
        const source = state.snapshot.objects.find((candidate) => candidate.id === object.id);
        return (
          source &&
          object.px === layout.disc.cx + source.x * layout.disc.radius &&
          object.py === layout.disc.cy + source.y * layout.disc.radius
        );
      }),
    };
  });
  expect(result.stars).toBeGreaterThan(100);
  expect(result.objects).toBeGreaterThan(result.stars);
  expect(result.sameCoordinates).toBe(true);
  await testInfo.attach('sm3-a-real-hyg-daytime.png', {
    body: await page.locator('#sm3-real-evidence').screenshot({ animations: 'disabled', scale: 'css' }),
    contentType: 'image/png',
  });
});
