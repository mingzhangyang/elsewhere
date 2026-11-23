import { clamp01, glowAt, lerp, mix, type Palette, type Rgb } from './paint';

/** Deterministic watercolour clouds for postcard snapshots only. */
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

/** Interlocking broad masses break up the upper outline without a mountain profile. */
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
  return lerp(
    lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), sx),
    lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), sx),
    sy,
  );
}

function fractal(x: number, y: number, seed: number): number {
  return 0.7 * noise(x, y, seed) + 0.3 * noise(x * 2.13, y * 2.13, seed + 31);
}

/** Smooth alpha with irregular edges; independent of the output resolution. */
export function sampleCloudField(field: CloudField, u: number, v: number): number {
  const warpX = (fractal(u * 1.24, v * 1.24, field.seed + 101) - 0.5) * 0.35;
  const warpY = (fractal(u * 1.13, v * 1.13, field.seed + 203) - 0.5) * 0.31;
  let clear = 1;
  for (const m of field.masses) {
    const dx = (u + warpX - m.x) / m.rx;
    const dy = (v + warpY - m.y) / m.ry;
    clear *= 1 - Math.min(0.995, m.strength * Math.exp(-1.75 * (dx * dx + dy * dy)));
  }
  const edge = 1 - clear + (fractal(u * 4.3, v * 4.3, field.seed + 307) - 0.5) * 0.15;
  const t = clamp01((edge - 0.29) / 0.52);
  return t * t * (3 - 2 * t) * (0.88 + 0.12 * fractal(u * 9.1, v * 9.1, field.seed + 409));
}

/** Rasterize a small translucent pigment field, then smooth it onto the full postcard. */
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
  const width = size * 4.66;
  const height = size * 2.54;
  const offscreen =
    typeof document !== 'undefined' && typeof ctx.canvas?.width === 'number'
      ? document.createElement('canvas')
      : null;
  const c = offscreen?.getContext('2d');
  if (!offscreen || !c) {
    // A Canvas-less recorder (or a browser lacking an offscreen 2D context) keeps a soft fallback.
    ctx.save();
    for (const m of field.masses)
      glowAt(
        ctx,
        x + size * m.x,
        y + size * m.y,
        size * Math.max(m.rx, m.ry),
        palette.cloudLight,
        0.12 * m.strength,
      );
    ctx.restore();
    return field;
  }
  const step = Math.max(1.6, size * 0.027);
  offscreen.width = Math.max(8, Math.ceil(width / step));
  offscreen.height = Math.max(8, Math.ceil(height / step));
  const image = c.createImageData(offscreen.width, offscreen.height);
  const pixels = image.data;
  const base = mix(palette.cloudShadow, palette.cloudBody, 0.52);
  const seed = field.seed;
  let n = 0;
  for (let j = 0; j < offscreen.height; j++) {
    const v = -1.9 + (j + 0.5) * (2.54 / offscreen.height);
    for (let i = 0; i < offscreen.width; i++) {
      const u = -2.33 + (i + 0.5) * (4.66 / offscreen.width);
      const opacity = sampleCloudField(field, u, v);
      const pigment = fractal(u * 2 + 12, v * 2 - 6, seed + 557);
      const lit = clamp01(
        0.48 + (-v - 0.3) * 0.21 - u * light.x * 0.1 + (pigment - 0.5) * 0.56 - light.backlit * 0.12,
      );
      const undertone = clamp01((v + 0.65) * 0.6 * light.under) * 0.55;
      for (let ch = 0; ch < 3; ch++) {
        const tone = lerp(base[ch], palette.cloudLight[ch], lit);
        pixels[n++] = Math.round(lerp(tone, light.underColour[ch], undertone));
      }
      pixels[n++] = Math.round(255 * clamp01(opacity * (0.69 + 0.18 * pigment)));
    }
  }
  c.putImageData(image, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(offscreen, x - size * 2.33, y - size * 1.9, width, height);
  ctx.restore();
  return field;
}
