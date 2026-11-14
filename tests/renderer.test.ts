import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createCelestialLayers } from '../src/renderer/celestialLayers';
import { calculateSky } from '../src/lib/astronomy';
import { NEW_YORK } from './fixtures/locations';
import {
  pickStarAt,
  pickStarIndex,
  pickThreshold,
  STAR_PICK_RADIUS_PX,
  starAlpha,
} from '../src/renderer/starPicking';

const VIEWPORT = { left: 0, top: 0, width: 390, height: 449 };

function cameraAt(fov: number) {
  const camera = new THREE.PerspectiveCamera(fov, VIEWPORT.width / VIEWPORT.height, 0.1, 5000);
  camera.updateMatrixWorld();
  return camera;
}

/** World position on the star sphere that projects to client pixel (`x`, `y`). */
function pointAtPixel(camera: THREE.PerspectiveCamera, x: number, y: number) {
  const ndc = new THREE.Vector3((x / VIEWPORT.width) * 2 - 1, -(y / VIEWPORT.height) * 2 + 1, 0.5);
  return ndc.unproject(camera).normalize().multiplyScalar(1770);
}

function starsAt(points: THREE.Vector3[]) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Points(geometry, new THREE.PointsMaterial());
}

it('picks the centered star rather than a shallower neighbor and skips extinguished stars', () => {
  const sky = calculateSky(NEW_YORK, new Date('2026-11-13T04:00Z'));
  const mizar = sky.stars.find((s) => s.name === 'Mizar')!;
  const alcor = sky.stars.find((s) => s.name === 'Alcor')!;
  const direction = (star: typeof mizar) => {
    const alt = THREE.MathUtils.degToRad(star.altitude);
    const az = THREE.MathUtils.degToRad(star.azimuth);
    return new THREE.Vector3(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az));
  };
  const points = starsAt([mizar, alcor].map((s) => direction(s).multiplyScalar(1770)));
  const camera = cameraAt(66);
  camera.lookAt(direction(mizar));
  camera.updateMatrixWorld();
  const pick = (alpha: (i: number) => number) =>
    pickStarAt(points, camera, 195, 224.5, VIEWPORT, 1770, alpha);
  expect(pick(() => 1)).toBe(0);
  expect(pick((i) => (i === 0 ? 0 : 1))).toBe(1);
  expect(pick(() => 0)).toBeUndefined();
  expect(starAlpha({ ...mizar, altitude: -1 }, 6)).toBe(0);
  expect(starAlpha({ ...mizar, magnitude: 8 }, 3)).toBe(0);
  expect(starAlpha(mizar, 6)).toBeGreaterThan(0.05);
});

// Off-center, a perspective camera magnifies the world-space ray threshold; the screen radius must not grow.
it.each([
  { fov: 92, star: [335, 224.5] },
  { fov: 92, star: [380, 440] },
  { fov: 66, star: [20, 10] },
  { fov: 20, star: [195, 224.5] },
])('limits star taps to $fov° fov at $star to 20 screen pixels', ({ fov, star: [sx, sy] }) => {
  const camera = cameraAt(fov);
  const points = starsAt([pointAtPixel(camera, sx, sy)]);
  const tap = (dx: number, dy: number) =>
    pickStarAt(points, camera, sx + dx, sy + dy, VIEWPORT, 1770, () => 1);
  expect(tap(0, 0)).toBe(0);
  expect(tap(-19, 0)).toBe(0);
  expect(tap(0, -19)).toBe(0);
  expect(tap(-13, -13)).toBe(0);
  expect(tap(-22, 0)).toBeUndefined();
  expect(tap(0, -22)).toBeUndefined();
  expect(tap(-30, 0)).toBeUndefined();
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

it.each([20, 66, 92])('keeps the star tap radius at a fixed screen size at %d° field of view', (fov) => {
  const height = 700;
  const camera = new THREE.PerspectiveCamera(fov, 390 / height, 0.1, 5000);
  camera.updateMatrixWorld();
  const offset = pickThreshold(1770, fov, height);
  const center = new THREE.Vector3(0, 0, -1770).project(camera);
  const edge = new THREE.Vector3(0, offset, -1770).project(camera);
  expect(((edge.y - center.y) * height) / 2).toBeCloseTo(STAR_PICK_RADIUS_PX, 6);
});

it('needs the screen-space check: the ray threshold alone accepts a 30px tap off-center', () => {
  // Reviewer's case: 390×449, 92° fov, star 140px right of center, tapped 30px farther right.
  const camera = cameraAt(92);
  const points = starsAt([pointAtPixel(camera, 335, 224.5)]);
  const ray = new THREE.Raycaster();
  ray.params.Points = { threshold: pickThreshold(1770, 92, VIEWPORT.height) };
  ray.setFromCamera(new THREE.Vector2(((335 + 30) / 390) * 2 - 1, 0), camera);
  expect(ray.intersectObject(points)).toHaveLength(1);
  expect(pickStarAt(points, camera, 335 + 30, 224.5, VIEWPORT, 1770, () => 1)).toBeUndefined();
});

it('gives a tap on stars closer than a couple of pixels to the brighter one', () => {
  const hits = [{ index: 0 }, { index: 1 }, { index: 2 }] as THREE.Intersection[];
  const brightness = [0.4, 0.9, 1];
  const distance = [0.3, 0.8, 6];
  // Index 1 is 0.5px farther than 0 but brighter; index 2 is brightest but clearly farther away.
  expect(
    pickStarIndex(
      hits,
      (i) => brightness[i],
      (i) => distance[i],
    ),
  ).toBe(1);
  expect(
    pickStarIndex(
      hits,
      () => 1,
      (i) => [9, 4, 25][i],
    ),
  ).toBe(1);
});
