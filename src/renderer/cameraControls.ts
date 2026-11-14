import * as THREE from 'three';
import { DEFAULT_FOV, MAX_FOV, MIN_FOV, ZOOM_STEP, type CameraView } from '../lib/persistence';

export function createCameraControls(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  onHeading: (degrees: number) => void,
  onPick: (x: number, y: number) => void,
  onChange?: (view: CameraView) => void,
  initial?: CameraView,
) {
  let yaw = 0;
  let pitch = THREE.MathUtils.degToRad(18);
  const pointers = new Map<number, { x: number; y: number }>();
  let origin = { x: 0, y: 0 };
  let dragged = false;
  const lifetime = new AbortController();
  const apply = () => {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    const heading = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
    onHeading(heading);
    onChange?.({ heading, altitude: THREE.MathUtils.radToDeg(pitch), fov: camera.fov });
  };
  const setFov = (fov: number) => {
    camera.fov = THREE.MathUtils.clamp(fov, MIN_FOV, MAX_FOV);
    camera.updateProjectionMatrix();
  };
  /** Zoom is multiplicative (`factor` < 1 zooms in) so each step feels alike from 92° down to 2°. */
  const zoom = (factor: number) => {
    setFov(camera.fov * factor);
    apply();
  };
  // Looking moves the view by the same share of the screen at any zoom.
  const lookScale = () => camera.fov / DEFAULT_FOV;
  const focus = (altitude: number, azimuth: number, fov?: number) => {
    if (fov !== undefined) setFov(fov);
    pitch = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(altitude), -Math.PI / 2, Math.PI / 2);
    yaw = -THREE.MathUtils.degToRad(azimuth);
    apply();
  };
  const resetView = () => focus(18, 0, DEFAULT_FOV);
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Sky view. Arrow keys look around, plus and minus zoom, Home resets the view. Use the object list to select objects.',
  );
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || pointers.size >= 2) return;
      canvas.focus({ preventScroll: true });
      if (!pointers.size) {
        origin = { x: event.clientX, y: event.clientY };
        dragged = false;
      } else dragged = true;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
    },
    { signal: lifetime.signal },
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const oldDistance = distance();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const nextDistance = distance();
        if (oldDistance > 0 && nextDistance > 0) zoom(oldDistance / nextDistance);
      } else {
        yaw -= (event.clientX - previous.x) * 0.0038 * lookScale();
        pitch = THREE.MathUtils.clamp(
          pitch - (event.clientY - previous.y) * 0.0034 * lookScale(),
          -Math.PI / 2,
          Math.PI / 2,
        );
        if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 5) dragged = true;
        apply();
      }
    },
    { signal: lifetime.signal },
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (!pointers.has(event.pointerId)) return;
      const shouldPick = pointers.size === 1 && !dragged;
      pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (shouldPick) onPick(event.clientX, event.clientY);
    },
    { signal: lifetime.signal },
  );
  const cancel = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    dragged = true;
  };
  canvas.addEventListener('pointercancel', cancel, { signal: lifetime.signal });
  canvas.addEventListener('lostpointercapture', cancel, { signal: lifetime.signal });
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoom(Math.exp(event.deltaY * 0.002));
    },
    { passive: false, signal: lifetime.signal },
  );
  canvas.addEventListener(
    'keydown',
    (event) => {
      const step = (((event.shiftKey ? 10 : 3) * Math.PI) / 180) * lookScale();
      if (event.key === 'ArrowLeft') yaw += step;
      else if (event.key === 'ArrowRight') yaw -= step;
      else if (event.key === 'ArrowUp') pitch = Math.min(Math.PI / 2, pitch + step);
      else if (event.key === 'ArrowDown') pitch = Math.max(-Math.PI / 2, pitch - step);
      else if (event.key === '+' || event.key === '=') zoom(ZOOM_STEP);
      else if (event.key === '-') zoom(1 / ZOOM_STEP);
      else if (event.key === 'Home') resetView();
      else return;
      event.preventDefault();
      apply();
    },
    { signal: lifetime.signal },
  );
  if (initial) focus(initial.altitude, initial.heading, initial.fov);
  else resetView();
  return { resetView, focus, zoom, dispose: () => lifetime.abort() };
}
