import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createProjection } from '../src/moment/projection';
import {
  HORIZON_VARIANTS,
  ISLAND_TOP,
  MAST_TOP,
  TOWN_TOP,
  horizonAltitude,
  type HorizonVariant,
} from '../src/moment/scenery';
import { wrap } from '../src/moment/postcard';
import { cityLight } from '../src/moment/city';
import { drawIllustration } from '../src/moment/illustration';
import { defaultWeatherValues } from '../src/domain/weather';
import { ridgeAltitude, ridgeHeight, RIDGE_RADIUS } from '../src/renderer/ridge';
import { directionVector } from '../src/renderer/resources';
import {
  arrivalStart,
  centeredPattern,
  momentProvenance,
  patternCenter,
  subjectField,
} from '../src/lib/moment';
import { calculateSky } from '../src/domain/astronomy';
import { cityLevel, parseExploration, type Exploration } from '../src/lib/persistence';
import { normalizeLocation, PRESETS } from '../src/lib/locations';
import type { WeatherSelection } from '../src/types';
import { NEW_YORK } from './fixtures/locations';

/** What the illustration paints, in order: each cloud, and each filled path with its circles. */
const painted = vi.hoisted(
  () => [] as ({ kind: 'cloud' } | { kind: 'fill'; arcs: { x: number; y: number; r: number }[] })[],
);
// The cloud painters, unchanged, noting each call in `painted`.
vi.mock('../src/moment/clouds', async (importOriginal) => {
  const clouds = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries(clouds).map(([name, value]) => [
      name,
      typeof value === 'function'
        ? (...args: unknown[]) => {
            painted.push({ kind: 'cloud' });
            return (value as (...a: unknown[]) => unknown)(...args);
          }
        : value,
    ]),
  );
});

describe('the illustrated image puts objects where the renderer does', () => {
  // The renderer's camera: rotation (pitch, yaw, 0) in YXZ order, as cameraControls sets it.
  const threeProjection = (heading: number, altitude: number, fov: number, aspect: number) => {
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 5000);
    camera.rotation.set(THREE.MathUtils.degToRad(altitude), -THREE.MathUtils.degToRad(heading), 0, 'YXZ');
    camera.updateMatrixWorld();
    return (alt: number, az: number) => directionVector(alt, az).multiplyScalar(1650).project(camera);
  };
  for (const [heading, altitude, fov, aspect] of [
    [0, 18, 66, 1.6],
    [212.5, 41, 30, 0.46],
    [359, -3, 92, 1.0],
    [90, 75, 8, 2.1],
  ])
    it(`matches three.js for heading ${heading}°, altitude ${altitude}°, ${fov}° field`, () => {
      const ours = createProjection({ heading, altitude, fov }, aspect);
      const theirs = threeProjection(heading, altitude, fov, aspect);
      for (let i = 0; i < 40; i++) {
        // Points around the view's center, within its field.
        const alt = Math.max(-10, Math.min(89, altitude + (((i * 37) % 21) - 10) * (fov / 30)));
        const az = heading + (((i * 53) % 17) - 8) * (fov / 25);
        const a = ours(alt, az),
          b = theirs(alt, az);
        expect(a.front).toBe(true);
        expect(a.x).toBeCloseTo(b.x, 6);
        expect(a.y).toBeCloseTo(b.y, 6);
      }
      expect(ours(-altitude, heading + 180).front).toBe(false);
    });
});

it('selects the city lighting from the shared sky on either side of solar noon', () => {
  expect(cityLight(6, 80)).toBe('day');
  expect(cityLight(-6.01, 280)).toBe('night');
  expect(cityLight(-6, 70)).toBe('dawn');
  expect(cityLight(-6, 290)).toBe('dusk');
});

describe('horizon variants', () => {
  it('the ridge drawn in images is the renderer’s ridge', () => {
    for (let az = 0; az < 360; az += 7)
      expect(ridgeAltitude(az)).toBeCloseTo(
        (Math.atan2(ridgeHeight((az * Math.PI) / 180), RIDGE_RADIUS) * 180) / Math.PI,
        10,
      );
  });
  it('every silhouette stays below 2° of altitude, so it cannot hide a visible object', () => {
    for (const variant of HORIZON_VARIANTS)
      for (let az = -360; az < 720; az += 0.1) {
        const altitude = horizonAltitude(variant, az);
        expect(altitude).toBeGreaterThanOrEqual(0);
        expect(altitude).toBeLessThan(2);
      }
  });
  it('what the illustration adds on the horizon line stays below 2° too', () => {
    for (const top of [TOWN_TOP, ISLAND_TOP, MAST_TOP]) {
      expect(top).toBeGreaterThan(0);
      expect(top).toBeLessThan(2);
    }
  });
});

describe('moment links', () => {
  const base: Exploration = {
    version: 1,
    location: PRESETS[0],
    instant: '2026-01-10T05:00:00.000Z',
    camera: { heading: 180, altitude: 40, fov: 50 },
    layers: { stars: true, lines: true, labels: true },
    custom: null,
  };
  const reopen = (value: object) => parseExploration('#sky=' + encodeURIComponent(JSON.stringify(value)));
  it('carry an optional subject: an object or a line pattern', () => {
    for (const subject of ['jupiter', 'moon', 'hyg-32263', 'pattern:orion']) {
      const link = { ...base, subject };
      expect(reopen(link).value).toEqual(link);
    }
  });
  it('without a subject open as before, and unknown fields are ignored', () => {
    expect(reopen(base).value).toEqual(base);
    expect(reopen({ ...base, story: 'a later field' }).value).toEqual(base);
  });
  it('reject a malformed subject like any malformed field', () => {
    for (const subject of [42, 'Jupiter', 'pattern:', 'x'.repeat(60)])
      expect(reopen({ ...base, subject })).toEqual({ value: null, notice: { code: 'invalid-link' } });
  });
  it('name the subject as the link field does', () => {
    const sky = calculateSky(NEW_YORK, new Date(base.instant));
    expect(subjectField(undefined)).toBeUndefined();
    expect(subjectField({ kind: 'pattern', id: 'orion' })).toBe('pattern:orion');
    expect(subjectField({ kind: 'object', object: { ...sky.planets[3], kind: 'planet' } })).toBe('jupiter');
  });
  it('share device coordinates at city level unless asked, and named places as they are', () => {
    const device = normalizeLocation({
      ...PRESETS[1],
      latitude: 39.90423,
      longitude: 116.40741,
      source: 'device',
    });
    const rounded = cityLevel(device);
    expect([rounded.latitude, rounded.longitude]).toEqual([39.9, 116.4]);
    expect(rounded.id).toBe('coordinates:39.9,116.4,44');
    expect(rounded.source).toBe('device');
    expect(cityLevel(PRESETS[1])).toBe(PRESETS[1]);
  });
  it('turn to the subject from a lower, wider view to its left', () => {
    const start = arrivalStart({ heading: 30, altitude: 50, fov: 20 });
    expect(start).toEqual({ heading: 320, altitude: 20, fov: 66 });
    expect(arrivalStart({ heading: 0, altitude: 2, fov: 90 })).toEqual({
      heading: 290,
      altitude: 4,
      fov: 90,
    });
  });
});

describe('moment subjects and provenance', () => {
  // Local midnight in New York in January: Orion high in the south.
  const sky = calculateSky(NEW_YORK, new Date('2026-01-10T05:00:00Z'));
  it('finds the line pattern a view is turned to, only when lines are shown', () => {
    const orion = patternCenter(sky, 'orion')!;
    expect(orion.altitude).toBeGreaterThan(20);
    const view = { heading: orion.azimuth + 4, altitude: orion.altitude - 3, fov: 50 };
    const layers = { stars: true, lines: true, labels: true };
    expect(centeredPattern(sky, view, layers)).toBe('orion');
    expect(centeredPattern(sky, view, { ...layers, lines: false })).toBeUndefined();
    expect(centeredPattern(sky, { ...view, heading: (view.heading + 180) % 360 }, layers)).not.toBe('orion');
  });
  it('labels where the conditions come from', () => {
    const selection = (source?: WeatherSelection['source']): WeatherSelection => ({
      status: 'ready',
      values: source ? ({} as WeatherSelection['values']) : null,
      source,
    });
    expect(momentProvenance(selection('historical'), false, false)).toEqual({
      kind: 'source',
      source: 'historical',
    });
    expect(momentProvenance(selection(), false, false)).toEqual({ kind: 'none' });
    expect(momentProvenance(selection('forecast'), true, false)).toEqual({ kind: 'custom' });
    expect(momentProvenance(selection('forecast'), true, true)).toEqual({ kind: 'clear' });
  });
});

describe('image text', () => {
  // Ten pixels per character: enough to check where lines break.
  const ctx = { measureText: (text: string) => ({ width: text.length * 10 }) } as CanvasRenderingContext2D;
  it('breaks English between words', () => {
    expect(wrap(ctx, 'Clouds based on reanalysis for this area.', 160)).toEqual([
      'Clouds based on',
      'reanalysis for',
      'this area.',
    ]);
  });
  it('breaks Chinese between characters, keeping Latin words whole', () => {
    const lines = wrap(ctx, '位置由 Astronomy Engine 计算；地平线和云的形状为示意。', 120);
    expect(lines.join('').replace(/\s/g, '')).toBe('位置由AstronomyEngine计算；地平线和云的形状为示意。');
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(12);
    expect(lines.some((line) => line.includes('Astronomy'))).toBe(true);
  });
});

describe('the illustrated sky follows the layers and visibility', () => {
  /**
   * A 2D context that records what is drawn: dashed strokes (pattern lines), text and where it is
   * put, and the rectangles drawing is clipped to.
   */
  const recorder = () => {
    const calls = {
      dashedStrokes: 0,
      text: [] as string[],
      textAt: [] as { text: string; y: number }[],
      clips: [] as { y: number; height: number; drawnInside: number }[],
    };
    let dashed = false;
    let rect: { y: number; height: number } | null = null;
    // The clips in force, innermost last, with the save depth each was made at.
    const clipped: { depth: number; clip: (typeof calls.clips)[number] }[] = [];
    let depth = 0;
    // Circles in the current path, placed by the translation in force (the Moon is drawn translated).
    let arcs: { x: number; y: number; r: number }[] = [];
    const offsets = [{ x: 0, y: 0 }];
    const offset = () => offsets[offsets.length - 1];
    const ctx = new Proxy(
      {},
      {
        get: (_target, key) => {
          if (key === 'setLineDash') return (dash: number[]) => (dashed = dash.length > 0);
          if (key === 'stroke')
            return () => {
              if (dashed) calls.dashedStrokes++;
              for (const { clip } of clipped) clip.drawnInside++;
            };
          if (key === 'fill')
            return () => {
              clipped.forEach(({ clip }) => clip.drawnInside++);
              painted.push({ kind: 'fill', arcs });
            };
          if (key === 'arc')
            return (x: number, y: number, r: number) =>
              arcs.push({ x: x + offset().x, y: y + offset().y, r });
          if (key === 'translate')
            return (x: number, y: number) =>
              (offsets[offsets.length - 1] = { x: offset().x + x, y: offset().y + y });
          if (key === 'fillText')
            return (text: string, _x: number, y: number) => {
              calls.text.push(text);
              calls.textAt.push({ text, y });
            };
          if (key === 'createLinearGradient' || key === 'createRadialGradient')
            return () => ({ addColorStop: () => {} });
          if (key === 'save')
            return () => {
              depth++;
              offsets.push({ ...offset() });
            };
          if (key === 'restore')
            return () => {
              depth--;
              offsets.pop();
              while (clipped.length && clipped[clipped.length - 1].depth > depth) clipped.pop();
            };
          if (key === 'beginPath')
            return () => {
              rect = null;
              arcs = [];
            };
          if (key === 'rect')
            return (_x: number, y: number, _w: number, height: number) => (rect = { y, height });
          if (key === 'drawImage') return () => clipped.forEach(({ clip }) => clip.drawnInside++);
          if (key === 'clip')
            return () => {
              if (!rect) return;
              const clip = { ...rect, drawnInside: 0 };
              calls.clips.push(clip);
              clipped.push({ depth, clip });
            };
          return () => {};
        },
        set: () => true,
      },
    ) as CanvasRenderingContext2D;
    return { ctx, calls };
  };
  const draw = (
    instant: string,
    view: { heading: number; altitude: number; fov: number },
    labels: boolean,
    horizon: HorizonVariant = 'ridge',
    cloud = 0,
  ) => {
    const sky = calculateSky(NEW_YORK, new Date(instant));
    painted.length = 0;
    const { ctx, calls } = recorder();
    const project = createProjection(view, 1.5);
    const toCanvas = (alt: number, az: number) => {
      const p = project(alt, az);
      return { x: (p.x + 1) * 600, y: (1 - p.y) * 400, front: p.front };
    };
    drawIllustration(
      ctx,
      1200,
      800,
      {
        sky,
        weather: {
          ...defaultWeatherValues(),
          cloudCover: cloud,
          cloudLow: cloud,
          cloudMid: cloud,
          cloudHigh: cloud,
          haze: 0,
          visibilityKm: 40,
        },
        view,
        aspect: 1.5,
        layers: { stars: true, lines: true, labels },
        location: NEW_YORK,
        instant: new Date(instant),
        skyBrightness: 'dark',
        provenance: { kind: 'none' },
      },
      toCanvas,
      horizon,
      { object: (object) => object.name, pattern: (id) => id },
      'sans-serif',
      horizon === 'city' ? ({ naturalWidth: 960, naturalHeight: 496 } as HTMLImageElement) : null,
    );
    return { ...calls, horizonY: toCanvas(0, view.heading).y, sky, toCanvas };
  };
  // Orion and Sirius in the south at midnight in January.
  const night = '2026-01-10T05:00:00Z';
  const south = { heading: 190, altitude: 30, fov: 70 };
  it('draws pattern lines and names at night with labels on', () => {
    const calls = draw(night, south, true);
    expect(calls.dashedStrokes).toBeGreaterThan(0);
    expect(calls.text).toContain('Sirius');
  });
  it('prints no names at all with the Labels layer off', () => {
    expect(draw(night, south, false).text).toEqual([]);
  });
  it('draws no pattern lines in daylight, as the renderer hides them', () => {
    // The Big Dipper, circumpolar from New York: up both at midnight and at noon in June.
    const north = { heading: 0, altitude: 45, fov: 92 };
    expect(draw('2026-06-15T04:00:00Z', north, true).dashedStrokes).toBeGreaterThan(0);
    expect(draw('2026-06-15T16:00:00Z', north, true).dashedStrokes).toBe(0);
  });
  // Hills, trees, houses and people are taller than 2°, so they may only stand below the horizon line.
  it('paints the taller scenery only inside a clip that starts under the horizon line', () => {
    for (const horizon of HORIZON_VARIANTS) {
      const { clips, horizonY } = draw(night, { heading: 190, altitude: 12, fov: 66 }, true, horizon);
      const ground = clips.filter((clip) => clip.y > horizonY && clip.y < horizonY + 2);
      expect(ground, horizon).toHaveLength(1);
      expect(ground[0].y + ground[0].height, horizon).toBeGreaterThanOrEqual(800);
      // The layers, trees, grass and figures (by the sea, a headland): many marks, all inside it.
      if (horizon === 'city') expect(ground[0].drawnInside).toBe(1);
      else expect(ground[0].drawnInside, horizon).toBeGreaterThan(50);
    }
  });
  it('letters a name above its object when below would fall on the land', () => {
    // Sunset in New York, facing the Sun on the horizon; Sirius, high in January, keeps its name below.
    const sunset = draw('2026-11-12T21:35:00Z', { heading: 240, altitude: 14, fov: 66 }, true);
    const sun = sunset.textAt.find(({ text }) => text === 'Sun')!;
    expect(sun.y).toBeLessThan(sunset.horizonY - 40);
    const high = draw(night, south, true);
    const sirius = high.textAt.find(({ text }) => text === 'Sirius')!;
    const star = calculateSky(NEW_YORK, new Date(night)).stars.find((s) => s.name === 'Sirius')!;
    const at = createProjection(south, 1.5)(star.altitude, star.azimuth);
    expect(sirius.y).toBeGreaterThan((1 - at.y) * 400);
  });
  // Clouds are illustrative and the Sun, Moon, planets and bright stars are not: under full cover at
  // every level, every cloud is painted before the disc of a low Sun or Moon, so none can hide it.
  for (const [body, instant, view] of [
    ['Sun', '2026-11-12T21:35:00Z', { heading: 240, altitude: 14, fov: 66 }],
    ['Moon', '2026-08-15T00:30:00Z', { heading: 265, altitude: 10, fov: 66 }],
  ] as const)
    it(`paints every cloud before the disc of a low ${body} under full cover`, () => {
      const { sky, toCanvas } = draw(instant, view, false, 'ridge', 100);
      const object = body === 'Sun' ? sky.sun : sky.moon;
      expect(object.visible).toBe(true);
      expect(object.altitude).toBeLessThan(6);
      const at = toCanvas(object.altitude, object.azimuth);
      // The disc: a circle on the body's position with its drawn radius (glows are wider).
      const disc = painted.findIndex(
        (step) =>
          step.kind === 'fill' &&
          step.arcs.some((a) => Math.hypot(a.x - at.x, a.y - at.y) < 0.5 && a.r > 20 && a.r < 40),
      );
      expect(disc).toBeGreaterThan(0);
      const clouds = painted.flatMap((step, i) => (step.kind === 'cloud' ? [i] : []));
      expect(clouds.length).toBeGreaterThan(10);
      expect(Math.max(...clouds)).toBeLessThan(disc);
    });
});
