import { describe, expect, it } from 'vitest';
import { galacticFromEquatorial } from '../src/domain/galactic';
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
