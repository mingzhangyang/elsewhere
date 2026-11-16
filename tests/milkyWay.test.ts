import { describe, expect, it } from 'vitest';
import { galacticFromEquatorial } from '../src/domain/galactic';
import { calculateStarField, precessionMatrixJ2000ToDate } from '../src/domain/stars';
import { limitingMagnitude, milkyWayVisibility, twilightVisibility } from '../src/domain/starVisibility';
import { MILKY_WAY_FRAGMENT } from '../src/renderer/milkyWay';

const noMoon = { altitude: -20, illumination: 0 };

describe('galactic coordinates', () => {
  it('puts the galactic center at l 0°, b 0°', () => {
    const { l, b } = galacticFromEquatorial(266.405, -28.936);
    expect(Math.min(l, 360 - l)).toBeLessThan(0.01);
    expect(Math.abs(b)).toBeLessThan(0.01);
  });

  it('puts the north galactic pole at b +90°', () => {
    expect(galacticFromEquatorial(192.8595, 27.1283).b).toBeGreaterThan(89.99);
  });

  it('places Deneb in the plane in Cygnus and Polaris well away from it', () => {
    const deneb = galacticFromEquatorial(310.358, 45.28);
    expect(deneb.l).toBeCloseTo(84.3, 0);
    expect(Math.abs(deneb.b)).toBeLessThan(3);
    expect(galacticFromEquatorial(37.95, 89.26).b).toBeGreaterThan(25);
  });

  it('builds the shader from the same rotation', () => {
    expect(MILKY_WAY_FRAGMENT).toContain('-0.0548755604, 0.4941094279, -0.867666149');
  });

  it('precesses the J2000 galactic center correctly at both supported boundary centuries', () => {
    const ra = (266.405 * Math.PI) / 180;
    const dec = (-28.936 * Math.PI) / 180;
    const j2000 = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
    for (const [instant, expectedRa, expectedDec] of [
      ['1900-01-01T12:00:00Z', 264.8175, -28.8934],
      ['2000-01-01T12:00:00Z', 266.405, -28.936],
      ['2100-01-01T12:00:00Z', 267.9942, -28.9632],
    ] as const) {
      const m = precessionMatrixJ2000ToDate(new Date(instant));
      const dateVector = [
        m[0] * j2000[0] + m[1] * j2000[1] + m[2] * j2000[2],
        m[3] * j2000[0] + m[4] * j2000[1] + m[5] * j2000[2],
        m[6] * j2000[0] + m[7] * j2000[1] + m[8] * j2000[2],
      ];
      expect(((Math.atan2(dateVector[1], dateVector[0]) * 180) / Math.PI + 360) % 360).toBeCloseTo(
        expectedRa,
        2,
      );
      expect((Math.asin(dateVector[2]) * 180) / Math.PI).toBeCloseTo(expectedDec, 2);

      // The shader samples J2000 local coordinates while the rendered sphere is precessed.
      // Undoing the transform must recover the same galactic center at every tested epoch.
      const recovered = [
        m[0] * dateVector[0] + m[3] * dateVector[1] + m[6] * dateVector[2],
        m[1] * dateVector[0] + m[4] * dateVector[1] + m[7] * dateVector[2],
        m[2] * dateVector[0] + m[5] * dateVector[1] + m[8] * dateVector[2],
      ];
      const galactic = galacticFromEquatorial(
        ((Math.atan2(recovered[1], recovered[0]) * 180) / Math.PI + 360) % 360,
        (Math.asin(recovered[2]) * 180) / Math.PI,
      );
      expect(Math.min(galactic.l, 360 - galactic.l)).toBeLessThan(0.01);
      expect(Math.abs(galactic.b)).toBeLessThan(0.01);
    }
  });

  it('matches the catalog\'s UTC-noon precession epoch even just after midnight', () => {
    const field = calculateStarField(40.7, -74, new Date('2100-01-01T00:00:01Z'), 0);
    expect(field.precession).toEqual(
      precessionMatrixJ2000ToDate(new Date('2100-01-01T12:00:00Z')),
    );
  });
});

describe('Milky Way visibility', () => {
  it('shows fully in a dark, moonless night', () => {
    expect(milkyWayVisibility(limitingMagnitude('dark', noMoon), -30)).toBe(1);
  });

  it('is faint in a suburban sky and gone from a city sky', () => {
    const suburban = milkyWayVisibility(limitingMagnitude('suburban', noMoon), -30);
    expect(suburban).toBeGreaterThan(0);
    expect(suburban).toBeLessThan(0.2);
    expect(milkyWayVisibility(limitingMagnitude('city', noMoon), -30)).toBe(0);
  });

  it('is washed out by a high full Moon, even in a dark sky', () => {
    const fullMoon = { altitude: 60, illumination: 1 };
    expect(milkyWayVisibility(limitingMagnitude('dark', fullMoon), -30)).toBeLessThan(0.25);
  });

  it('needs a darker sky than the stars as twilight ends', () => {
    expect(milkyWayVisibility(6, 0)).toBe(0);
    for (const sunAltitude of [-15, -12, -9, -6])
      expect(milkyWayVisibility(6, sunAltitude)).toBeLessThan(twilightVisibility(sunAltitude));
    expect(milkyWayVisibility(6, -12)).toBeLessThan(0.5);
    expect(milkyWayVisibility(6, -18)).toBe(1);
  });
});
