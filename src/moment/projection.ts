import type { CameraView } from '../lib/persistence';

const RAD = Math.PI / 180;

/** A point in normalized device coordinates (−1 to 1, y up) and whether it is in front of the camera. */
export interface Projected {
  x: number;
  y: number;
  front: boolean;
}

/**
 * The renderer's perspective projection without three.js: a camera turned to `view.heading` and
 * tilted up `view.altitude` with no roll, `view.fov` degrees tall, `aspect` wide over high.
 * The illustrated image uses it so every object lands where the realistic image shows it
 * (tests/moment.test.ts checks it against three.js).
 */
export function createProjection(view: CameraView, aspect: number) {
  const h = view.heading * RAD,
    p = view.altitude * RAD;
  const forward = [Math.cos(p) * Math.sin(h), Math.sin(p), -Math.cos(p) * Math.cos(h)];
  const right = [Math.cos(h), 0, Math.sin(h)];
  const up = [-Math.sin(p) * Math.sin(h), Math.cos(p), Math.sin(p) * Math.cos(h)];
  const scale = Math.tan((view.fov * RAD) / 2);
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
