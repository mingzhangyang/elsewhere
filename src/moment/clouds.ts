import { type Palette, type Rgb, clamp01, css, lerp, mark, mix, washAt } from './paint';

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
 * A single continuous cloud bank. A modest sculpted crown catches a wide wash of light; a cool,
 * feathered underside recedes into the sky. There are no independent billow discs to read as
 * rows of cotton balls or 3D spheres.
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
  const half = size * (1.45 + random() * 0.55);
  const height = size * (0.7 + Math.min(3, tiers) * 0.2);
  const lean = (random() - 0.5) * size * 0.36;
  const base = y + size * 0.04;
  const crown = mix(palette.cloudBody, palette.cloudLight, 0.55 - light.backlit * 0.24);
  const shade = mix(palette.cloudBody, palette.cloudShadow, 0.4);
  const upper: Point[] = [];
  const lower: Point[] = [];
  const bulges = [0, 0.25, 0.54, 0.66, 0.91, 1, 0.8, 0.57, 0.28, 0];
  for (let i = 0; i < bulges.length; i++) {
    const t = i / (bulges.length - 1);
    const px = x + half * (2 * t - 1) + lean * Math.sin(t * Math.PI);
    const rise = height * bulges[i] * (0.85 + random() * 0.25);
    upper.push({ x: px, y: base - rise });
  }
  for (let i = 6; i >= 0; i--) {
    const t = i / 6;
    const px = x + half * (2 * t - 1);
    lower.push({ x: px, y: base + size * (0.04 + 0.05 * Math.sin(t * Math.PI) * (random() - 0.5)) });
  }

  const top = base - height * 1.15;
  const gradient = ctx.createLinearGradient(0, top, 0, base + size * 0.1);
  gradient.addColorStop(0, css(crown, 0.58));
  gradient.addColorStop(0.3, css(crown, 0.8));
  gradient.addColorStop(0.64, css(palette.cloudBody, 0.78));
  gradient.addColorStop(0.89, css(shade, 0.65));
  gradient.addColorStop(1, css(shade, 0.12));

  ctx.save();
  // Only one outline, softly deposited: no bevel, bevel highlight, or outlines of inner circles.
  ctx.fillStyle = gradient;
  ctx.shadowColor = css(palette.cloudBody, 0.42);
  ctx.shadowBlur = size * 0.12;
  ctx.beginPath();
  smoothCloudPath(ctx, upper, lower);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  smoothCloudPath(ctx, upper, lower);
  ctx.clip();

  // Broader, nearly horizontal wet-on-wet washes express form without internal ball contours.
  washAt(
    ctx,
    x - half * 0.05 + light.x * size * 0.2,
    base - height * 0.64,
    size * 0.28,
    half / (size * 0.3),
    mix(crown, palette.glow, light.backlit * 0.32),
    0.18 + 0.12 * (1 - light.backlit),
  );
  washAt(ctx, x - half * 0.23, base - height * 0.34, size * 0.24, half / (size * 0.28), shade, 0.15);
  washAt(
    ctx,
    x + half * 0.24,
    base - height * 0.18,
    size * 0.18,
    half / (size * 0.34),
    light.under > 0.02 ? mix(shade, light.underColour, light.under * 0.65) : shade,
    0.2 + light.under * 0.2,
  );
  const ribbons = 2 + (tiers > 1 ? 1 : 0);
  for (let i = 0; i < ribbons; i++) {
    const from = base - height * (0.22 + random() * 0.5);
    const length = half * (0.55 + random() * 0.65);
    veil(
      ctx,
      x + (random() - 0.5) * half * 0.55,
      from,
      length,
      size * (0.08 + random() * 0.07),
      shade,
      crown,
      random,
      0.12,
      (random() - 0.5) * 0.08,
    );
  }
  ctx.restore();

  // Transparent torn edges bleed into the wash beyond the coherent main silhouette.
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    washAt(
      ctx,
      x + side * half * 0.72,
      base - height * (0.25 + random() * 0.32),
      size * 0.11,
      3.5 + random() * 1.5,
      crown,
      0.12,
    );
  }
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
    washAt(ctx, cx - l * 0.05, y + oy - t * 0.4, t * 0.7, l / (t * 1.4), edge, 0.09);
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
    // Fine chipped feather marks soften the transition without building rows of spheres.
    ctx.save();
    ctx.fillStyle = css(edge, 0.11);
    ctx.beginPath();
    for (let k = 0; k < 3; k++)
      mark(
        ctx,
        x + shift + (random() - 0.5) * length * 0.72,
        cy - size * (0.15 + random() * 0.25),
        size * (0.6 + random() * 0.9),
        size * 0.035,
        slope,
        -size * 0.06,
      );
    ctx.fill();
    ctx.restore();
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

/** Overcast: a few broad atmospheric veils, not a stack of twelve opaque cloud slabs. */
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
  const bands = 2 + Math.round(clamp01(amount) * 3);
  const shadow = mix(palette.cloudBody, palette.cloudShadow, 0.35 + 0.25 * light.backlit);
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
    washAt(
      ctx,
      cx,
      cy - depth * 0.3,
      depth * 0.56,
      length / (depth * 1.7),
      palette.cloudLight,
      0.05 + 0.09 * clamp01(amount),
    );
  }
}
