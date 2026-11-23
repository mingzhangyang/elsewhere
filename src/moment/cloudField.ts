import type { Palette, Rgb } from './paint';

/** A tiny, seeded cloud density renderer for the *postcard only*. No WebGL or dependencies. */
export interface WatercolourCloudLight {
  x: number;
  y: number;
  backlit: number;
  under: number;
  underColour: Rgb;
}

interface Mass {
  x: number;
  y: number;
  rx: number;
  ry: number;
  strength: number;
}

export interface CloudField {
  seed: number;
  masses: Mass[];
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const blend = (a: number, b: number, t: number) => a + (b - a) * clamp(t);
const colour = ([r, g, b]: Rgb, a: number) =>
  'rgba(' + r + ',' + g + ',' + b + ',' + clamp(a).toFixed(3) + ')';

/** Seeded wide, overlapping lobes; no fixed summit or elevation-profile path. */
export function createCloudField(random: () => number, tiers = 1): CloudField {
  const seed = Math.floor(random() * 0xffffffff) >>> 0;
  const count = 6 + Math.floor(random() * 3) + (tiers > 1 ? 1 : 0);
  const masses: Mass[] = [
    { x: -0.42, y: -0.22, rx: 1.67, ry: 0.42, strength: 0.65 },
    { x: 0.28, y: -0.3, rx: 1.42, ry: 0.48, strength: 0.68 },
  ];
  for (let i = 0; i < count; i++) {
    const u = (i + 0.25 + random() * 0.5) / count;
    const side = Math.abs(2 * u - 1);
    const large = random() > 0.38;
    masses.push({
      x: (u - 0.5) * 3.25 + (random() - 0.5) * 0.24,
      y: -0.5 - (1 - side) * (0.25 + random() * 0.23) - (large ? 0.15 : 0),
      rx: (large ? 0.58 : 0.44) + random() * 0.28,
      ry: (large ? 0.5 : 0.34) + random() * 0.23,
      strength: 0.76 + random() * 0.34,
    });
  }
  // A few misty fragments dissolve at the shoulders, not a row of hard separate circles.
  masses.push({ x: -1.55, y: -0.18, rx: 0.74, ry: 0.27, strength: 0.42 });
  masses.push({ x: 1.52, y: -0.24, rx: 0.68, ry: 0.25, strength: 0.48 });
  return { seed, masses };
}

function hash(ix: number, iy: number, seed: number) {
  let v = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed;
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const tx = x - ix;
  const ty = y - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = blend(hash(ix, iy, seed), hash(ix + 1, iy, seed), sx);
  const b = blend(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), sx);
  return blend(a, b, sy);
}

function fractal(x: number, y: number, seed: number): number {
  return (
    0.56 * noise(x, y, seed) +
    0.28 * noise(x * 2.13, y * 2.13, seed + 31) +
    0.16 * noise(x * 4.37, y * 4.37, seed + 73)
  );
}

/** Deterministic pixel-space opacity, independent of the final canvas resolution. */
export function sampleCloudField(field: CloudField, u: number, v: number): number {
  const warpX = (fractal(u * 1.24, v * 1.24, field.seed + 101) - 0.5) * 0.35;
  const warpY = (fractal(u * 1.13, v * 1.13, field.seed + 203) - 0.5) * 0.31;
  const x = u + warpX;
  const y = v + warpY;
  let clear = 1;
  for (const m of field.masses) {
    const dx = (x - m.x) / m.rx;
    const dy = (y - m.y) / m.ry;
    const weight = Math.min(0.995, m.strength * Math.exp(-1.75 * (dx * dx + dy * dy)));
    clear *= 1 - weight;
  }
  const density = 1 - clear;
  // Let soft multi-scale texture move the contour itself: no hard polygon perimeter.
  const rag = fractal(u * 4.3, v * 4.3, field.seed + 307) - 0.5;
  const opacity = ease(0.29, 0.81, density + rag * 0.15);
  return opacity * (0.88 + 0.12 * fractal(u * 9.1, v * 9.1, field.seed + 409));
}

/**
 * Deposit one low-resolution RGBA pigment field, then bilinearly upscale it onto the main canvas.
 * Pixels outside the field stay transparent, so the blue sky remains visible between wisps.
 * Roughly 15–25k sample points per large cloud keeps image export bounded on mobile.
 */
export function paintCloudField(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  palette: Palette,
  light: WatercolourCloudLight,
  random: () => number,
  tiers = 1,
): CloudField {
  const field = createCloudField(random, tiers);
  const left = x - size * 2.33;
  const top = y - size * 1.9;
  const width = size * 4.66;
  const height = size * 2.54;
  // The recording context used in unit tests has no backing canvas. Retain a soft
  // gradient fallback for that context and for browsers without an offscreen 2D buffer.
  const backing = ctx.canvas as HTMLCanvasElement | undefined;
  const canRasterize = backing && typeof backing.width === 'number';
  const offscreen = canRasterize && typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const c = offscreen?.getContext('2d');
  if (!offscreen || !c) {
    ctx.save();
    for (const m of field.masses) {
      const cx = x + size * m.x;
      const cy = y + size * m.y;
      const radius = size * Math.max(m.rx, m.ry);
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, colour(palette.cloudLight, 0.12 * m.strength));
      gradient.addColorStop(0.55, colour(palette.cloudBody, 0.07 * m.strength));
      gradient.addColorStop(1, colour(palette.cloudBody, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return field;
  }
  const step = Math.max(1.6, size * 0.027);
  offscreen.width = Math.max(8, Math.ceil(width / step));
  offscreen.height = Math.max(8, Math.ceil(height / step));
  const image = c.createImageData(offscreen.width, offscreen.height);
  const pixels = image.data;
  const down = Math.max(0, light.under);
  const shade = palette.cloudShadow;
  const body = palette.cloudBody;
  const white = palette.cloudLight;
  const seed = field.seed;
  let n = 0;
  for (let j = 0; j < offscreen.height; j++) {
    const v = -1.9 + (j + 0.5) * (2.54 / offscreen.height);
    for (let i = 0; i < offscreen.width; i++) {
      const u = -2.33 + (i + 0.5) * (4.66 / offscreen.width);
      const opacity = sampleCloudField(field, u, v);
      const pigment = fractal(u * 2.0 + 12, v * 2.0 - 6, seed + 557);
      const fleck = fractal(u * 11.5, v * 11.5, seed + 601);
      // Lighting runs *across* the irregular density and body, not as a top-to-bottom gradient.
      const lit = clamp(
        0.48 + (-v - 0.3) * 0.21 - u * light.x * 0.1 + (pigment - 0.5) * 0.56 - light.backlit * 0.12,
      );
      const undertone = clamp((v + 0.65) * 0.6 * down);
      for (let ch = 0; ch < 3; ch++) {
        const tone = blend(blend(shade[ch], body[ch], 0.52), white[ch], lit);
        pixels[n++] = Math.round(blend(tone, light.underColour[ch], undertone * 0.55));
      }
      // Broken wash, but no stippled hard edge or cartoon opaque border.
      pixels[n++] = Math.round(255 * clamp(opacity * (0.69 + 0.18 * fleck)));
    }
  }
  c.putImageData(image, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(offscreen, left, top, width, height);
  ctx.restore();
  return field;
}
