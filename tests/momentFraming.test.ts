import { describe, expect, it } from 'vitest';
import { frameMoment } from '../src/moment/framing';
import { createProjection } from '../src/moment/projection';
import { calculateSky } from '../src/domain/astronomy';
import { defaultWeatherValues } from '../src/domain/weather';
import { PRESETS } from '../src/lib/locations';
import type { MomentSnapshot } from '../src/lib/moment';
import { findSkyObject } from '../src/lib/exploration';
import type { Planet } from '../src/types';

const instant = new Date('2026-03-20T17:00:00Z');
const sky = calculateSky(PRESETS[0], instant);
const snapshot: MomentSnapshot = {
  sky: {
    ...sky,
    sunAltitude: -25,
    sun: { ...sky.sun, altitude: -25, visible: false },
    moon: { ...sky.moon, altitude: -20, visible: false },
    planets: [],
    stars: [],
  },
  weather: { ...defaultWeatherValues(), cloudCover: 0, visibilityKm: 60, haze: 0 },
  view: { heading: 0, altitude: 18, fov: 66 },
  aspect: 1.6,
  layers: { stars: false, lines: false, labels: true },
  skyBrightness: 'dark',
  provenance: { kind: 'clear' },
  instant,
  location: PRESETS[0],
};
function planet(id: Planet['id'], azimuth: number, magnitude: number): Planet {
  return { ...sky.planets[0], id, azimuth, magnitude, altitude: 30, visible: true };
}

describe('image-only smart framing', () => {
  it.each([0.45, 1.6, 2.4])('fits a high Sun at source aspect %s without moving it', (aspect) => {
    const input = {
      ...snapshot,
      aspect,
      sky: {
        ...snapshot.sky,
        sunAltitude: 80,
        sun: { ...sky.sun, altitude: 80, azimuth: 180, visible: true },
      },
    };
    const framed = frameMoment(input, 'auto');
    const p = createProjection(framed.view, framed.aspect)(80, 180);
    expect(p.front).toBe(true);
    expect(Math.abs(p.x)).toBeLessThan(0.7);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(0.7);
    expect(framed.sky).toBe(input.sky);
    expect(input.view.heading).toBe(0);
  });

  it('keeps a sunset near the real horizon, including the below-horizon glow', () => {
    const input = {
      ...snapshot,
      sky: {
        ...snapshot.sky,
        sunAltitude: -3,
        sun: { ...sky.sun, altitude: -3, azimuth: 270, visible: false },
      },
    };
    const framed = frameMoment(input, 'auto');
    expect(framed.view.heading).toBe(262);
    const p = createProjection(framed.view, framed.aspect)(0, 270);
    expect(p.front).toBe(true);
    expect(Math.abs(p.y)).toBeLessThan(1);
  });

  it('prefers a visible Moon, even when bright planets are elsewhere', () => {
    const input = {
      ...snapshot,
      sky: {
        ...snapshot.sky,
        moon: { ...sky.moon, altitude: 45, azimuth: 120, illumination: 0.4, visible: true },
        planets: [planet('venus', 270, -4)],
      },
    };
    const framed = frameMoment(input, 'auto');
    expect(framed.view.heading).toBe(112);
    expect(createProjection(framed.view, framed.aspect)(45, 120).y).toBeGreaterThan(0);
  });

  it('fits a group across north and does not aim at the arithmetic mean or an opposite planet', () => {
    const input = {
      ...snapshot,
      aspect: 0.45,
      sky: {
        ...snapshot.sky,
        moon: { ...sky.moon, altitude: 20, illumination: 0.001, visible: true },
        planets: [planet('venus', 359, -4), planet('jupiter', 8, -2), planet('saturn', 180, 1)],
      },
    };
    const framed = frameMoment(input, 'auto');
    const project = createProjection(framed.view, framed.aspect);
    for (const p of input.sky.planets.slice(0, 2)) {
      const point = project(p.altitude, p.azimuth);
      expect(point.front).toBe(true);
      expect(Math.abs(point.x)).toBeLessThan(0.8);
      expect(Math.abs(point.y)).toBeLessThan(0.8);
    }
    expect(project(30, 180).front).toBe(false);
  });

  it('preserves a focused object and an explicitly chosen current view', () => {
    const focused: MomentSnapshot = {
      ...snapshot,
      subject: { kind: 'object', object: findSkyObject(sky, 'sun')! },
    };
    expect(frameMoment(focused, 'auto')).toBe(focused);
    expect(frameMoment(snapshot, 'current')).toBe(snapshot);
  });

  it('does not invent a subject when there is no visible candidate', () => {
    expect(frameMoment(snapshot, 'auto')).toBe(snapshot);
  });

  it('keeps the legacy 8° bias, and a narrow portrait still contains the Sun, Moon and a bright star', () => {
    const sun = {
      ...snapshot,
      sky: {
        ...snapshot.sky,
        sunAltitude: 30,
        sun: { ...sky.sun, altitude: 30, azimuth: 180, visible: true },
      },
    };
    expect(frameMoment(sun, 'auto').view.heading).toBe(172);
    const narrowSun = frameMoment(sun, 'auto', { aspect: 0.1 });
    expect(narrowSun.aspect).toBe(0.1);
    expectInside(narrowSun, 30, 180);

    const moon = {
      ...snapshot,
      sky: {
        ...snapshot.sky,
        moon: { ...sky.moon, altitude: 30, azimuth: 180, illumination: 0.4, visible: true },
      },
    };
    expectInside(frameMoment(moon, 'auto', { aspect: 0.1 }), 30, 180);

    const star = {
      ...snapshot,
      layers: { stars: true, lines: false, labels: false },
      sky: {
        ...snapshot.sky,
        stars: [{ ...sky.stars[0], altitude: 30, azimuth: 180, magnitude: 0 }],
      },
    };
    expectInside(frameMoment(star, 'auto', { aspect: 0.1, milkyWay: false }), 30, 180);
  });
});

function expectInside(
  framed: { view: MomentSnapshot['view']; aspect: number },
  altitude: number,
  azimuth: number,
) {
  const p = createProjection(framed.view, framed.aspect)(altitude, azimuth);
  expect(p.front).toBe(true);
  expect(Math.abs(p.x)).toBeLessThanOrEqual(0.88);
  expect(Math.abs(p.y)).toBeLessThanOrEqual(0.88);
}
