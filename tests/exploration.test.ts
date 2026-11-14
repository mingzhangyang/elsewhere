import { describe, expect, it } from 'vitest';
import { calculateSky, nextBodyRise } from '../src/domain/astronomy';
import {
  angularDiameter,
  findSkyObject,
  framingFov,
  objectVisibility,
  skyObjects,
  type SkyObject,
} from '../src/lib/exploration';
import { defaultWeatherValues } from '../src/domain/weather';
import { NEW_YORK } from './fixtures/locations';
import { MIN_FOV, type Preferences } from '../src/lib/persistence';

const preferences: Preferences = {
  version: 1,
  layers: { stars: true, lines: false, labels: true },
  saved: [],
  recent: [],
  hintDismissed: false,
  reducedMotion: false,
  quality: 'auto',
  horizon: 'flat',
  skyBrightness: 'dark',
};
const date = new Date('2026-11-12T17:00Z');
const sky = calculateSky(NEW_YORK, date);
const clear = { ...defaultWeatherValues(), cloudCover: 0, haze: 0, visibilityKm: 60 };
it('explains cloud obstruction separately from the geometric position', () => {
  const moon = findSkyObject(sky, 'moon')!;
  expect(moon.altitude).toBeGreaterThan(0);
  expect(objectVisibility(moon, sky, { ...clear, cloudCover: 100 }, preferences).reason).toBe('cloud');
  expect(objectVisibility(moon, sky, clear, preferences).reason).toBe('daylight-moon');
  expect(
    objectVisibility({ ...moon, altitude: 1 }, sky, clear, { ...preferences, horizon: 'ridge' }).reason,
  ).toBe('ridge');
});
it('does not suggest clearing clouds when Earth blocks the object', () => {
  const below = { ...findSkyObject(sky, 'moon')!, altitude: -30, visible: false };
  expect(objectVisibility(below, sky, { ...clear, cloudCover: 100 }, preferences).reason).toBe('horizon');
});
it('distinguishes a disabled star layer from daylight visibility', () => {
  const star = skyObjects(sky).find((object) => object.kind === 'star' && object.altitude > 10)!;
  expect(objectVisibility(star, sky, clear, preferences).reason).toBe('daylight');
  expect(
    objectVisibility(star, sky, clear, { ...preferences, layers: { ...preferences.layers, stars: false } })
      .reason,
  ).toBe('layer');
});
it('finds the next lunar rise after an evening set', () => {
  const start = new Date('2026-11-13T04:00Z');
  const rise = nextBodyRise(NEW_YORK, 'moon', start)!;
  expect(rise.getTime()).toBeGreaterThan(start.getTime());
  expect(rise.getTime() - start.getTime()).toBeLessThan(86400000);
  expect(calculateSky(NEW_YORK, new Date(rise.getTime() + 15 * 60000)).moon.visible).toBe(true);
});

describe('framing the Sun and Moon', () => {
  it('zooms a risen Moon to fill about a quarter of the view, never past the zoom limit', () => {
    const sky = calculateSky(NEW_YORK, new Date('2026-11-24T02:00Z'));
    const moon = findSkyObject(sky, 'moon') as Extract<SkyObject, { kind: 'moon' }>;
    expect(angularDiameter(moon)).toBeGreaterThan(0.48);
    expect(angularDiameter(moon)).toBeLessThan(0.57);
    if (moon.visible) expect(framingFov(moon)).toBeCloseTo(Math.max(MIN_FOV, angularDiameter(moon) * 4), 6);
    expect(framingFov({ ...moon, visible: false })).toBeUndefined();
    expect(framingFov({ ...moon, visible: true, distanceKm: 1e9 })).toBe(MIN_FOV);
  });
  it('keeps the current zoom for stars', () => {
    const sky = calculateSky(NEW_YORK, new Date('2026-11-24T02:00Z'));
    expect(framingFov(findSkyObject(sky, sky.stars[0].id)!)).toBeUndefined();
  });
});
