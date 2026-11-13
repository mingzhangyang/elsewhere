import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createCelestialLayers } from '../src/renderer/celestialLayers';
import { calculateSky } from '../src/lib/astronomy';
import { NEW_YORK } from './fixtures/locations';
import { pickStarIndex, starAlpha } from '../src/renderer/starPicking';

it('picks the centered star rather than a shallower neighbor and skips extinguished stars', () => {
  const sky = calculateSky(NEW_YORK, new Date('2026-11-13T04:00Z'));
  const mizar = sky.stars.find((s) => s.name === 'Mizar')!;
  const alcor = sky.stars.find((s) => s.name === 'Alcor')!;
  const direction = (star: typeof mizar) => {
    const alt = THREE.MathUtils.degToRad(star.altitude);
    const az = THREE.MathUtils.degToRad(star.azimuth);
    return new THREE.Vector3(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az));
  };
  const geometry = new THREE.BufferGeometry().setFromPoints(
    [mizar, alcor].map((s) => direction(s).multiplyScalar(1770)),
  );
  const material = new THREE.PointsMaterial();
  const points = new THREE.Points(geometry, material);
  const ray = new THREE.Raycaster(new THREE.Vector3(), direction(mizar));
  ray.params.Points.threshold = 15;
  const hits = ray.intersectObject(points);
  expect(hits[0].index).toBe(1); // This was the incorrect selection before distance-to-ray ranking.
  expect(pickStarIndex(hits, () => 1)).toBe(0);
  expect(pickStarIndex(hits, (i) => (i === 0 ? 0 : 1))).toBe(1);
  expect(pickStarIndex(hits, () => 0)).toBeUndefined();
  expect(starAlpha({ ...mizar, altitude: -1 }, 6)).toBe(0);
  expect(starAlpha({ ...mizar, magnitude: 8 }, 3)).toBe(0);
  expect(starAlpha(mizar, 6)).toBeGreaterThan(0.05);
  geometry.dispose();
  material.dispose();
});

it('updates moving sky layers without reallocating their geometry or labels', () => {
  const scene = new THREE.Scene();
  const text = vi.fn(() => new THREE.Sprite(new THREE.SpriteMaterial()));
  const initial = calculateSky(NEW_YORK, new Date('2026-11-12T12:00Z'));
  const layers = createCelestialLayers(scene, initial.stars, text);
  const flags = { stars: true, labels: true, constellations: true };
  layers.update(initial.stars, flags, 1);
  const ids = scene.children.map((o) => o.uuid);
  const geometries = scene.children
    .filter((o) => o instanceof THREE.LineSegments)
    .map((o) => (o as THREE.LineSegments).geometry);
  const firstPoint = geometries[0].getAttribute('position').getX(0);
  const calls = text.mock.calls.length;
  for (let i = 1; i <= 100; i++) {
    const sky = calculateSky(NEW_YORK, new Date(Date.parse('2026-11-12T12:00Z') + i * 60000), initial.events);
    layers.update(sky.stars, flags, 1);
  }
  expect(scene.children.map((o) => o.uuid)).toEqual(ids);
  expect(text).toHaveBeenCalledTimes(calls);
  expect(geometries[0].getAttribute('position').getX(0)).not.toBe(firstPoint);
  layers.update(initial.stars, { ...flags, labels: false }, 1);
  expect(scene.children.filter((o) => o instanceof THREE.Sprite).every((o) => !o.visible)).toBe(true);
  layers.update(initial.stars, flags, 0);
  expect(scene.children.every((o) => !o.visible)).toBe(true);
});
