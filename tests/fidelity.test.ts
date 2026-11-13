import * as THREE from 'three';
import { expect, it } from 'vitest';
import { CONSTELLATIONS, STAR_CATALOG, movedEquatorial } from '../src/lib/stars';
import { calculateSky } from '../src/lib/astronomy';
import { directionVector } from '../src/renderer/resources';
import { advancePrecipitation, windVector, wrap } from '../src/renderer/precipitation';
import { NEW_YORK, SYDNEY } from './fixtures/locations';

it('retains catalog identity, motion and real pattern endpoints', () => {
  expect(STAR_CATALOG.length).toBe(5070);
  expect(new Set(STAR_CATALOG.map((s) => s.id)).size).toBe(STAR_CATALOG.length);
  for (const pattern of CONSTELLATIONS)
    for (const id of pattern.lines.flat()) expect(STAR_CATALOG.some((s) => s.id === id)).toBe(true);
  const arcturus = STAR_CATALOG.find((s) => s.name === 'Arcturus')!;
  expect(movedEquatorial(arcturus, 100).dec).toBeLessThan(arcturus.dec - 0.05);
});
it.each([NEW_YORK, SYDNEY])(
  'orients the lunar near side toward $name with an orthonormal body frame',
  (place) => {
    const sky = calculateSky(place, new Date('2026-11-13T12:00Z'));
    const prime = new THREE.Vector3(...sky.moon.prime),
      north = new THREE.Vector3(...sky.moon.north);
    expect(prime.length()).toBeCloseTo(1, 10);
    expect(north.length()).toBeCloseTo(1, 10);
    expect(prime.dot(north)).toBeCloseTo(0, 10);
    expect(prime.dot(directionVector(sky.moon.altitude, sky.moon.azimuth).negate())).toBeGreaterThan(0.97);
  },
);
it('moves downwind and recycles precipitation in every axis over long runs', () => {
  expect(windVector(10, 0).z).toBeCloseTo(10);
  expect(windVector(10, 90).x).toBeCloseTo(-10);
  expect(wrap(-1001, -35, 35)).toBeGreaterThanOrEqual(-35);
  const positions = new THREE.BufferAttribute(new Float32Array([0, 0, -20, 34, 49, -73]), 3);
  for (let i = 0; i < 18000; i++) advancePrecipitation(positions, 0.1, windVector(30, 45), false);
  for (let i = 0; i < 2; i++) {
    expect(positions.getX(i)).toBeGreaterThanOrEqual(-35);
    expect(positions.getX(i)).toBeLessThan(35);
    expect(positions.getY(i)).toBeGreaterThanOrEqual(-26);
    expect(positions.getY(i)).toBeLessThan(50);
    expect(positions.getZ(i)).toBeGreaterThanOrEqual(-74);
    expect(positions.getZ(i)).toBeLessThan(-8);
  }
});
