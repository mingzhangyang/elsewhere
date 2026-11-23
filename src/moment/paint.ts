import { seededRandom } from '../lib/random';

/**
 * The paintbox of the illustrated sky: colours keyed to the Sun's altitude and a few brush marks
 * (soft dabs, wobbly blobs, tapered strokes). Everything here only issues drawing calls and never
 * reads anything back from the canvas, so the illustration can be drawn onto a recording context in
 * unit tests.
 */

export type Rgb = [number, number, number];
export type Point = { x: number; y: number };
export const TAU = Math.PI * 2;
export const hex = (value: string): Rgb => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  a.map((v, i) => Math.round(v + (b[i] - v) * clamp01(t))) as Rgb;
export const css = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r},${g},${b},${clamp01(alpha).toFixed(3)})`;
/** Shadows in a painting lean toward a deep blue-violet, never toward black. */
export const deepen = (colour: Rgb, amount: number) => mix(colour, [22, 20, 58], amount);

/** A painted palette for one light: sky bands, the glow toward the light, clouds and land. */
export interface Palette {
  zenith: Rgb;
  upper: Rgb;
  lower: Rgb;
  horizon: Rgb;
  glow: Rgb;
  cloudLight: Rgb;
  cloudBody: Rgb;
  cloudShadow: Rgb;
  /** Distant land, already half sky. */
  landFar: Rgb;
  /** Middle-distance slopes in shade. */
  landMid: Rgb;
  /** The nearest ground in shade. */
  landNear: Rgb;
  /** Slopes and grass that catch the light. */
  landLight: Rgb;
  /** Leaves that catch the light. */
  leafLight: Rgb;
}
const PALETTE_KEYS: (keyof Palette)[] = [
  'zenith',
  'upper',
  'lower',
  'horizon',
  'glow',
  'cloudLight',
  'cloudBody',
  'cloudShadow',
  'landFar',
  'landMid',
  'landNear',
  'landLight',
  'leafLight',
];
const key = (sun: number, colours: string): [number, Palette] => [
  sun,
  Object.fromEntries(colours.split(' ').map((c, i) => [PALETTE_KEYS[i], hex(c)])) as unknown as Palette,
];
/** Keyed by Sun altitude: deep night, blue hour, dusk, sunset, golden hour, day. */
const PALETTES: [number, Palette][] = [
  key(
    -18,
    '#080c34 #10226a #1d478c #3f7ea6 #78b0c4 #b4c6ee #3a4d8c #19245a #1f4372 #142c52 #0a1734 #4a78a8 #6c9cc0',
  ),
  key(
    -11,
    '#0f1a58 #27398c #5a62ac #a182b6 #dc9eb2 #f0c6d8 #62639f #343a74 #44528e #2b3668 #151d40 #7672b0 #8a8cc4',
  ),
  key(
    -5,
    '#1c2e80 #4b5fb2 #a984ba #f49e7a #ffba78 #ffd4a4 #ad7a9e #5e4c86 #6a64a2 #473f76 #201f48 #c4849a #d49a8c',
  ),
  key(
    0,
    '#2d5cb2 #7696d4 #f2aca4 #ffc27a #ffdc84 #fff2c8 #f2ac94 #91689c #8e84b8 #5c558c #2a2a56 #f6a674 #f0b266',
  ),
  key(
    6,
    '#327ad2 #7db4e8 #f6dcbc #ffe8b2 #fff4cc #fffbf0 #fae6d6 #b8a4cc #88aac2 #5c9468 #2c5c40 #dcd472 #e6dc7a',
  ),
  key(
    18,
    '#1a66cc #4a9eea #98d4f6 #d6f0fb #ffffff #ffffff #eef4fc #9cb4e0 #92bcd2 #62a85e #2a6a40 #c2dc68 #cfe46c',
  ),
];
export function paletteFor(sunAltitude: number, cloudCover: number): Palette {
  let palette = PALETTES[PALETTES.length - 1][1];
  if (sunAltitude <= PALETTES[0][0]) palette = PALETTES[0][1];
  else
    for (let i = 1; i < PALETTES.length; i++)
      if (sunAltitude <= PALETTES[i][0]) {
        const [a0, p0] = PALETTES[i - 1];
        const [a1, p1] = PALETTES[i];
        const t = (sunAltitude - a0) / (a1 - a0);
        palette = Object.fromEntries(
          PALETTE_KEYS.map((k) => [k, mix(p0[k], p1[k], t)]),
        ) as unknown as Palette;
        break;
      }
  // An overcast sky loses its colour toward a soft grey of the same lightness.
  const grey = (c: Rgb): Rgb => {
    const l = Math.round(c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15);
    return mix(c, [l, l, Math.min(255, l + 8)], cloudCover * 0.45);
  };
  return {
    ...palette,
    zenith: grey(palette.zenith),
    upper: grey(palette.upper),
    lower: grey(palette.lower),
    horizon: grey(palette.horizon),
  };
}

/** Smooth 1D value noise in [0, 1], repeatable from a seed. */
export function noise1(seed: number) {
  const random = seededRandom(seed);
  const values = Array.from({ length: 256 }, random);
  return (x: number) => {
    const i = Math.floor(x),
      f = x - i;
    const a = values[i & 255],
      b = values[(i + 1) & 255];
    return a + (b - a) * f * f * (3 - 2 * f);
  };
}

/** A repeatable number in [0, 1) from a string, for marks that belong to one named thing. */
export function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** A soft round dab of colour that fades to nothing at `radius`. */
export function glowAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colour: Rgb,
  alpha: number,
) {
  if (alpha <= 0.002 || radius <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, css(colour, alpha));
  g.addColorStop(0.35, css(colour, alpha * 0.45));
  g.addColorStop(1, css(colour, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

/** A soft dab stretched into a long horizontal wash. */
export function washAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  stretch: number,
  colour: Rgb,
  alpha: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(stretch, 1);
  glowAt(ctx, 0, 0, radius, colour, alpha);
  ctx.restore();
}

/**
 * Adds a closed, hand-drawn round shape to the current path: a ring of points with uneven radii
 * joined by smooth curves. `wobble` is the unevenness, as a share of the radius.
 */
export function blob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  random: () => number,
  wobble = 0.16,
  points = 9,
) {
  const phase = random() * TAU;
  const ring: Point[] = [];
  for (let i = 0; i < points; i++) {
    const a = phase + (i / points) * TAU;
    const k = 1 + (random() - 0.5) * 2 * wobble;
    ring.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  const last = ring[points - 1];
  ctx.moveTo((last.x + ring[0].x) / 2, (last.y + ring[0].y) / 2);
  for (let i = 0; i < points; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % points];
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  ctx.closePath();
}

/**
 * Adds one brush mark to the current path: a stroke that swells in the middle and tapers to both
 * ends, `length` long and `thickness` at its widest, turned by `angle` and bowed by `bow`.
 */
export function mark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  thickness: number,
  angle = 0,
  bow = 0,
) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const half = length / 2;
  const ax = x - half * c,
    ay = y - half * s;
  const bx = x + half * c,
    by = y + half * s;
  const tx = x - (bow - thickness) * s,
    ty = y + (bow - thickness) * c;
  const ux = x - (bow + thickness) * s,
    uy = y + (bow + thickness) * c;
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(tx, ty, bx, by);
  ctx.quadraticCurveTo(ux, uy, ax, ay);
}

/** Adds a grass blade to the current path: rooted at (x, y), `h` tall, leaning by `lean`. */
export function blade(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  lean: number,
  w: number,
) {
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w * 0.6 + lean * 0.35, y - h * 0.6, x + lean, y - h);
  ctx.quadraticCurveTo(x + w * 0.9 + lean * 0.3, y - h * 0.5, x + w, y);
  ctx.closePath();
}
