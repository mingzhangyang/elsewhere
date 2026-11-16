import { describe, expect, it } from 'vitest';
import { calculateSky } from '../src/domain/astronomy';
import {
  CLOUD_FRAGMENT,
  GROUND_FRAGMENT,
  MOON_FRAGMENT,
  SKY_FRAGMENT,
  skyDaylightFactor,
} from '../src/renderer/shaders';

describe('daylight and twilight appearance', () => {
  it('stays in daylight with a Sun 1.2 degrees above the horizon', () => {
    expect(skyDaylightFactor(1.2)).toBeGreaterThan(0.99);
    expect(skyDaylightFactor(0)).toBeGreaterThan(0.95);
    expect(skyDaylightFactor(-6)).toBeGreaterThan(0.6);
    expect(skyDaylightFactor(-6)).toBeLessThan(0.7);
    expect(skyDaylightFactor(-12)).toBeGreaterThan(0.15);
    expect(skyDaylightFactor(-18)).toBe(0);
    for (let altitude = -17.5; altitude <= 2; altitude += 0.5) {
      expect(skyDaylightFactor(altitude)).toBeGreaterThanOrEqual(skyDaylightFactor(altitude - 0.5));
    }
  });

  it('uses one solar-altitude transition in sky, ground and clouds', () => {
    for (const source of [SKY_FRAGMENT, GROUND_FRAGMENT, CLOUD_FRAGMENT])
      expect(source).toContain('daylightFactor(uSunAltitude)');
  });

  it('limits warm twilight to sunward, low-altitude directions', () => {
    expect(SKY_FRAGMENT).toContain('float warmBand = horizon * sunward * twilight;');
    expect(SKY_FRAGMENT).toContain('float towardSun = dot(d, normalize(uSunDirection));');
    expect(CLOUD_FRAGMENT).toContain('dusk*sunward*0.36');
  });

  it('preserves the Moon terminator and daylight shadow without an oversized disc', () => {
    expect(MOON_FRAGMENT).toContain('smoothstep(-0.015, 0.065, incidence)');
    expect(MOON_FRAGMENT).toContain('vec3 shadow = mix(');
    expect(MOON_FRAGMENT).toContain('foreground + litSurface * transmission');
    expect(MOON_FRAGMENT).not.toContain('pow(texture2D(uMap,vMapUv).rgb,vec3(1.0/2.2))');
  });
});

it('keeps the November 16 Washington crescent in its calculated position', () => {
  // Independent ephemeris cross-check: Moon ~162 deg azimuth and 33 deg altitude at 16:44 EST.
  const dc = {
    id: 'washington-dc',
    name: 'Washington D.C.',
    country: 'United States',
    latitude: 38.9072,
    longitude: -77.0369,
    elevation: 10,
    timezone: 'America/New_York',
  };
  const sky = calculateSky(dc, new Date('2026-11-16T21:44:00Z'));
  expect(sky.sunAltitude).toBeGreaterThan(0.8);
  expect(sky.sunAltitude).toBeLessThan(1.6);
  expect(sky.moon.visible).toBe(true);
  expect(sky.moon.azimuth).toBeGreaterThan(161);
  expect(sky.moon.azimuth).toBeLessThan(163);
  expect(sky.moon.altitude).toBeGreaterThan(32.5);
  expect(sky.moon.altitude).toBeLessThan(34);
  expect(sky.moon.illumination).toBeGreaterThan(0.40);
  expect(sky.moon.illumination).toBeLessThan(0.49);
});
