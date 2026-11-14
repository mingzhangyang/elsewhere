import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { expect, it } from 'vitest';
import {
  apparentStarVectors,
  calculateStarField,
  equatorialToScene,
  STAR_CATALOG,
} from '../src/domain/stars';
import { calculateSky } from '../src/domain/astronomy';
import { diurnalTurn, setRotationMatrix } from '../src/renderer/starMaterial';
import { directionVector } from '../src/renderer/resources';
import { NEW_YORK, SYDNEY } from './fixtures/locations';

it('places the catalog once per UTC day and reuses it for every instant in it', () => {
  const morning = apparentStarVectors(new Date('2026-11-12T01:00Z'));
  expect(apparentStarVectors(new Date('2026-11-12T23:59Z'))).toBe(morning);
  expect(apparentStarVectors(new Date('2026-11-13T00:01Z'))).not.toBe(morning);
  expect(morning).toHaveLength(STAR_CATALOG.length * 3);
});

it('turns the shared sphere into the same directions as each star’s horizontal position', () => {
  for (const location of [NEW_YORK, SYDNEY]) {
    const sky = calculateSky(location, new Date('2026-11-12T04:00Z'));
    const matrix = setRotationMatrix(new THREE.Matrix4(), sky.starField.rotation);
    for (const index of [0, 100, 2500, 5000]) {
      const v = sky.starField.vectors;
      const turned = new THREE.Vector3(v[index * 3], v[index * 3 + 1], v[index * 3 + 2]).applyMatrix4(matrix);
      const star = sky.stars[index];
      // Positions in `stars` include refraction; compare with the geometric altitude.
      const geometric = (Math.asin(turned.y) * 180) / Math.PI;
      const refracted = geometric + Astronomy.Refraction('normal', geometric);
      expect(refracted).toBeCloseTo(star.altitude, 4);
      if (Math.abs(star.altitude) < 85)
        expect(directionVector(geometric, star.azimuth).distanceTo(turned)).toBeLessThan(1e-5);
    }
  }
});

it('keeps the celestial pole at the observer’s latitude above due north', () => {
  const m = equatorialToScene(NEW_YORK.latitude, NEW_YORK.longitude, 3.2);
  const pole = new THREE.Vector3(m[2], m[5], m[8]);
  expect(pole.distanceTo(directionVector(NEW_YORK.latitude, 0))).toBeLessThan(1e-9);
});

it('extrapolates playback by turning the sky the way time does', () => {
  const date = new Date('2026-11-12T04:00Z');
  // One second, one 600× tick, and a whole night: far beyond any real gap between ticks.
  for (const span of [1, 120, 12 * 3600]) {
    const start = calculateStarField(SYDNEY.latitude, SYDNEY.longitude, date, Astronomy.SiderealTime(date));
    const later = new Date(date.getTime() + span * 1000);
    const end = calculateStarField(SYDNEY.latitude, SYDNEY.longitude, later, Astronomy.SiderealTime(later));
    const turn = diurnalTurn(start.rotation, span);
    const a = new THREE.Matrix4()
      .makeRotationFromQuaternion(turn)
      .multiply(setRotationMatrix(new THREE.Matrix4(), start.rotation));
    const b = setRotationMatrix(new THREE.Matrix4(), end.rotation);
    // Within 0.01°: sidereal time also carries nutation, which the extrapolation ignores.
    for (const vector of [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0.6, 0, 0.8),
    ])
      expect(vector.clone().applyMatrix4(a).angleTo(vector.clone().applyMatrix4(b))).toBeLessThan(2e-4);
  }
});
