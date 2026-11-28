// Frozen copy of the Sky Engine 0.3.0 lunar portrait pixel loop (packages/sky-engine/src/moment/
// moonPhase.ts at commit b144460). It is the reference the optimised renderer is compared with in
// test/moonPhasePixels.test.ts. Do not edit or "optimise" this file: it defines the expected output.
import type { MomentSnapshot } from '../../src/contracts';
import { brightLimbAngle } from '../../src/domain/planets';

type Vec = readonly [number, number, number];
const DEG = Math.PI / 180;
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function unit(v: Vec): Vec {
  const length = Math.hypot(...v);
  if (!Number.isFinite(length) || length < 1e-10) throw new Error('Invalid lunar basis.');
  return [v[0] / length, v[1] / length, v[2] / length];
}
function projected(v: Vec, normal: Vec): Vec {
  const d = dot(v, normal);
  return unit([v[0] - d * normal[0], v[1] - d * normal[1], v[2] - d * normal[2]]);
}

export interface ReferenceTexture {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function referenceMoonPixels(
  width: number,
  height: number,
  scene: Pick<MomentSnapshot, 'sky'>,
  options: {
    orientation: 'observer' | 'north-up';
    background: 'transparent' | 'dark' | 'light';
    earthshine: boolean;
  },
  texture: ReferenceTexture,
): Uint8ClampedArray {
  const { orientation, background, earthshine } = options;
  const moon = scene.sky.moon;
  const sun = scene.sky.sun;
  const az = moon.azimuth * DEG;
  const alt = moon.geometricAltitude * DEG;
  const front: Vec = [-Math.cos(alt) * Math.sin(az), -Math.sin(alt), Math.cos(alt) * Math.cos(az)];
  const observerRight: Vec = [Math.cos(az), 0, Math.sin(az)];
  const observerUp = cross(front, observerRight);
  const north = unit(moon.north);
  const prime = projected(moon.prime, north);
  const east = cross(north, prime);
  const up = orientation === 'north-up' ? projected(north, front) : observerUp;
  const right = cross(up, front);

  const f = moon.illumination;
  const lz = 2 * f - 1;
  const transverse = Math.sqrt(Math.max(0, 1 - lz * lz));
  const angle =
    brightLimbAngle(
      { altitude: sun.geometricAltitude, azimuth: sun.azimuth },
      { altitude: moon.geometricAltitude, azimuth: moon.azimuth },
    ) * DEG;
  const sx = transverse * Math.sin(angle);
  const sy = transverse * Math.cos(angle);
  const lx = sx * dot(observerRight, right) + sy * dot(observerUp, right);
  const ly = sx * dot(observerRight, up) + sy * dot(observerUp, up);
  const coefficients = (v: Vec): Vec => [dot(right, v), dot(up, v), dot(front, v)];
  const p = coefficients(prime);
  const n = coefficients(north);
  const e = coefficients(east);

  const pixels = new Uint8ClampedArray(width * height * 4);
  const bg = background === 'dark' ? [12, 15, 22] : [245, 244, 240];
  const opaque = background !== 'transparent';
  if (opaque) {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = bg[0];
      pixels[i + 1] = bg[1];
      pixels[i + 2] = bg[2];
      pixels[i + 3] = 255;
    }
  }
  const { width: tw, height: th, data: texels } = texture;
  const radius = Math.min(width, height) * 0.46;
  const cx = width / 2;
  const cy = height / 2;
  const ambient = earthshine ? 0.12 * (1 - f) : 0;
  for (let row = Math.max(0, Math.floor(cy - radius - 1)); row < Math.min(height, cy + radius + 1); row++) {
    const y0 = (cy - row - 0.5) / radius;
    for (let col = Math.max(0, Math.floor(cx - radius - 1)); col < Math.min(width, cx + radius + 1); col++) {
      const x0 = (col + 0.5 - cx) / radius;
      const r2 = x0 * x0 + y0 * y0;
      const coverage = clamp(radius * (1 - Math.sqrt(r2)) + 0.5, 0, 1);
      if (!coverage) continue;
      const scale = r2 > 1 ? 1 / Math.sqrt(r2) : 1;
      const x = x0 * scale;
      const y = y0 * scale;
      const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
      const incidence = x * lx + y * ly + z * lz;
      const gain = ambient + (incidence > 0 ? 1.12 * Math.pow((2 * incidence) / (incidence + z), 0.45) : 0);
      const offset = (row * width + col) * 4;
      if (gain > 0) {
        const longitude = Math.atan2(x * e[0] + y * e[1] + z * e[2], x * p[0] + y * p[1] + z * p[2]);
        const latitude = Math.asin(clamp(x * n[0] + y * n[1] + z * n[2], -1, 1));
        const u = (longitude / (2 * Math.PI) + 0.5) * tw - 0.5;
        const v = clamp((0.5 - latitude / Math.PI) * th - 0.5, 0, th - 1);
        const iu = Math.floor(u);
        const iv = Math.floor(v);
        const x1 = (iu + tw) % tw;
        const x2 = (x1 + 1) % tw;
        const du = u - iu;
        const dv = v - iv;
        const top = iv * tw;
        const bottom = Math.min(iv + 1, th - 1) * tw;
        for (let channel = 0; channel < 3; channel++) {
          const a = texels[(top + x1) * 4 + channel] * (1 - du) + texels[(top + x2) * 4 + channel] * du;
          const b = texels[(bottom + x1) * 4 + channel] * (1 - du) + texels[(bottom + x2) * 4 + channel] * du;
          pixels[offset + channel] = clamp((a * (1 - dv) + b * dv) * gain, 0, 255);
        }
      }
      if (opaque) {
        for (let channel = 0; channel < 3; channel++) {
          const value = gain > 0 ? pixels[offset + channel] : 0;
          pixels[offset + channel] = value * coverage + bg[channel] * (1 - coverage);
        }
      }
      pixels[offset + 3] = opaque ? 255 : Math.round(255 * coverage);
    }
  }
  return pixels;
}
