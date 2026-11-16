import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createCameraControls } from '../src/renderer/cameraControls';

it.each([
  [30, 0],
  [-30, 0],
  [0, 30],
  [0, -30],
])('moves a projected star with a pointer drag (%d, %d)', (dx, dy) => {
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = vi.fn();
  canvas.hasPointerCapture = () => false;
  const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 5000);
  const pick = vi.fn();
  const controls = createCameraControls(canvas, camera, vi.fn(), pick, undefined, {
    heading: 0,
    altitude: 0,
    fov: 66,
  });
  const star = new THREE.Vector3(0, 0, -1000);
  const project = () => {
    camera.updateMatrixWorld();
    const point = star.clone().project(camera);
    return { x: point.x, y: -point.y };
  };
  const before = project();
  const pointer = (type: string, x: number, y: number) =>
    canvas.dispatchEvent(
      Object.assign(new MouseEvent(type, { clientX: x, clientY: y, button: 0 }), { pointerId: 1 }),
    );
  pointer('pointerdown', 100, 100);
  pointer('pointermove', 100 + dx, 100 + dy);
  pointer('pointerup', 100 + dx, 100 + dy);
  const after = project();
  if (dx) expect((after.x - before.x) * dx).toBeGreaterThan(0);
  if (dy) expect((after.y - before.y) * dy).toBeGreaterThan(0);
  expect(pick).not.toHaveBeenCalled();
  controls.dispose();
});
