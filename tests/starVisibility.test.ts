import { describe, expect, it } from 'vitest';
import { calculateSky } from '../src/domain/astronomy';
import { objectVisibility, skyObjects, type SkyObject } from '../src/lib/exploration';
import {
  limitingMagnitude,
  magnitudeVisibility,
  STAR_VISIBLE_THRESHOLD,
  starGlow,
  starIntensity,
  starPointSize,
  twilightVisibility,
  weatherVisibility,
} from '../src/domain/starVisibility';
import { defaultWeatherValues } from '../src/domain/weather';
import { starAlpha } from '../src/renderer/starPicking';
import type { Preferences } from '../src/lib/persistence';
import type { SkyState } from '../src/types';
import { NEW_YORK } from './fixtures/locations';

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
  language: 'auto',
};
const base = calculateSky(NEW_YORK, new Date('2026-11-12T17:00Z'));
const clear = { ...defaultWeatherValues(), cloudCover: 0, haze: 0, visibilityKm: 60 };
const template = skyObjects(base).find((object) => object.kind === 'star')!;

function skyAt(sunAltitude: number, moonAltitude = -20): SkyState {
  return { ...base, sunAltitude, moon: { ...base.moon, altitude: moonAltitude, illumination: 0.9 } };
}
const star = (magnitude: number, altitude = 60) => ({ ...template, magnitude, altitude }) as SkyObject;

/** The share of a star's normal display the renderer keeps: per-star alpha × uniform opacity. */
function drawnShare(
  object: SkyObject & { kind: 'star' },
  sky: SkyState,
  weather: typeof clear,
  skyBrightness: Preferences['skyBrightness'],
) {
  const alpha = starAlpha(object, limitingMagnitude(skyBrightness, sky.moon));
  const opacity = twilightVisibility(sky.sunAltitude) * weatherVisibility(weather);
  return (alpha / starIntensity(object.magnitude)) * opacity;
}

describe('twilight star visibility', () => {
  it('describes a fifth-magnitude star at −6° as washed out, matching its near-invisible drawing', () => {
    const sky = skyAt(-6);
    const object = star(5) as SkyObject & { kind: 'star' };
    expect(drawnShare(object, sky, clear, 'dark')).toBeLessThan(0.15);
    expect(objectVisibility(object, sky, clear, preferences).reason).toBe('twilight');
  });

  it('describes the same star as visible once the sky is fully dark', () => {
    expect(objectVisibility(star(5), skyAt(-25), clear, preferences).reason).toBe('clear');
  });

  it('keeps daylight distinct from twilight', () => {
    expect(objectVisibility(star(-1), skyAt(-2), clear, preferences).reason).toBe('daylight');
    expect(objectVisibility(star(-1), skyAt(-4), clear, preferences).reason).toBe('twilight');
  });

  it('blames light pollution rather than twilight when that dims the star most', () => {
    const city = { ...preferences, skyBrightness: 'city' as const };
    expect(objectVisibility(star(4), skyAt(-25), clear, city).reason).toBe('faint');
  });

  it('agrees with the renderer for every combination of sky, star and weather', () => {
    const visible = new Set(['clear', 'partial-cloud']);
    for (const sunAltitude of [-30, -18, -15, -12, -9, -6, -4, -3, 5])
      for (const moonAltitude of [-20, 30, 80])
        for (const magnitude of [-1.5, 0, 1.5, 3, 4.5, 5.5, 6.5])
          for (const altitude of [2, 10, 45, 89])
            for (const skyBrightness of ['dark', 'suburban', 'city'] as const)
              for (const weather of [clear, { ...clear, haze: 40, visibilityKm: 15 }]) {
                const sky = skyAt(sunAltitude, moonAltitude);
                const object = star(magnitude, altitude) as SkyObject & { kind: 'star' };
                const reason = objectVisibility(object, sky, weather, {
                  ...preferences,
                  skyBrightness,
                }).reason;
                const share = drawnShare(object, sky, weather, skyBrightness);
                expect(
                  visible.has(reason),
                  `sun ${sunAltitude}°, moon ${moonAltitude}°, mag ${magnitude} at ${altitude}°, ${skyBrightness}, haze ${weather.haze}: "${reason}" vs drawn ${share.toFixed(2)}`,
                ).toBe(share >= STAR_VISIBLE_THRESHOLD);
              }
  });
});

describe('dark-sky display scale', () => {
  it('keeps the faint stars that fill a dark sky bright enough to see on a screen', () => {
    for (const magnitude of [4, 5, 6]) {
      expect(starIntensity(magnitude)).toBeGreaterThanOrEqual(0.45);
      expect(starPointSize(magnitude)).toBeGreaterThanOrEqual(2.2);
    }
    expect(starIntensity(-1.5)).toBe(1);
    expect(starIntensity(2)).toBeGreaterThan(starIntensity(4));
  });

  it('draws a halo only around the brightest stars and planets, strongest for the brightest', () => {
    expect(starGlow(3)).toBe(0);
    expect(starGlow(2)).toBe(0);
    expect(starGlow(0)).toBeGreaterThan(starGlow(1));
    expect(starGlow(-1.46)).toBeGreaterThan(starGlow(0));
    expect(starGlow(-4.5)).toBe(1);
  });

  it('still lets light pollution decide which stars show at all', () => {
    const zenith = { altitude: 89, magnitude: 5 };
    const noMoon = { altitude: -20, illumination: 0 };
    expect(magnitudeVisibility(zenith, limitingMagnitude('dark', noMoon))).toBe(1);
    expect(magnitudeVisibility(zenith, limitingMagnitude('suburban', noMoon))).toBe(0);
    expect(magnitudeVisibility(zenith, limitingMagnitude('city', noMoon))).toBe(0);
  });
});
