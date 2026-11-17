import { describe, expect, it } from 'vitest';
import { calculateSky } from '../src/domain/astronomy';
import {
  CLOUD_FRAGMENT,
  GROUND_FRAGMENT,
  MOON_FRAGMENT,
  SKY_FRAGMENT,
  daylightSkyColor,
  moonLitReflectance,
  moonScreenDiameterPx,
  moonTextureDetail,
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

  it('keeps blue daylight saturated and brighter toward the horizon', () => {
    const high = daylightSkyColor(70);
    const low = daylightSkyColor(8);
    expect(high[2] - high[0]).toBeGreaterThan(0.45);
    expect(low[1]).toBeGreaterThan(high[1]);
    expect(low[2]).toBeGreaterThan(high[2]);
    expect(low[0]).toBeLessThan(0.5);
    expect(SKY_FRAGMENT).toContain('horizon * pow(sunAngle, 5.0) * 0.22');
    expect(SKY_FRAGMENT).toContain('clamp(uHaze, 0.0, 1.0) * horizon * 0.35');
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
    expect(MOON_FRAGMENT).toContain(
      'moonLitReflectance(luminance, daylightFactor(uSunAltitude), uMoonDetail)',
    );
    expect(MOON_FRAGMENT).toContain('exp(-(linear - knee) / shoulder)');
    expect(MOON_FRAGMENT).not.toContain('mix(0.80, 1.0, markings)');
    expect(MOON_FRAGMENT).not.toContain('pow(texture2D(uMap,vMapUv).rgb,vec3(1.0/2.2))');
  });
  it('renders a bright, clean daylight Moon at ordinary sizes and terrain when zoomed', () => {
    // Screen size changes surface appearance only, not the actual phase or angular diameter.
    const distanceKm = 382_000;
    const widePx = moonScreenDiameterPx(distanceKm, 700, 66);
    const zoomedPx = moonScreenDiameterPx(distanceKm, 700, 2);
    expect(widePx).toBeGreaterThan(4);
    expect(widePx).toBeLessThan(6);
    expect(zoomedPx).toBeGreaterThan(150);
    expect(moonTextureDetail(widePx)).toBe(0);
    expect(moonTextureDetail(zoomedPx)).toBe(1);
    expect(moonTextureDetail(24)).toBe(0);
    expect(moonTextureDetail(96)).toBe(1);
    for (const day of [0, 0.5, 1]) {
      const smallMaria = moonLitReflectance(0.1, day, 0);
      const smallHighland = moonLitReflectance(0.4, day, 0);
      const detailedMaria = moonLitReflectance(0.1, day, 1);
      const detailedHighland = moonLitReflectance(0.4, day, 1);
      expect(smallHighland - smallMaria).toBeLessThan(0.05);
      expect(detailedHighland - detailedMaria).toBeGreaterThan(0.15);
      expect(detailedHighland - detailedMaria).toBeGreaterThan((smallHighland - smallMaria) * 4);
      // The two bright source values must not collapse to the same white pixel when zoomed.
      const brightPeak = moonLitReflectance(0.8, day, 1);
      expect(brightPeak - detailedHighland).toBeGreaterThan(0.05);
      expect(brightPeak).toBeLessThan(1);
    }
    expect(moonLitReflectance(0.1, 1, 0)).toBeGreaterThan(0.9);
    expect(moonLitReflectance(0.1, 1, 0)).toBeGreaterThan(moonLitReflectance(0.1, 0, 0));
    expect(moonLitReflectance(-1, 1)).toBeGreaterThan(0.6);
    expect(moonLitReflectance(2, 1)).toBeGreaterThan(moonLitReflectance(0.8, 1));
    expect(moonLitReflectance(2, 1)).toBeLessThan(1);
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
  // The independent ~33-degree reference is approximate, so allow +/-1 degree.
  expect(sky.moon.altitude).toBeGreaterThan(32);
  expect(sky.moon.altitude).toBeLessThan(34);
  expect(sky.moon.illumination).toBeGreaterThan(0.4);
  expect(sky.moon.illumination).toBeLessThan(0.49);
});
