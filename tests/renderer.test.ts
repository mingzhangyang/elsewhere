import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createCelestialLayers } from '../src/renderer/celestialLayers';
import { calculateSky } from '../src/lib/astronomy';
import { NEW_YORK } from './fixtures/locations';

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
