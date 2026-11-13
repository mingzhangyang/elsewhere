import { describe, expect, it } from 'vitest';
import { calculateSky } from '../src/lib/astronomy';
import { horizontalFromEquatorial } from '../src/lib/stars';
import { NEW_YORK, SYDNEY, TROMSO } from './fixtures/locations';

describe('sky invariants', () => {
  it('places an equatorial object at the zenith at transit on the equator', () => {
    expect(horizontalFromEquatorial(6, 0, 0, 0, 6).altitude).toBeCloseTo(90, 6);
  });
  it.each([NEW_YORK, SYDNEY, TROMSO])('keeps physical values bounded for $name', (observer) => {
    const sky = calculateSky(observer, new Date('2026-06-21T12:00:00Z'));
    for (const body of [sky.sun, sky.moon, ...sky.stars]) {
      expect(body.altitude).toBeGreaterThanOrEqual(-90);
      expect(body.altitude).toBeLessThanOrEqual(90);
      expect(body.azimuth).toBeGreaterThanOrEqual(0);
      expect(body.azimuth).toBeLessThan(360);
    }
    expect(sky.moon.illumination).toBeGreaterThanOrEqual(0);
    expect(sky.moon.illumination).toBeLessThanOrEqual(1);
    expect(sky.moon.distanceKm).toBeGreaterThan(350000);
    expect(sky.moon.distanceKm).toBeLessThan(420000);
  });
  it('represents polar day and polar night', () => {
    expect(calculateSky(TROMSO, new Date('2026-06-21T12:00Z')).events.daylightHours).toBe(24);
    expect(calculateSky(TROMSO, new Date('2026-12-21T12:00Z')).events.daylightHours).toBe(0);
  });
});
