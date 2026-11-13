import * as THREE from 'three';
import type { CameraView } from '../lib/persistence';

export function createCameraControls(canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera,
  onHeading: (degrees: number) => void, onPick: (x: number, y: number) => void,
  onChange?: (view: CameraView) => void, initial?: CameraView) {
  let yaw = 0;
  let pitch = THREE.MathUtils.degToRad(18);
  const pointers = new Map<number, { x: number; y: number }>();
  let origin = { x: 0, y: 0 };
  let dragged = false;
  const lifetime = new AbortController();
  const apply = () => {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    const heading = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
    onHeading(heading);
    onChange?.({ heading, altitude: THREE.MathUtils.radToDeg(pitch), fov: camera.fov });
  };
  const zoom = (delta: number) => { camera.fov = THREE.MathUtils.clamp(camera.fov + delta, 20, 92); camera.updateProjectionMatrix(); apply(); };
  const focus = (altitude: number, azimuth: number) => { pitch = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(altitude), -1.5, 1.5); yaw = -THREE.MathUtils.degToRad(azimuth); apply(); };
  const resetView = () => { camera.fov = 66; camera.updateProjectionMatrix(); focus(18, 0); };
  const distance = () => { const [a, b] = [...pointers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Sky view. Arrow keys look around, plus and minus zoom, Home resets the view. Use the object list to select objects.');
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointers.size >= 2) return;
    canvas.focus({ preventScroll: true });
    if (!pointers.size) { origin = { x: event.clientX, y: event.clientY }; dragged = false; }
    else dragged = true;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
  }, { signal: lifetime.signal });
  canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const oldDistance = distance();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const nextDistance = distance();
      if (oldDistance > 0 && nextDistance > 0) zoom(camera.fov * (oldDistance / nextDistance - 1));
    } else {
      yaw -= (event.clientX - previous.x) * .0038;
      pitch = THREE.MathUtils.clamp(pitch - (event.clientY - previous.y) * .0034, -1.5, 1.5);
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 5) dragged = true;
      apply();
    }
  }, { signal: lifetime.signal });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const shouldPick = pointers.size === 1 && !dragged;
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (shouldPick) onPick(event.clientX, event.clientY);
  }, { signal: lifetime.signal });
  const cancel = (event: PointerEvent) => { pointers.delete(event.pointerId); dragged = true; };
  canvas.addEventListener('pointercancel', cancel, { signal: lifetime.signal });
  canvas.addEventListener('lostpointercapture', cancel, { signal: lifetime.signal });
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); zoom(event.deltaY * .025); }, { passive: false, signal: lifetime.signal });
  canvas.addEventListener('keydown', (event) => {
    const step = (event.shiftKey ? 10 : 3) * Math.PI / 180;
    if (event.key === 'ArrowLeft') yaw += step;
    else if (event.key === 'ArrowRight') yaw -= step;
    else if (event.key === 'ArrowUp') pitch = Math.min(1.5, pitch + step);
    else if (event.key === 'ArrowDown') pitch = Math.max(-1.5, pitch - step);
    else if (event.key === '+' || event.key === '=') zoom(-5);
    else if (event.key === '-') zoom(5);
    else if (event.key === 'Home') resetView();
    else return;
    event.preventDefault(); apply();
  }, { signal: lifetime.signal });
  if (initial) { camera.fov = initial.fov; camera.updateProjectionMatrix(); focus(initial.altitude, initial.heading); }
  else resetView();
  return { resetView, focus, zoom, dispose: () => lifetime.abort() };
}
