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
import {
  apparentDirection,
  createPlaybackTurn,
  diurnalTurn,
  refraction,
  setRotationMatrix,
} from '../src/renderer/starMaterial';
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

it('returns to the displayed instant when playback stops or motion is reduced between ticks', () => {
  const turn = createPlaybackTurn(0.5);
  turn.setRate(600, 0);
  turn.tick(1000);
  expect(turn.seconds(1150, false)).toBeCloseTo(90, 9); // 0.15 s real at 600×
  expect(turn.seconds(1150, true)).toBe(0);
  expect(turn.seconds(5000, false)).toBe(300); // Capped while waiting for a late tick.
  turn.setRate(0, 1150); // Pause mid-tick: nothing new arrives to reset the scene.
  expect(turn.seconds(1150, false)).toBe(0);
  expect(turn.seconds(9000, false)).toBe(0);
  expect(turn.playing()).toBe(false);
});

it('mirrors the shader refraction on the CPU', () => {
  for (const altitude of [-30, -1.5, -0.4, 0, 0.3, 2, 10, 45, 89.9])
    expect(refraction(altitude)).toBeCloseTo(Astronomy.Refraction('normal', altitude), 10);
});

// Overlays must follow the shader's order (turn the geometric direction, then refract); turning an
// already refracted position puts a horizon star's marker or line endpoint beside its point.
it('keeps low overlays on their stars through a playback turn', () => {
  const date = new Date('2026-11-13T04:00Z');
  const span = 120; // One 200 ms tick at 600×.
  const start = calculateSky(NEW_YORK, date);
  const later = calculateSky(NEW_YORK, new Date(date.getTime() + span * 1000));
  const base = setRotationMatrix(new THREE.Matrix4(), start.starField.rotation);
  const turn = diurnalTurn(start.starField.rotation, span);
  const low = start.stars.findIndex((star, i) => Math.abs(later.stars[i].altitude - 0.2) < 0.15);
  expect(low).toBeGreaterThan(-1);
  const v = start.starField.vectors;
  const geometric = new THREE.Vector3(v[low * 3], v[low * 3 + 1], v[low * 3 + 2]).applyMatrix4(base);
  const drawn = apparentDirection(geometric.applyQuaternion(turn));
  const truth = directionVector(later.stars[low].altitude, later.stars[low].azimuth);
  const stale = directionVector(start.stars[low].altitude, start.stars[low].azimuth).applyQuaternion(turn);
  const degrees = (a: THREE.Vector3, b: THREE.Vector3) => THREE.MathUtils.radToDeg(a.angleTo(b));
  expect(degrees(drawn, truth)).toBeLessThan(0.005);
  expect(degrees(stale, truth)).toBeGreaterThan(0.03);
});
