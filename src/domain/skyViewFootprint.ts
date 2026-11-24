import { projectSkyChart, type SkyChartPoint } from './skyChartProjection';

type Ray = [east: number, up: number, north: number];
const RAD = Math.PI / 180;

interface ViewDirection {
  heading: number;
  altitude: number;
  fov: number;
}

function interpolate(a: Ray, b: Ray, t: number): Ray {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function normalized(ray: Ray): Ray {
  const length = Math.hypot(...ray);
  return [ray[0] / length, ray[1] / length, ray[2] / length];
}

function project(ray: Ray): SkyChartPoint {
  const altitude = Math.atan2(Math.max(0, ray[1]), Math.hypot(ray[0], ray[2])) / RAD;
  const azimuth = Math.atan2(ray[0], ray[2]) / RAD;
  return projectSkyChart(altitude, azimuth)!;
}

/** Inverse of the north-up, east-left azimuthal equidistant sky chart. */
export function unprojectSkyChart({ x, y }: SkyChartPoint): { altitude: number; azimuth: number } | null {
  const radius = Math.hypot(x, y);
  if (!Number.isFinite(radius) || radius > 1) return null;
  return {
    altitude: 90 * (1 - radius),
    azimuth: radius === 0 ? 0 : (Math.atan2(-x, -y) / RAD + 360) % 360,
  };
}

/**
 * Perspective viewport intersected with the above-horizon hemisphere. The camera uses a vertical
 * FOV and zero roll (YXZ). Clip its rectangle of unnormalized rays against up >= 0 BEFORE mapping
 * to the disc: the inserted edge is a great-circle segment along the mathematical horizon.
 * Sampling the normalized spherical edges (at most 4 degrees apart) also handles the zenith,
 * wraparound and very wide viewports without a seam or a false straight chord across the horizon.
 */
export function projectViewFootprint(view: ViewDirection, aspect: number): SkyChartPoint[] {
  if (!Number.isFinite(aspect) || aspect <= 0) return [];
  const h = view.heading * RAD;
  const p = view.altitude * RAD;
  const v = Math.tan((view.fov * RAD) / 2);
  const w = v * aspect;
  const sinH = Math.sin(h);
  const cosH = Math.cos(h);
  const sinP = Math.sin(p);
  const cosP = Math.cos(p);
  const corner = (x: number, y: number): Ray => [
    sinH * (cosP - y * sinP) + x * cosH,
    sinP + y * cosP,
    cosH * (cosP - y * sinP) - x * sinH,
  ];
  const corners = [corner(-w, -v), corner(w, -v), corner(w, v), corner(-w, v)];
  const clipped: Ray[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    if (a[1] >= 0) clipped.push(a);
    if ((a[1] >= 0) !== (b[1] >= 0)) {
      const intersection = interpolate(a, b, a[1] / (a[1] - b[1]));
      intersection[1] = 0;
      clipped.push(intersection);
    }
  }
  if (clipped.length < 3) return [];
  const points: SkyChartPoint[] = [];
  for (let i = 0; i < clipped.length; i++) {
    const a = normalized(clipped[i]);
    const b = normalized(clipped[(i + 1) % clipped.length]);
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const angle = Math.acos(dot);
    const steps = Math.max(1, Math.ceil(angle / (4 * RAD)));
    const sinAngle = Math.sin(angle);
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const ray: Ray =
        sinAngle < 1e-10
          ? interpolate(a, b, t)
          : [
              (a[0] * Math.sin((1 - t) * angle) + b[0] * Math.sin(t * angle)) / sinAngle,
              (a[1] * Math.sin((1 - t) * angle) + b[1] * Math.sin(t * angle)) / sinAngle,
              (a[2] * Math.sin((1 - t) * angle) + b[2] * Math.sin(t * angle)) / sinAngle,
            ];
      points.push(project(ray));
    }
  }
  return points;
}
