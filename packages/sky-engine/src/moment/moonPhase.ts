import type { MomentSnapshot } from '../contracts';
import { brightLimbAngle } from '../domain/planets';
import { loadResource } from '../resources';
import { requireImageSize, resetImageCanvas } from './imageCanvas';

export type MoonTexture = ImageData | ImageBitmap | HTMLImageElement;
export interface MoonPhaseOptions {
  style?: 'realistic';
  orientation?: 'observer' | 'north-up';
  background?: 'transparent' | 'dark' | 'light';
  earthshine?: boolean;
  texture?: MoonTexture;
  loadTexture?: (signal: AbortSignal) => Promise<MoonTexture>;
  assetTimeoutMs?: number;
  signal?: AbortSignal;
}

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
  if (!Number.isFinite(length) || length < 1e-10) throw new RangeError('Invalid lunar basis.');
  return [v[0] / length, v[1] / length, v[2] / length];
}
function projected(v: Vec, normal: Vec): Vec {
  const d = dot(v, normal);
  return unit([v[0] - d * normal[0], v[1] - d * normal[1], v[2] - d * normal[2]]);
}

const decoded = new WeakMap<MoonTexture, ImageData>();
let installed: ImageData | undefined;
function decodeTexture(texture: MoonTexture): ImageData {
  const cached = decoded.get(texture);
  if (cached) return cached;
  const w = 'naturalWidth' in texture ? texture.naturalWidth : texture.width;
  const h = 'naturalHeight' in texture ? texture.naturalHeight : texture.height;
  if (!Number.isInteger(w) || !Number.isInteger(h) || h < 2 || h > 4096 || w !== 2 * h) {
    throw new RangeError('Moon texture must be a decoded 2:1 equirectangular image, at most 8192 x 4096.');
  }
  let result: ImageData;
  if ('data' in texture) {
    result = texture;
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D is unavailable.');
    ctx.drawImage(texture, 0, 0, w, h);
    result = ctx.getImageData(0, 0, w, h);
  }
  decoded.set(texture, result);
  return result;
}

/** Load only an explicitly supplied URL; callers can use a local or service-worker-cached asset. */
export async function loadMoonTexture(url: string | URL, signal?: AbortSignal): Promise<ImageData> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Moon texture unavailable: ' + response.status);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    if (signal?.aborted) throw new Error('Moon texture cancelled.');
    return decodeTexture(bitmap);
  } finally {
    bitmap.close();
  }
}

/** Install a decoded texture for subsequent calls; pass null to release the default reference. */
export function installMoonTexture(texture: MoonTexture | null): void {
  installed = texture === null ? undefined : decodeTexture(texture);
}

/** Orthographic lunar portrait using the existing observer-frame ephemeris and IAU body axes. */
export async function renderMoonPhase(
  canvas: HTMLCanvasElement,
  scene: MomentSnapshot,
  options: MoonPhaseOptions = {},
): Promise<void> {
  const { width, height } = requireImageSize(canvas);
  const orientation = options.orientation ?? 'observer';
  const background = options.background ?? 'transparent';
  const earthshine = options.earthshine ?? false;
  if (
    (options.style !== undefined && options.style !== 'realistic') ||
    !['observer', 'north-up'].includes(orientation) ||
    !['transparent', 'dark', 'light'].includes(background) ||
    typeof earthshine !== 'boolean'
  ) {
    throw new RangeError('Invalid Moon portrait options.');
  }
  const moon = scene.sky.moon;
  const sun = scene.sky.sun;
  if (
    ![
      moon.geometricAltitude,
      moon.azimuth,
      moon.illumination,
      moon.brightLimbAngle,
      sun.geometricAltitude,
      sun.azimuth,
    ].every(Number.isFinite) ||
    moon.illumination < 0 ||
    moon.illumination > 1 ||
    Math.abs(moon.geometricAltitude) > 90 ||
    Math.abs(sun.geometricAltitude) > 90
  ) {
    throw new RangeError('Invalid Moon ephemeris.');
  }
  // East, zenith, south: the same right-handed horizon frame as the existing renderer.
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

  // Illuminated fraction stays the existing topocentric value. Refraction lifts the Sun and Moon
  // as seen from Earth; it does not rotate the terminator, so the portrait uses geometric altitudes
  // and azimuths. Sky icons keep the snapshot's apparent brightLimbAngle.
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

  if (options.signal?.aborted) throw new Error('Moon portrait cancelled.');
  let texture = options.texture ? decodeTexture(options.texture) : undefined;
  if (!texture && options.loadTexture) {
    texture = decodeTexture(
      await loadResource(
        options.loadTexture,
        options.assetTimeoutMs ?? 10000,
        'Moon texture',
        options.signal,
      ),
    );
  }
  texture ??= installed;
  if (!texture) throw new Error('Supply a Moon texture or install one with installMoonTexture().');
  if (options.signal?.aborted) throw new Error('Moon portrait cancelled.');
  if (canvas.width !== width || canvas.height !== height) {
    throw new Error('Canvas size changed while loading Moon texture.');
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  const image = ctx.createImageData(width, height);
  const pixels = image.data;
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
      // An approximate lunar photometric response, not a terrain-shadow or eclipse model.
      const gain = ambient + (incidence > 0 ? 1.12 * Math.pow((2 * incidence) / (incidence + z), 0.45) : 0);
      const offset = (row * width + col) * 4;
      if (gain > 0) {
        // NASA equirectangular texture: +X prime meridian, +Y north, -Z east.
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
        // Shadowed pixels are opaque, including when earthshine is disabled.
        for (let channel = 0; channel < 3; channel++) {
          const value = gain > 0 ? pixels[offset + channel] : 0;
          pixels[offset + channel] = value * coverage + bg[channel] * (1 - coverage);
        }
      }
      pixels[offset + 3] = opaque ? 255 : Math.round(255 * coverage);
    }
  }
  resetImageCanvas(canvas).putImageData(image, 0, 0);
}
