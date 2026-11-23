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
      -0.36 - random() * 0.53 - Math.sin(u * Math.PI * 3.2) * 0.12,
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
  const edge = 1 - clear + wash(u * 1.8, v * 1.8, phase + 11) * 0.08;
  const t = clamp01((edge - 0.25) / 0.64);
  return t * t * (3 - 2 * t);
}

/**
 * The cloud field uses the projected 2D direction of the real Sun/Moon. A density edge faces
 * away from increasing opacity; the upper edge faces skyward, and the lower edge faces groundward.
 * A fixed top-light term would incorrectly light those edges identically at dusk and dawn.
 */
export function cloudFieldLuminance(
  u: number,
  v: number,
  opacity: number,
  pigment: number,
  gradientX: number,
  gradientY: number,
  light: WatercolourCloudLight,
): number {
  const normalSize = Math.hypot(gradientX, gradientY) + 0.07;
  const facingLight = (-gradientX * light.x - gradientY * light.y) / normalSize;
  return clamp01(
    0.47 +
      v * light.y * 0.23 -
      u * light.x * 0.1 +
      facingLight * 0.13 +
      pigment * 0.055 +
      (opacity - 0.5) * 0.23 -
      light.backlit * 0.12,
  );
}

/**
 * Separable Gaussian rasterizer for postcards. One exponent per mass and grid row/column
 * replaces one exponent per mass at every pixel. Interpolating the seeded 2D displacement
 * preserves the wobbly cloud outline while avoiding repeated Gaussian evaluation.
 */
export function rasterCloudOpacity(field: CloudField, columns: number, rows: number): Uint8Array {
  const stepX = 4.66 / columns;
  const stepY = 2.54 / rows;
  const clear = new Float32Array(columns * rows).fill(1);
  for (const [mx, my, rx, ry, strength] of field.masses) {
    const horizontal = new Float32Array(columns);
    for (let i = 0; i < columns; i++) {
      const dx = (-2.33 + (i + 0.5) * stepX - mx) / rx;
      horizontal[i] = strength * Math.exp(-1.75 * dx * dx);
    }
    for (let j = 0; j < rows; j++) {
      const dy = (-1.9 + (j + 0.5) * stepY - my) / ry;
      const vertical = Math.exp(-1.75 * dy * dy);
      for (let i = 0; i < columns; i++) {
        clear[j * columns + i] *= 1 - horizontal[i] * vertical;
      }
    }
  }
  const opacity = new Uint8Array(clear.length);
  const phase = field.seed * 0.000001;
  for (let j = 0; j < rows; j++) {
    const v = -1.9 + (j + 0.5) * stepY;
    for (let i = 0; i < columns; i++) {
      const u = -2.33 + (i + 0.5) * stepX;
      const drift = wash(u, v, phase) * 0.07;
      const x = i + drift / stepX;
      const y = j - drift / stepY;
      // Extrapolate at edges instead of clamping: the displaced field stays continuous.
      const xi = Math.max(0, Math.min(columns - 2, Math.floor(x)));
      const yi = Math.max(0, Math.min(rows - 2, Math.floor(y)));
      const x1 = xi + 1;
      const y1 = yi + 1;
      const tx = x - xi;
      const ty = y - yi;
      const top = lerp(clear[yi * columns + xi], clear[yi * columns + x1], tx);
      const bottom = lerp(clear[y1 * columns + xi], clear[y1 * columns + x1], tx);
      const edge = 1 - lerp(top, bottom, ty) + wash(u * 1.8, v * 1.8, phase + 11) * 0.08;
      const t = clamp01((edge - 0.25) / 0.64);
      opacity[j * columns + i] = Math.round(255 * t * t * (3 - 2 * t));
    }
  }
  return opacity;
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
  const step = Math.max(1.6, size * 0.026);
  offscreen.width = Math.max(8, Math.ceil(width / step));
  offscreen.height = Math.max(8, Math.ceil(height / step));
  const image = c.createImageData(offscreen.width, offscreen.height);
  const pixels = image.data;
  const columns = offscreen.width;
  const rows = offscreen.height;
  // Preserve the same seeded density on the final pixel grid, then shade its 2D gradients.
  const densities = rasterCloudOpacity(field, columns, rows);
  const shade = mix(palette.cloudShadow, palette.cloudBody, 0.52);
  const base = mix(shade, light.underColour, light.under * 0.25);
  const phase = field.seed * 0.000001;
  let n = 0;
  for (let j = 0; j < rows; j++) {
    const v = -1.9 + (j + 0.5) * (2.54 / rows);
    for (let i = 0; i < columns; i++) {
      const u = -2.33 + (i + 0.5) * (4.66 / columns);
      const opacity = densities[j * columns + i] / 255;
      const gradientX =
        densities[j * columns + Math.min(columns - 1, i + 1)] -
        densities[j * columns + Math.max(0, i - 1)];
      const gradientY =
        densities[Math.min(rows - 1, j + 1) * columns + i] -
        densities[Math.max(0, j - 1) * columns + i];
      const pigment = wash(u * 0.9, v * 0.9, phase);
      const lit = cloudFieldLuminance(u, v, opacity, pigment, gradientX / 255, gradientY / 255, light);
      for (let ch = 0; ch < 3; ch++) {
        pixels[n++] = lerp(base[ch], palette.cloudLight[ch], lit);
      }
      pixels[n++] = 255 * opacity * (0.86 + 0.04 * pigment);
    }
  }
  c.putImageData(image, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(offscreen, x - size * 2.33, y - size * 1.9, width, height);
  ctx.restore();
  return field;
}
