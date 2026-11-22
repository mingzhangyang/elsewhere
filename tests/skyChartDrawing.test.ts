import { beforeAll, describe, expect, it, vi } from 'vitest';
import rows from '../src/data/stars.json';
import { calculateSky } from '../src/domain/astronomy';
import { buildPreparedSkyChartSnapshot, type SkyChartSnapshot } from '../src/domain/skyChartSnapshot';
import { loadStarCatalog, type CatalogRow } from '../src/domain/stars';
import { prepareSkyChartSnapshotRequest } from '../src/services/skyChartSnapshot';
import {
  SKY_CHART_ARTWORK_SIZE,
  SKY_CHART_PALETTES,
  SkyChartLayoutError,
  drawSkyChartArtwork,
  layoutSkyChartArtwork,
  prepareSkyChartFonts,
  type SkyChartFonts,
  type SkyChartTextMetrics,
} from '../src/moment/skyChart';
import { createSkyArtwork } from '../src/lib/skyArtwork';
import { NEW_YORK, SYDNEY } from './fixtures/locations';
import type { MemorialTime } from '../src/lib/memorialTime';

const event: MemorialTime = {
  state: 'resolved',
  kind: 'exact',
  localDate: '2026-06-21',
  localTime: '12:00',
  utc: '2026-06-21T16:00:00.000Z',
  offset: '-04:00',
  disambiguation: null,
  location: NEW_YORK,
};
function fixture(eventTime: MemorialTime = event): SkyChartSnapshot {
  return {
    formatVersion: 1,
    utc: eventTime.utc,
    time: {
      kind: eventTime.kind,
      offset: eventTime.offset,
      disambiguation: eventTime.disambiguation,
      ...(eventTime.kind === 'reference' ? { referenceSource: eventTime.reference.source } : {}),
    },
    location: { ...eventTime.location },
    options: { limitingMagnitude: 6 },
    provenance: {
      catalog: 'HYG v4.1 derivative',
      catalogStarCount: 5070,
      calculation: 'calculateSky / astronomy-engine',
      refraction: 'normal',
      projection: 'azimuthal-equidistant',
      selection: 'SM2-B',
      catalogHash: null,
    },
    objects: [
      { kind: 'sun', id: 'sun', altitude: 45, azimuth: 0, x: 0, y: -0.5, distanceKm: 150000000 },
      {
        kind: 'moon',
        id: 'moon',
        altitude: 0,
        azimuth: 90,
        x: -1,
        y: 0,
        phase: 'waning-crescent',
        phaseAngle: 45,
        illumination: 0.2,
        waxing: false,
        distanceKm: 380000,
      },
      {
        kind: 'planet',
        id: 'mars',
        altitude: 45,
        azimuth: 180,
        x: 0,
        y: 0.5,
        name: 'Mars',
        magnitude: 1,
        illumination: 0.9,
        phaseAngle: 18,
        distanceKm: 240000000,
        radiusKm: 3389,
        elongation: 90,
        apparition: 'evening',
      },
      {
        kind: 'star',
        id: 'hyg-100',
        name: 'Synthetic',
        altitude: 45,
        azimuth: 270,
        x: 0.5,
        y: 0,
        magnitude: 2,
        colorIndex: 0.1,
      },
    ],
  };
}

const fonts: SkyChartFonts = Object.freeze({ status: 'ready', family: 'system-ui' });

const metrics: SkyChartTextMetrics = {
  measure(text, font) {
    const size = Number(/\d+(?=px)/u.exec(font)?.[0] ?? 16);
    return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].reduce(
      (width, { segment }) =>
        width +
        (/\p{Script=Han}|\p{Extended_Pictographic}/u.test(segment)
          ? size
          : size * (segment === ' ' ? 0.32 : segment === 'W' ? 0.88 : 0.56)),
      0,
    );
  },
};

function makeLayout(
  theme: 'midnight' | 'paper' = 'midnight',
  locale: 'en' | 'zh-Hans' = 'en',
  snapshot = fixture(),
  text: { title?: string; phrase?: string } = {},
  civil = event,
) {
  const artwork = createSkyArtwork({ snapshot, event: civil, locale, theme, ...text });
  return layoutSkyChartArtwork(artwork, metrics, fonts);
}

interface RecordedCall {
  method: string;
  args: (string | number)[];
  fillStyle: string;
  font: string;
}

/** Records Canvas commands without assuming a DOM or device pixel ratio. */
function recordingContext(width = 1200, height = 1500) {
  const calls: RecordedCall[] = [];
  const state = {
    canvas: { width, height },
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textBaseline: 'top',
    textAlign: 'center',
    globalAlpha: 1,
  };
  const ctx = new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name as keyof typeof target];
      if (name === 'measureText') {
        return (text: string) => ({ width: text.length * 8 });
      }
      if (name === 'createLinearGradient' || name === 'createRadialGradient') {
        return (...args: number[]) => {
          calls.push({ method: String(name), args, fillStyle: state.fillStyle, font: state.font });
          return { addColorStop: (_offset: number, _color: string) => undefined };
        };
      }
      return (...args: (string | number)[]) => {
        calls.push({ method: String(name), args, fillStyle: state.fillStyle, font: state.font });
      };
    },
    set(target, name, value) {
      (target as unknown as Record<string, unknown>)[name as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('SM3-A shared fixed layout and drawing', () => {
  it('uses a 1200 × 1500 design with a separated circular chart and text grid', () => {
    const layout = makeLayout();
    expect(SKY_CHART_ARTWORK_SIZE).toEqual({ width: 1200, height: 1500 });
    expect(layout.width / layout.height).toBe(4 / 5);
    expect(layout.disc.cx).toBe(600);
    expect(layout.disc.cy - layout.disc.radius).toBeGreaterThan(0);
    expect(layout.disc.cy + layout.disc.radius).toBeLessThan(950);
    expect(layout.blocks.every((b) => b.top >= 972 && b.top + b.lines.length * b.lineHeight <= 1500)).toBe(
      true,
    );
  });

  it('gives both themes editorial gradients and framing without moving scientific positions', () => {
    for (const theme of ['midnight', 'paper'] as const) {
      const layout = makeLayout(theme);
      const { ctx, calls } = recordingContext();
      drawSkyChartArtwork(ctx, layout, fonts);
      expect(calls.filter((c) => c.method === 'createLinearGradient')).toHaveLength(1);
      expect(calls.filter((c) => c.method === 'createRadialGradient')).toHaveLength(3);
      expect(calls.filter((c) => c.method === 'strokeRect')).toHaveLength(2);
      expect(layout.blocks[0].font).toContain('Georgia');
      expect(layout.objects.map((o) => [o.px, o.py])).toEqual(
        makeLayout(theme === 'midnight' ? 'paper' : 'midnight').objects.map((o) => [o.px, o.py]),
      );
    }
  });

  it('uses a Chinese-appropriate serif for titles and keeps text checks in the fixed grid', () => {
    const layout = makeLayout('paper', 'zh-Hans');
    expect(layout.blocks[0].font).toContain('Songti SC');
    expect(layout.blocks[4].font).toContain('Songti SC');
    expect(layout.blocks[5].font).toContain('system-ui');
    expect(layout.blocks[0].top).toBe(972);
  });

  it('keeps north up, east left, south down and west right with exact anchor mapping', () => {
    const layout = makeLayout();
    const byId = new Map(layout.objects.map((o) => [o.id, o]));
    expect(byId.get('sun')).toMatchObject({ x: 0, y: -0.5, px: 600, py: 289 });
    expect(byId.get('moon')).toMatchObject({ x: -1, y: 0, px: 182, py: 498 });
    expect(byId.get('mars')).toMatchObject({ x: 0, y: 0.5, px: 600, py: 707 });
    expect(byId.get('hyg-100')).toMatchObject({ x: 0.5, y: 0, px: 809, py: 498 });
    expect(layout.compass.map((p) => p.text)).toEqual(['N', 'E', 'S', 'W']);
    expect(layout.compass[1].x).toBeLessThan(layout.disc.cx);
    expect(layout.compass[3].x).toBeGreaterThan(layout.disc.cx);
  });

  it('places a zenith object exactly at the chart center, and horizon points on the rim', () => {
    const snapshot = fixture();
    const objects = [
      ...snapshot.objects,
      {
        kind: 'star' as const,
        id: 'hyg-zenith',
        name: 'Zenith',
        altitude: 90,
        azimuth: 23,
        x: 0,
        y: 0,
        magnitude: 4,
        colorIndex: null,
      },
    ];
    const layout = makeLayout('midnight', 'en', { ...snapshot, objects });
    const center = layout.objects.find((o) => o.id === 'hyg-zenith');
    expect(center).toMatchObject({ px: 600, py: 498 });
    const rim = layout.objects.find((o) => o.id === 'moon')!;
    expect(Math.hypot(rim.px - 600, rim.py - 498)).toBe(layout.disc.radius);
  });

  it('uses identical geometry for both themes and reserves themes for paint only', () => {
    const dark = makeLayout('midnight');
    const light = makeLayout('paper');
    expect(dark.objects).toEqual(light.objects);
    expect(dark.blocks).toEqual(light.blocks);
    expect(dark.compass).toEqual(light.compass);
    expect(SKY_CHART_PALETTES.midnight.background).not.toBe(SKY_CHART_PALETTES.paper.background);
    expect(SKY_CHART_PALETTES.midnight.title).not.toBe(SKY_CHART_PALETTES.paper.title);
  });

  it('keeps the same local compass geometry in both hemispheres', () => {
    const southEvent: MemorialTime = {
      ...event,
      location: SYDNEY,
      utc: '2026-06-21T02:00:00.000Z',
      offset: '+10:00',
    };
    const north = makeLayout();
    const south = makeLayout('midnight', 'en', fixture(southEvent), {}, southEvent);
    expect(north.objects.map((o) => [o.x, o.y, o.px, o.py])).toEqual(
      south.objects.map((o) => [o.x, o.y, o.px, o.py]),
    );
  });

  it('renders the selected actual snapshot objects and never invents stars', () => {
    const layout = makeLayout();
    expect(layout.objects.map((o) => o.id)).toEqual(fixture().objects.map((o) => o.id));
    expect(layout.objects.filter((o) => o.kind === 'star')).toHaveLength(1);
    const { ctx, calls } = recordingContext();
    drawSkyChartArtwork(ctx, layout, fonts);
    expect(calls.filter((c) => c.method === 'clip')).toHaveLength(1);
    expect(calls.filter((c) => c.method === 'arc').length).toBeGreaterThan(layout.objects.length);
  });

  it('does not resurface below-horizon objects omitted by SM2-B/C', () => {
    const snapshot = fixture();
    const absent = { ...snapshot, objects: snapshot.objects.filter((o) => o.id !== 'mars') };
    expect(makeLayout('midnight', 'en', absent).objects.some((o) => o.id === 'mars')).toBe(false);
  });

  it('renders the Moon as an orientation-neutral marker, not the explorer brightLimbAngle', () => {
    const layout = makeLayout();
    const moon = layout.objects.find((o) => o.kind === 'moon')!;
    expect(moon.radius).toBe(8);
    expect(JSON.stringify(moon)).not.toContain('brightLimbAngle');
  });

  it('draws all text as Canvas fillText, preserving literal markup characters', () => {
    const layout = makeLayout('paper', 'en', fixture(), { title: '<b>Fictional night</b>' });
    const { ctx, calls } = recordingContext();
    drawSkyChartArtwork(ctx, layout, fonts);
    expect(calls.some((c) => c.method === 'fillText' && c.args[0] === '<b>Fictional night</b>')).toBe(true);
    expect(calls.some((c) => c.method === 'fillText' && String(c.args[0]).includes('CC BY-SA 4.0'))).toBe(
      true,
    );
    expect(calls.some((c) => c.method === 'fillText' && String(c.args[0]).includes('weather'))).toBe(true);
  });

  it('draws the same 4:5 vector design at another output size, without bitmap resampling', () => {
    const layout = makeLayout();
    const { ctx, calls } = recordingContext(960, 1200);
    drawSkyChartArtwork(ctx, layout, fonts);
    expect(calls.find((c) => c.method === 'scale')?.args).toEqual([0.8, 0.8]);
    expect(calls.some((c) => c.method === 'fillRect' && c.args[2] === 1200 && c.args[3] === 1500)).toBe(true);
    expect(() => drawSkyChartArtwork(recordingContext(960, 1100).ctx, layout, fonts)).toThrow('4:5');
  });

  it('supports reasonable English and Chinese long lines without clipping', () => {
    for (const locale of ['en', 'zh-Hans'] as const) {
      const text =
        locale === 'en'
          ? { title: 'W'.repeat(40), phrase: 'long '.repeat(16).trim() }
          : { title: '星'.repeat(40), phrase: '那时的天空'.repeat(16) };
      const layout = makeLayout('midnight', locale, fixture(), text);
      expect(layout.blocks[0].lines.length).toBeGreaterThan(1);
      expect(layout.blocks[0].lines.length).toBeLessThanOrEqual(2);
      expect(layout.blocks[4].lines.length).toBeLessThanOrEqual(2);
      expect(layout.compass.map((c) => c.text)).toEqual(
        locale === 'en' ? ['N', 'E', 'S', 'W'] : ['北', '东', '南', '西'],
      );
    }
  });

  it('reports impossible text without shrinking endlessly or silently cutting a line', () => {
    const snapshot = fixture();
    const wide = { ...snapshot, location: { ...snapshot.location, name: 'W'.repeat(140) } };
    const modifiedEvent: MemorialTime = { ...event, location: wide.location };
    const layout = () => makeLayout('paper', 'en', wide, {}, modifiedEvent);
    expect(layout).toThrow(SkyChartLayoutError);
  });

  it('uses a stable layout for identical inputs and measurements', () => {
    const a = makeLayout('paper', 'zh-Hans');
    const b = makeLayout('paper', 'zh-Hans');
    expect(a).toEqual(b);
  });

  it('does not mutate the supplied snapshot or civil-time record during layout or draw', () => {
    const original = fixture();
    const before = JSON.stringify(original);
    const layout = makeLayout('midnight', 'en', original);
    drawSkyChartArtwork(recordingContext().ctx, layout, fonts);
    expect(JSON.stringify(original)).toBe(before);
    expect(JSON.stringify(event)).toBe(JSON.stringify({ ...event }));
  });

  it('refuses incomplete layouts and mismatched font resources', () => {
    const layout = makeLayout();
    expect(() =>
      drawSkyChartArtwork(recordingContext().ctx, layout, {
        status: 'fallback',
        family: 'sans-serif',
      }),
    ).toThrow('Font resources changed');
    expect(() => layoutSkyChartArtwork(layout.artwork, { measure: () => NaN }, fonts)).toThrow(
      SkyChartLayoutError,
    );
  });

  it('does not consult camera, weather, device time or rerun projection while drawing', () => {
    const layout = makeLayout();
    const now = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('clock accessed');
    });
    const ctx = recordingContext().ctx;
    expect(() => drawSkyChartArtwork(ctx, layout, fonts)).not.toThrow();
    expect(now).not.toHaveBeenCalled();
    now.mockRestore();
  });
});

describe('SM3-A fonts and real HYG snapshot integration', () => {
  it('waits for readiness, exposes a documented fallback, and requires fresh measurement', async () => {
    const pending = Promise.resolve(undefined);
    expect(await prepareSkyChartFonts({ ready: pending, check: () => true })).toEqual({
      status: 'ready',
      family: 'system-ui',
    });
    const failed = await prepareSkyChartFonts({ ready: pending, check: () => false });
    expect(failed).toEqual({ status: 'fallback', family: 'sans-serif' });
    const rejection = await prepareSkyChartFonts({
      ready: Promise.reject(new Error('unavailable')),
      check: () => true,
    });
    expect(rejection.status).toBe('fallback');
    const layout = layoutSkyChartArtwork(
      createSkyArtwork({
        event,
        snapshot: fixture(),
        theme: 'midnight',
        locale: 'en',
      }),
      metrics,
      failed,
    );
    expect(() => drawSkyChartArtwork(recordingContext().ctx, layout, fonts)).toThrow();
    expect(() => drawSkyChartArtwork(recordingContext().ctx, layout, failed)).not.toThrow();
  });

  beforeAll(async () => {
    await loadStarCatalog(async () => rows as CatalogRow[]);
  });

  it('draws a real HYG/astronomy-engine result without touching science or reselecting', () => {
    const input = prepareSkyChartSnapshotRequest({ time: event });
    const sky = calculateSky(event.location, new Date(event.utc));
    const snapshot = buildPreparedSkyChartSnapshot(input, sky);
    const art = createSkyArtwork({ event, snapshot, theme: 'paper', locale: 'en' });
    const layout = layoutSkyChartArtwork(art, metrics, fonts);
    const selectedStars = snapshot.objects.filter((o) => o.kind === 'star');
    expect(selectedStars.length).toBeGreaterThan(100);
    expect(layout.objects.filter((o) => o.kind === 'star')).toHaveLength(selectedStars.length);
    for (const star of selectedStars.slice(0, 50)) {
      const drawable = layout.objects.find((o) => o.id === star.id)!;
      expect(drawable.px).toBe(600 + 418 * star.x);
      expect(drawable.py).toBe(498 + 418 * star.y);
    }
    expect(() => drawSkyChartArtwork(recordingContext().ctx, layout, fonts)).not.toThrow();
  });
});
