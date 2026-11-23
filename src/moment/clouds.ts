import { type Palette, type Rgb, clamp01, css, lerp, mark, mix, washAt } from './paint';
import { paintCloudField } from './cloudField';

/**
 * Atmospheric watercolour clouds for postcard illustrations. The shape vocabulary is deliberately
 * continuous and low-frequency: broad veils, torn horizontal edges and a small number of joined
 * cloud banks, not rows of separately shaded circles. Source cover still controls how much cloud
 * is painted; no invented star or planet positions enter this layer.
 */

/** Direction of the Sun/Moon on the canvas and whether its light comes from behind/below a cloud. */
export interface CloudLight {
  x: number;
  y: number;
  backlit: number;
  under: number;
  underColour: Rgb;
}

interface Point {
  x: number;
  y: number;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * One closed, gently torn silhouette. The broad undulations are connected with quadratic curves,
 * including the underside. A single path means no visible spherical seams or repeated ball shapes.
 */
function smoothCloudPath(ctx: CanvasRenderingContext2D, upper: Point[], lower: Point[]) {
  const all = [...upper, ...lower];
  const first = midpoint(all[all.length - 1], all[0]);
  ctx.moveTo(first.x, first.y);
  for (let i = 0; i < all.length; i++) {
    const next = midpoint(all[i], all[(i + 1) % all.length]);
    ctx.quadraticCurveTo(all[i].x, all[i].y, next.x, next.y);
  }
  ctx.closePath();
}

/** A translucent, irregularly tapered horizontal wash, not an opaque line or repeated ellipse. */
function veil(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  depth: number,
  body: Rgb,
  highlight: Rgb,
  random: () => number,
  alpha: number,
  slope = 0,
) {
  if (length <= 0 || depth <= 0 || alpha <= 0.005) return;
  const upper: Point[] = [];
  const lower: Point[] = [];
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    const envelope = Math.pow(Math.max(0, Math.sin(t * Math.PI)), 0.48);
    const center = y + slope * length * (t - 0.5);
    const jitter = (random() - 0.5) * depth * 0.22;
    const px = x + length * (t - 0.5);
    upper.push({ x: px, y: center - depth * envelope * (0.5 + random() * 0.2) + jitter });
    lower.unshift({ x: px, y: center + depth * envelope * (0.26 + random() * 0.16) + jitter });
  }
  const gradient = ctx.createLinearGradient(0, y - depth, 0, y + depth);
  gradient.addColorStop(0, css(highlight, 0));
  gradient.addColorStop(0.35, css(highlight, alpha * 0.65));
  gradient.addColorStop(0.58, css(body, alpha));
  gradient.addColorStop(1, css(body, 0));
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.shadowColor = css(body, alpha * 0.24);
  ctx.shadowBlur = depth * 0.28;
  ctx.beginPath();
  smoothCloudPath(ctx, upper, lower);
  ctx.fill();
  ctx.restore();
}

/**
 * Cumulus now comes from a seeded, two-dimensional transparency field instead of an elevation
 * silhouette. Its pigment density, lit surface and softened edge are drawn in the lazy postcard
 * canvas. The live 3D weather renderer is not involved.
 */
export function cumulus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  palette: Palette,
  light: CloudLight,
  random: () => number,
  tiers = 1,
) {
  paintCloudField(ctx, x, y, size, palette, light, random, tiers);
}

/** Near-horizon stratus: thin horizontal washes with broken, nonparallel feathered edges. */
export function stratus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  palette: Palette,
  light: CloudLight,
  random: () => number,
  unit: number,
) {
  const body = mix(palette.cloudBody, palette.cloudShadow, 0.36);
  const edge = mix(palette.cloudLight, palette.glow, 0.3 * light.backlit);
  const bands = 1 + Math.floor(random() * 2);
  for (let i = 0; i < bands; i++) {
    const oy = (i - (bands - 1) / 2) * (13 + random() * 12) * unit;
    const l = length * (0.72 + random() * 0.5);
    const t = (8 + random() * 7) * unit;
    const cx = x + (random() - 0.5) * length * 0.24;
    veil(ctx, cx, y + oy, l, t * 1.45, body, edge, random, 0.42, (random() - 0.5) * 0.04);
  }
}

/** Mid-level fields are interrupted ribbons, not an evenly spaced matrix of round puffs. */
export function altocumulus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  palette: Palette,
  light: CloudLight,
  random: () => number,
) {
  const body = mix(palette.cloudBody, palette.cloudShadow, 0.25 + 0.25 * light.backlit);
  const edge = mix(palette.cloudLight, palette.glow, 0.28 * light.backlit);
  const slope = (random() - 0.5) * 0.12;
  for (let row = 0; row < 2; row++) {
    const cy = y + (row - 0.5) * size * 1.2;
    const shift = (random() - 0.5) * size * 2;
    const length = size * (4.6 + random() * 3.6);
    veil(ctx, x + shift, cy, length, size * (0.55 + random() * 0.28), body, edge, random, 0.25, slope);
  }
}

/** High cirrus: sparse and low-contrast trailing ink-washes, never a comb of hard parallel lines. */
export function cirrus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  palette: Palette,
  light: CloudLight,
  random: () => number,
) {
  const tint = mix(palette.cloudLight, palette.glow, 0.3 * light.backlit);
  const angle = (random() - 0.5) * 0.2;
  washAt(ctx, x, y, length * 0.035, 9, tint, 0.1);
  ctx.save();
  ctx.fillStyle = css(tint, 0.16);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const l = length * (0.32 + random() * 0.65);
    const ox = (random() - 0.5) * length * 0.45;
    mark(
      ctx,
      x + ox,
      y + (random() - 0.5) * length * 0.12 + ox * Math.sin(angle),
      l,
      length * (0.003 + random() * 0.005),
      angle + (random() - 0.5) * 0.08,
      -l * (0.02 + random() * 0.05),
    );
  }
  ctx.fill();
  ctx.restore();
}

/** Seeded bilinear noise: one coherent cloud deck, without hard bands or tiled rows. */
function deckNoise(u: number, v: number, cellsX: number, cellsY: number, seed: number): number {
  const x = u * cellsX;
  const y = v * cellsY;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const hash = (a: number, b: number) => {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const top = lerp(hash(ix, iy), hash(ix + 1, iy), sx);
  const bottom = lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx);
  return lerp(top, bottom, sy);
}

/** Continuous coverage approaches a dense, still textured deck at 100%, not three open strips. */
export function sampleOvercastDeck(
  u: number,
  v: number,
  seed: number,
  amount: number,
): { alpha: number; tone: number } {
  const t = clamp01((clamp01(amount) - 0.74) / 0.26);
  const coverage = t * t * (3 - 2 * t);
  const variation =
    (deckNoise(u, v, 3, 2, seed) - 0.5) * 0.55 +
    (deckNoise(u, v, 10, 7, seed + 13) - 0.5) * 0.3 +
    (deckNoise(u, v, 23, 18, seed + 31) - 0.5) * 0.15;
  return {
    alpha: coverage * (0.94 + 0.075 * variation),
    tone: clamp01(0.5 + variation * 1.4),
  };
}

/** Overcast: a coherent diffuse cloud deck above the formerly sparse atmospheric veils. */
export function cloudSheet(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  bottom: number,
  palette: Palette,
  light: CloudLight,
  random: () => number,
  amount: number,
) {
  if (bottom <= top || amount <= 0) return;
  const span = bottom - top;
  const bands = 1 + Math.round(clamp01(amount) * 2);
  const shadow = mix(palette.cloudBody, palette.cloudShadow, 0.35 + 0.25 * light.backlit);
  if (amount > 0.74) {
    const seed = (random() * 0xffffffff) >>> 0;
    const offscreen =
      typeof document !== 'undefined' && typeof ctx.canvas?.width === 'number'
        ? document.createElement('canvas')
        : null;
    const c = offscreen?.getContext('2d');
    if (offscreen && c) {
      offscreen.width = Math.max(24, Math.min(160, Math.ceil(width / 10)));
      offscreen.height = Math.max(16, Math.min(160, Math.ceil(span / 10)));
      const image = c.createImageData(offscreen.width, offscreen.height);
      const pixels = image.data;
      let n = 0;
      for (let j = 0; j < offscreen.height; j++) {
        const v = (j + 0.5) / offscreen.height;
        for (let i = 0; i < offscreen.width; i++) {
          const u = (i + 0.5) / offscreen.width;
          const { alpha, tone } = sampleOvercastDeck(u, v, seed, amount);
          const directed = clamp01(tone + (u - 0.5) * light.x * 0.12 + (v - 0.5) * light.y * 0.12);
          const colour = mix(shadow, palette.cloudLight, 0.15 + directed * 0.38);
          for (let ch = 0; ch < 3; ch++) pixels[n++] = colour[ch];
          pixels[n++] = alpha * 255;
        }
      }
      c.putImageData(image, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen, 0, top, width, span);
      ctx.restore();
    } else {
      // Recording canvases still express the dense deck for non-browser tests.
      ctx.save();
      ctx.fillStyle = css(
        mix(shadow, palette.cloudLight, 0.38),
        sampleOvercastDeck(0.5, 0.5, seed, amount).alpha,
      );
      ctx.fillRect(0, top, width, span);
      ctx.restore();
    }
  }
  for (let i = 0; i < bands; i++) {
    const t = (i + 0.45 + (random() - 0.5) * 0.28) / bands;
    const cy = lerp(top, bottom, t);
    const depth = span * (0.11 + random() * 0.09);
    const length = width * (0.85 + random() * 0.48);
    const cx = width * (0.3 + random() * 0.4);
    veil(
      ctx,
      cx,
      cy,
      length,
      depth,
      shadow,
      palette.cloudLight,
      random,
      clamp01(0.1 + 0.3 * amount),
      (random() - 0.5) * 0.045,
    );
  }
}
