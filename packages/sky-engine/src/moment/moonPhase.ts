import type { MomentSnapshot } from '../contracts';
import { brightLimbAngle } from '../domain/planets';
import { assetFailed, loadResource, validateTimeout } from '../resources';
import { requireContext, requireImageSize, resetImageCanvas } from './imageCanvas';
import { requireScratchContext, type DomImage, type RenderCanvas } from './scratchCanvas';
import { cancelled, invalidInput, SkyEngineError } from '../errors';

export type MoonTexture = ImageData | ImageBitmap | DomImage;
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
function unit(v: Vec): Vec {
  const length = Math.hypot(...v);
  if (!Number.isFinite(length) || length < 1e-10) throw invalidInput('Invalid lunar basis.');
  return [v[0] / length, v[1] / length, v[2] / length];
}
function projected(v: Vec, normal: Vec): Vec {
  const d = dot(v, normal);
  return unit([v[0] - d * normal[0], v[1] - d * normal[1], v[2] - d * normal[2]]);
}

const CROSS_ORIGIN_TEXTURE =
  'Moon texture pixels cannot be read because the image is cross-origin and taints the canvas. ' +
  'Serve the texture from the same origin, or from a server that sends CORS headers ' +
  '(Access-Control-Allow-Origin) and set crossOrigin = "anonymous" on the HTMLImageElement ' +
  'before assigning its src, or pass already decoded ImageData.';
const isSecurityError = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'SecurityError';

const decoded = new WeakMap<MoonTexture, ImageData>();
let installed: ImageData | undefined;
function decodeTexture(texture: MoonTexture): ImageData {
  const cached = decoded.get(texture);
  if (cached) return cached;
  const w = 'naturalWidth' in texture ? texture.naturalWidth : texture.width;
  const h = 'naturalHeight' in texture ? texture.naturalHeight : texture.height;
  if (!Number.isInteger(w) || !Number.isInteger(h) || h < 2 || h > 4096 || w !== 2 * h) {
    throw invalidInput('Moon texture must be a decoded 2:1 equirectangular image, at most 8192 x 4096.');
  }
  let result: ImageData;
  if ('data' in texture) {
    result = texture;
  } else {
    const ctx = requireScratchContext(w, h, { willReadFrequently: true });
    ctx.drawImage(texture, 0, 0, w, h);
    try {
      result = ctx.getImageData(0, 0, w, h);
    } catch (error) {
      if (isSecurityError(error)) {
        throw new SkyEngineError('ASSET_FAILED', CROSS_ORIGIN_TEXTURE, { cause: error });
      }
      throw assetFailed('Moon texture', error);
    }
  }
  decoded.set(texture, result);
  return result;
}

/** Load only an explicitly supplied URL; callers can use a local or service-worker-cached asset. */
export async function loadMoonTexture(url: string | URL, signal?: AbortSignal): Promise<ImageData> {
  if (signal?.aborted) throw cancelled('Moon texture cancelled.');
  let bitmap: ImageBitmap;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok)
      throw new SkyEngineError('ASSET_FAILED', 'Moon texture unavailable: ' + response.status);
    bitmap = await createImageBitmap(await response.blob());
  } catch (error) {
    if (signal?.aborted) throw new SkyEngineError('CANCELLED', 'Moon texture cancelled.', { cause: error });
    throw assetFailed('Moon texture', error);
  }
  try {
    if (signal?.aborted) throw cancelled('Moon texture cancelled.');
    return decodeTexture(bitmap);
  } finally {
    bitmap.close();
  }
}

/** Install a decoded texture for subsequent calls; pass null to release the default reference. */
export function installMoonTexture(texture: MoonTexture | null): void {
  installed = texture === null ? undefined : decodeTexture(texture);
}

/** Lighting and body-axis coefficients in the portrait frame (x right, y up, z towards the viewer). */
export interface MoonShading {
  illumination: number;
  lx: number;
  ly: number;
  lz: number;
  p: Vec;
  n: Vec;
  e: Vec;
}

export function moonShading(
  scene: Pick<MomentSnapshot, 'sky'>,
  orientation: 'observer' | 'north-up',
): MoonShading {
  const moon = scene.sky.moon;
  const sun = scene.sky.sun;
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

  return { illumination: f, lx, ly, lz, p, n, e };
}

// The photometric response 1.12 * t^0.45 for t = 2i / (i + z) in (0, 2], linearly interpolated
// from a table (error below 2e-6). Near the terminator, t < GAIN_TABLE_START, the curve is too
// steep for the table and uses Math.pow.
const GAIN_STEPS = 8192;
const GAIN_SCALE = GAIN_STEPS / 2;
const GAIN_TABLE_START = 1 / 64;
let gainTable: Float64Array | undefined;
function photometricTable(): Float64Array {
  if (!gainTable) {
    gainTable = new Float64Array(GAIN_STEPS + 2);
    for (let k = 0; k < gainTable.length; k++) gainTable[k] = 1.12 * Math.pow(k / GAIN_SCALE, 0.45);
  }
  return gainTable;
}

// atan over [0, 1] by a linearly interpolated table, for an atan2 by octant reduction. Its error is
// below 4e-10 rad, which moves a texture coordinate by less than 1e-6 texel; Math.atan2 is a
// comparatively slow runtime call in the per-pixel loop.
const ATAN_STEPS = 16384;
let atanTable: Float64Array | undefined;
function arctangentTable(): Float64Array {
  if (!atanTable) {
    atanTable = new Float64Array(ATAN_STEPS + 2);
    for (let k = 0; k < atanTable.length; k++) atanTable[k] = Math.atan(k / ATAN_STEPS);
  }
  return atanTable;
}
const HALF_PI = Math.PI / 2;
// asin over [-1, 1] by a linearly interpolated table, used where |n| <= ASIN_LIMIT (error below
// 2e-8 rad); the steep polar caps beyond it use Math.asin.
const ASIN_STEPS = 32768;
const ASIN_SCALE = ASIN_STEPS / 2;
const ASIN_LIMIT = 0.95;
let asinTable: Float64Array | undefined;
function arcsineTable(): Float64Array {
  if (!asinTable) {
    asinTable = new Float64Array(ASIN_STEPS + 2);
    for (let k = 0; k < asinTable.length; k++) asinTable[k] = Math.asin(Math.min(1, k / ASIN_SCALE - 1));
  }
  return asinTable;
}

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
// Byte shifts of R, G, B and A inside one RGBA pixel read as a platform-order 32-bit word.
const [R, G, B, A] = LITTLE_ENDIAN ? [0, 8, 16, 24] : [24, 16, 8, 0];
/** The texture as 32-bit words (an unaligned view is copied first). */
const words = (bytes: Uint8ClampedArray): Int32Array =>
  bytes.byteOffset % 4 === 0
    ? new Int32Array(bytes.buffer, bytes.byteOffset, bytes.length >> 2)
    : new Int32Array(new Uint8ClampedArray(bytes).buffer);

interface Texels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Fill RGBA pixels with the orthographic, textured and lit lunar disc. */
export function shadeMoon(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  shading: MoonShading,
  texture: Texels,
  background: 'transparent' | 'dark' | 'light',
  earthshine: boolean,
): void {
  const { illumination: f, lx, ly, lz } = shading;
  const [p0, p1, p2] = shading.p;
  const [n0, n1, n2] = shading.n;
  const [e0, e1, e2] = shading.e;
  const [bg0, bg1, bg2] = background === 'dark' ? [12, 15, 22] : [245, 244, 240];
  const opaque = background !== 'transparent';
  // Whole-pixel writes for the backdrop and shadow; the caller's buffer is always freshly allocated.
  const out = new Int32Array(pixels.buffer, pixels.byteOffset, pixels.length >> 2);
  const backdrop = (bg0 << R) | (bg1 << G) | (bg2 << B) | (255 << A);
  if (opaque) out.fill(backdrop);
  const { width: tw, height: th } = texture;
  const texels = words(texture.data);
  const radius = Math.min(width, height) * 0.46;
  const cx = width / 2;
  const cy = height / 2;
  const ambient = earthshine ? 0.12 * (1 - f) : 0;
  const table = photometricTable();
  const arctangent = arctangentTable();
  const arcsine = arcsineTable();
  const uScale = tw / (2 * Math.PI);
  const uOffset = 0.5 * tw - 0.5;
  const vScale = -th / Math.PI;
  const vOffset = 0.5 * th - 0.5;
  const vMax = th - 1;
  // Pixels this far inside the limb are fully covered; only the rim needs the exact coverage.
  const inner = Math.max(0, 1 - 0.6 / radius);
  const inner2 = inner * inner;

  const colStart = Math.max(0, Math.floor(cx - radius - 1));
  const colEnd = Math.min(width, cx + radius + 1);
  const columns = Math.max(0, Math.ceil(colEnd) - colStart);
  // Per-column terms, shared by every row.
  const xs = new Float64Array(columns);
  const xx = new Float64Array(columns);
  const xl = new Float64Array(columns);
  const xe = new Float64Array(columns);
  const xp = new Float64Array(columns);
  const xn = new Float64Array(columns);
  for (let i = 0; i < columns; i++) {
    const x = (colStart + i + 0.5 - cx) / radius;
    xs[i] = x;
    xx[i] = x * x;
    xl[i] = x * lx;
    xe[i] = x * e0;
    xp[i] = x * p0;
    xn[i] = x * n0;
  }

  for (let row = Math.max(0, Math.floor(cy - radius - 1)); row < Math.min(height, cy + radius + 1); row++) {
    const y0 = (cy - row - 0.5) / radius;
    const yy = y0 * y0;
    // Per-row terms for the interior, where the sphere point is the pixel itself.
    const yl = y0 * ly;
    const ye = y0 * e1;
    const yp = y0 * p1;
    const yn = y0 * n1;
    // Columns that can touch the disc in this row (with a pixel of margin); the rest stay clear.
    const reach = (1 + 1.5 / radius) ** 2 - yy;
    if (reach <= 0) continue;
    const half = Math.sqrt(reach) * radius + 1;
    const first = Math.max(0, Math.floor(cx - half) - colStart);
    const last = Math.min(columns, Math.ceil(cx + half) - colStart);
    let index = row * width + colStart + first;
    for (let i = first; i < last; i++, index++) {
      const r2 = xx[i] + yy;
      let coverage = 1;
      let z: number, incidence: number, east: number, prime: number, north: number;
      if (r2 <= inner2) {
        z = Math.sqrt(1 - xx[i] - yy);
        incidence = xl[i] + yl + z * lz;
        east = xe[i] + ye + z * e2;
        prime = xp[i] + yp + z * p2;
        north = xn[i] + yn + z * n2;
      } else {
        const distance = Math.sqrt(r2);
        coverage = radius * (1 - distance) + 0.5;
        if (!(coverage > 0)) continue;
        if (coverage > 1) coverage = 1;
        const scale = r2 > 1 ? 1 / distance : 1;
        const x = xs[i] * scale;
        const y = y0 * scale;
        z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
        incidence = x * lx + y * ly + z * lz;
        east = x * e0 + y * e1 + z * e2;
        prime = x * p0 + y * p1 + z * p2;
        north = x * n0 + y * n1 + z * n2;
      }
      let gain = ambient;
      if (incidence > 0) {
        // An approximate lunar photometric response, not a terrain-shadow or eclipse model.
        const t = (2 * incidence) / (incidence + z);
        if (t >= GAIN_TABLE_START) {
          const s = t * GAIN_SCALE;
          const k = s | 0;
          const low = table[k];
          gain += low + (table[k + 1] - low) * (s - k);
        } else {
          gain += 1.12 * Math.pow(t, 0.45);
        }
      }
      if (gain > 0) {
        // NASA equirectangular texture: +X prime meridian, +Y north, -Z east. The longitude is
        // atan2(east, prime), inlined by hand: octant reduction and the arctangent table.
        const ae = east < 0 ? -east : east;
        const ap = prime < 0 ? -prime : prime;
        const steep = ae > ap;
        const ratio = (steep ? ap / ae : ap === 0 ? 0 : ae / ap) * ATAN_STEPS;
        const q = ratio | 0;
        const base = arctangent[q];
        let longitude = base + (arctangent[q + 1] - base) * (ratio - q);
        if (steep) longitude = HALF_PI - longitude;
        if (prime < 0) longitude = Math.PI - longitude;
        const u = (east < 0 ? -longitude : longitude) * uScale + uOffset;
        let latitude: number;
        if (north >= -ASIN_LIMIT && north <= ASIN_LIMIT) {
          const w = (north + 1) * ASIN_SCALE;
          const j = w | 0;
          const low = arcsine[j];
          latitude = low + (arcsine[j + 1] - low) * (w - j);
        } else {
          latitude = Math.asin(north < -1 ? -1 : north > 1 ? 1 : north);
        }
        let v = latitude * vScale + vOffset;
        v = v < 0 ? 0 : v > vMax ? vMax : v;
        // u is in [-0.5, tw - 0.5], so this is Math.floor(u).
        const iu = ((u + 1) | 0) - 1;
        const iv = v | 0;
        const x1 = iu < 0 ? iu + tw : iu >= tw ? iu - tw : iu;
        const x2 = x1 + 1 === tw ? 0 : x1 + 1;
        const du = u - iu;
        const dv = v - iv;
        const wu = 1 - du;
        const wv = 1 - dv;
        const top = iv * tw;
        const bottom = iv < vMax ? top + tw : top;
        const a = texels[top + x1];
        const b = texels[top + x2];
        const c = texels[bottom + x1];
        const d = texels[bottom + x2];
        const offset = index * 4;
        pixels[offset] =
          ((((a >>> R) & 255) * wu + ((b >>> R) & 255) * du) * wv +
            (((c >>> R) & 255) * wu + ((d >>> R) & 255) * du) * dv) *
          gain;
        pixels[offset + 1] =
          ((((a >>> G) & 255) * wu + ((b >>> G) & 255) * du) * wv +
            (((c >>> G) & 255) * wu + ((d >>> G) & 255) * du) * dv) *
          gain;
        pixels[offset + 2] =
          ((((a >>> B) & 255) * wu + ((b >>> B) & 255) * du) * wv +
            (((c >>> B) & 255) * wu + ((d >>> B) & 255) * du) * dv) *
          gain;
        if (coverage < 1) {
          if (opaque) {
            // The rim blends the stored (rounded) colour with the background.
            pixels[offset] = pixels[offset] * coverage + bg0 * (1 - coverage);
            pixels[offset + 1] = pixels[offset + 1] * coverage + bg1 * (1 - coverage);
            pixels[offset + 2] = pixels[offset + 2] * coverage + bg2 * (1 - coverage);
          } else pixels[offset + 3] = Math.round(255 * coverage);
        } else pixels[offset + 3] = 255;
      } else if (opaque) {
        // Shadowed pixels are opaque, including when earthshine is disabled.
        if (coverage < 1) {
          const offset = index * 4;
          pixels[offset] = bg0 * (1 - coverage);
          pixels[offset + 1] = bg1 * (1 - coverage);
          pixels[offset + 2] = bg2 * (1 - coverage);
        } else out[index] = 255 << A;
      } else out[index] = Math.round(255 * coverage) << A;
    }
  }
}

/** Test seam: the portrait pixels for a decoded texture, without a canvas. */
export function moonPortraitPixels(
  width: number,
  height: number,
  scene: Pick<MomentSnapshot, 'sky'>,
  options: {
    orientation: 'observer' | 'north-up';
    background: 'transparent' | 'dark' | 'light';
    earthshine: boolean;
  },
  texture: Texels,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  shadeMoon(
    pixels,
    width,
    height,
    moonShading(scene, options.orientation),
    texture,
    options.background,
    options.earthshine,
  );
  return pixels;
}

/** Orthographic lunar portrait using the existing observer-frame ephemeris and IAU body axes. */
export async function renderMoonPhase(
  canvas: RenderCanvas,
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
    throw invalidInput('Invalid Moon portrait options.');
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
    throw invalidInput('Invalid Moon ephemeris.');
  }
  const shading = moonShading(scene, orientation);

  const assetTimeoutMs = validateTimeout(options.assetTimeoutMs ?? 10000);
  if (options.signal?.aborted) throw cancelled('Moon portrait cancelled.');
  let texture = options.texture ? decodeTexture(options.texture) : undefined;
  if (!texture && options.loadTexture) {
    texture = decodeTexture(
      await loadResource(options.loadTexture, assetTimeoutMs, 'Moon texture', options.signal),
    );
  }
  texture ??= installed;
  if (!texture) {
    throw new SkyEngineError(
      'MISSING_ASSET',
      'Supply a Moon texture or install one with installMoonTexture().',
    );
  }
  if (options.signal?.aborted) throw cancelled('Moon portrait cancelled.');
  if (canvas.width !== width || canvas.height !== height) {
    throw invalidInput('Canvas size changed while loading Moon texture.');
  }
  const image = requireContext(canvas).createImageData(width, height);
  shadeMoon(image.data, width, height, shading, texture, background, earthshine);
  resetImageCanvas(canvas).putImageData(image, 0, 0);
}
