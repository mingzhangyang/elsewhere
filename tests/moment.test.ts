import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createProjection } from '../src/moment/projection';
import { HORIZON_VARIANTS, horizonAltitude } from '../src/moment/scenery';
import { wrap } from '../src/moment/postcard';
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
  /** A 2D context that records what is drawn: dashed strokes (pattern lines) and text. */
  const recorder = () => {
    const calls = { dashedStrokes: 0, text: [] as string[] };
    let dashed = false;
    const ctx = new Proxy(
      {},
      {
        get: (_target, key) => {
          if (key === 'setLineDash') return (dash: number[]) => (dashed = dash.length > 0);
          if (key === 'stroke') return () => dashed && calls.dashedStrokes++;
          if (key === 'fillText') return (text: string) => calls.text.push(text);
          if (key === 'createLinearGradient' || key === 'createRadialGradient')
            return () => ({ addColorStop: () => {} });
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
  ) => {
    const sky = calculateSky(NEW_YORK, new Date(instant));
    const { ctx, calls } = recorder();
    const project = createProjection(view, 1.5);
    drawIllustration(
      ctx,
      1200,
      800,
      {
        sky,
        weather: { ...defaultWeatherValues(), cloudCover: 0, haze: 0, visibilityKm: 40 },
        view,
        aspect: 1.5,
        layers: { stars: true, lines: true, labels },
        location: NEW_YORK,
        instant: new Date(instant),
        skyBrightness: 'dark',
        provenance: { kind: 'none' },
      },
      (alt, az) => {
        const p = project(alt, az);
        return { x: (p.x + 1) * 600, y: (1 - p.y) * 400, front: p.front };
      },
      'ridge',
      { object: (object) => object.name, pattern: (id) => id },
      'sans-serif',
    );
    return calls;
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
});
