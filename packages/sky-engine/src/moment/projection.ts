import type { CameraView } from '../contracts';
import type { SkyDirection } from '../domain/galactic';

const RAD = Math.PI / 180;

/** A point in normalized device coordinates (−1 to 1, y up) and whether it is in front of the camera. */
export interface Projected {
  x: number;
  y: number;
  front: boolean;
}

function cameraBasis(view: CameraView) {
  const h = view.heading * RAD,
    p = view.altitude * RAD;
  const forward = [Math.cos(p) * Math.sin(h), Math.sin(p), -Math.cos(p) * Math.cos(h)];
  const right = [Math.cos(h), 0, Math.sin(h)];
  const up = [-Math.sin(p) * Math.sin(h), Math.cos(p), Math.sin(p) * Math.cos(h)];
  const scale = Math.tan((view.fov * RAD) / 2);
  return { forward, right, up, scale };
}

/**
 * The renderer's perspective projection without three.js: a camera turned to `view.heading` and
 * tilted up `view.altitude` with no roll, `view.fov` degrees tall, `aspect` wide over high.
 * The illustrated image uses it so every object lands where the realistic image shows it
 * (tests/moment.test.ts checks it against three.js).
 */
export function createProjection(view: CameraView, aspect: number) {
  const { forward, right, up, scale } = cameraBasis(view);
  return (altitude: number, azimuth: number): Projected => {
    const a = altitude * RAD,
      z = azimuth * RAD;
    const d = [Math.sin(z) * Math.cos(a), Math.sin(a), -Math.cos(z) * Math.cos(a)];
    const depth = d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2];
    const x = d[0] * right[0] + d[2] * right[2];
    const y = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
    if (depth <= 1e-6) return { x: 0, y: 0, front: false };
    return { x: x / depth / (scale * aspect), y: y / depth / scale, front: true };
  };
}
export type Projection = ReturnType<typeof createProjection>;

/** Inverse of the postcard's centered cover projection, in east/up/south scene axes. */
export function createSkyRay(view: CameraView, aspect: number, width: number, height: number) {
  const { forward, right, up, scale } = cameraBasis(view);
  const coverHeight = Math.max(width / aspect, height);
  const factor = (2 * scale) / coverHeight;
  return (x: number, y: number): SkyDirection => {
    const u = (x - width / 2) * factor;
    const v = (height / 2 - y) * factor;
    const dx = forward[0] + u * right[0] + v * up[0];
    const dy = forward[1] + v * up[1];
    const dz = forward[2] + u * right[2] + v * up[2];
    const length = Math.hypot(dx, dy, dz);
    return [dx / length, dy / length, dz / length];
  };
}

/** Centered cover crop, shared by the realistic capture, painting, overlays and inverse sky rays. */
export function createCoverProjection(view: CameraView, aspect: number, width: number, height: number) {
  const coverW = Math.max(width, height * aspect);
  const coverH = coverW / aspect;
  const left = (width - coverW) / 2;
  const top = (height - coverH) / 2;
  const project = createProjection(view, aspect);
  return {
    coverW,
    coverH,
    left,
    top,
    toCanvas(altitude: number, azimuth: number): Projected {
      const p = project(altitude, azimuth);
      return { x: left + ((p.x + 1) / 2) * coverW, y: top + ((1 - p.y) / 2) * coverH, front: p.front };
    },
  };
}
