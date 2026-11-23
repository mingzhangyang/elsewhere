import { clamp01, glowAt, lerp, mix, type Palette, type Rgb } from './paint';

/** Deterministic watercolour clouds for postcard snapshots only. */
export interface WatercolourCloudLight {
  x: number;
  y: number;
  backlit: number;
  under: number;
  underColour: Rgb;
}

type Mass = [x: number, y: number, rx: number, ry: number, strength: number];

export interface CloudField {
  seed: number;
  masses: Mass[];
}

/** Interlocking broad masses break up the upper outline without a mountain profile. */
export function createCloudField(random: () => number, tiers = 1): CloudField {
  const seed = (random() * 0xffffffff) >>> 0;
  const count = 9 + (tiers > 1 ? 1 : 0);
  const masses: Mass[] = [
    [-0.42, -0.22, 1.67, 0.42, 0.65],
    [0.28, -0.3, 1.42, 0.48, 0.68],
  ];
  for (let i = 0; i < count; i++) {
    const u = (i + random()) / count;
    masses.push([
      (u - 0.5) * 3.3 + (random() - 0.5) * 0.25,
      -0.4 - (1 - Math.abs(2 * u - 1)) * (0.28 + random() * 0.36),
      0.38 + random() * 0.53,
      0.29 + random() * 0.5,
      0.72 + random() * 0.26,
    ]);
  }
  return { seed, masses };
}

/** Soft phase-warped ripples break up the silhouette without a fixed crown. */
function wash(x: number, y: number, phase: number): number {
  return Math.sin(x * 3.8 + Math.sin(y * 2.4 + phase));
}

/** Smooth alpha with irregular edges; independent of the output resolution. */
export function sampleCloudField(field: CloudField, u: number, v: number): number {
  const phase = field.seed * 0.000001;
  const distortion = wash(u, v, phase) * 0.07;
  let clear = 1;
  for (const [mx, my, rx, ry, strength] of field.masses) {
    const dx = (u + distortion - mx) / rx;
    const dy = (v - distortion - my) / ry;
    clear *= 1 - strength * Math.exp(-1.75 * (dx * dx + dy * dy));
  }
  const edge = 1 - clear + wash(u * 1.8, v * 1.8, phase + 11) * 0.075;
  const t = clamp01((edge - 0.25) / 0.72);
  return t * t * (3 - 2 * t);
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
        x + size * m[0],
        y + size * m[1],
        size * Math.max(m[2], m[3]),
        palette.cloudLight,
        0.12 * m[4],
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
  const phase = field.seed * 0.000001;
  let n = 0;
  for (let j = 0; j < offscreen.height; j++) {
    const v = -1.9 + (j + 0.5) * (2.54 / offscreen.height);
    for (let i = 0; i < offscreen.width; i++) {
      const u = -2.33 + (i + 0.5) * (4.66 / offscreen.width);
      const opacity = sampleCloudField(field, u, v);
      const pigment = wash(u * 0.9, v * 0.9, phase);
      const lit = clamp01(
        0.42 - v * 0.21 - u * light.x * 0.1 + pigment * 0.18 - light.backlit * 0.12,
      );
      for (let ch = 0; ch < 3; ch++) {
        pixels[n++] = lerp(base[ch], palette.cloudLight[ch], lit);
      }
      pixels[n++] = 255 * opacity * (0.73 + 0.07 * pigment);
    }
  }
  c.putImageData(image, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(offscreen, x - size * 2.33, y - size * 1.9, width, height);
  ctx.restore();
  return field;
}
