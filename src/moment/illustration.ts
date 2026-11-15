import type { MomentSnapshot } from '../lib/moment';
import type { SkyObject } from '../lib/exploration';
import type { Star } from '../types';
import { CONSTELLATIONS, type PatternId } from '../domain/stars';
import {
  planetVisibilityFactors,
  starVisibilityFactors,
  twilightVisibility,
  weatherVisibility,
} from '../domain/starVisibility';
import { seededRandom } from '../lib/random';
import { HORIZON_STEP, horizonAltitude, type HorizonVariant } from './scenery';

/**
 * The illustrated sky: a painted, picture-book rendering of the same calculated snapshot as the
 * realistic image, on a plain 2D canvas. Watercolour skies keyed to the Sun's altitude, sculpted
 * clouds from the low, mid and high cloud cover, pastel stars with soft halos, a glowing Moon in
 * its true phase, and a hand-painted landscape with atmospheric depth.
 *
 * What stays calculated: every star, planet, the Sun and the Moon sit where the projection puts
 * them, and which of them appear follows the app's visibility model, so a bright or cloudy sky shows
 * fewer. What is illustrative: sizes (the Moon and planets are enlarged), colours, cloud shapes and
 * the landscape. Scenery reaches at most 2° above the horizon; anything taller (the tree, the house)
 * stands on ground below the horizon line, so nothing reported visible is hidden.
 */

/** Maps a direction to canvas pixels in the sky area. */
export type ToCanvas = (altitude: number, azimuth: number) => { x: number; y: number; front: boolean };

export interface IllustrationText {
  object: (object: SkyObject) => string;
  pattern: (id: PatternId) => string;
}

type Rgb = [number, number, number];
type Point = { x: number; y: number };
const hex = (value: string): Rgb => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  a.map((v, i) => Math.round(v + (b[i] - v) * clamp01(t))) as Rgb;
const css = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r},${g},${b},${clamp01(alpha).toFixed(3)})`;
const TAU = Math.PI * 2;

/** A painted palette for one light: sky bands, the glow toward the light, clouds and land. */
interface Palette {
  zenith: Rgb;
  upper: Rgb;
  lower: Rgb;
  horizon: Rgb;
  glow: Rgb;
  cloudLight: Rgb;
  cloudBody: Rgb;
  cloudShadow: Rgb;
  landFar: Rgb;
  landNear: Rgb;
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
  'landNear',
];
const key = (sun: number, colours: string[]): [number, Palette] => [
  sun,
  Object.fromEntries(PALETTE_KEYS.map((k, i) => [k, hex(colours[i])])) as unknown as Palette,
];
/** Keyed by Sun altitude: deep night, blue hour, dusk, sunset, golden hour, day. */
const PALETTES: [number, Palette][] = [
  key(-18, [
    '#081238',
    '#122862',
    '#1f4582',
    '#356593',
    '#5f93b8',
    '#b8c8ea',
    '#33467a',
    '#1a2550',
    '#1d3a64',
    '#0b1b30',
  ]),
  key(-11, [
    '#0e1850',
    '#22347a',
    '#454f98',
    '#7a6aa8',
    '#bb8db0',
    '#e2bdd2',
    '#555a94',
    '#2f3468',
    '#36477e',
    '#16213e',
  ]),
  key(-5, [
    '#1b2c76',
    '#4559a6',
    '#9a7cb4',
    '#ee9d7d',
    '#ffb17a',
    '#ffd3a8',
    '#b07c9e',
    '#664d80',
    '#5b5d98',
    '#272c52',
  ]),
  key(0, [
    '#2c56a6',
    '#6c8ccc',
    '#e5a7a6',
    '#ffc07c',
    '#ffd47e',
    '#fff0c4',
    '#f1b59e',
    '#9d6f92',
    '#7a7cb0',
    '#3a4568',
  ]),
  key(6, [
    '#3b7ac8',
    '#7cade0',
    '#f2d2b6',
    '#ffe3ab',
    '#fff1c4',
    '#fffaf0',
    '#fbe8d8',
    '#c3a9c9',
    '#7e9fbb',
    '#4e7a52',
  ]),
  key(18, [
    '#2a7bd4',
    '#5eaae7',
    '#a6d6f3',
    '#def1fb',
    '#ffffff',
    '#ffffff',
    '#f5f8fd',
    '#b5c3e2',
    '#8db3c9',
    '#5c9858',
  ]),
];
function paletteFor(sunAltitude: number, cloudCover: number): Palette {
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
function noise1(seed: number) {
  const random = seededRandom(seed);
  const values = Array.from({ length: 256 }, random);
  return (x: number) => {
    const i = Math.floor(x),
      f = x - i;
    const a = values[((i % 256) + 256) % 256],
      b = values[(((i + 1) % 256) + 256) % 256];
    return a + (b - a) * f * f * (3 - 2 * f);
  };
}

function glowAt(
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

/** A four-pointed twinkle with tapering rays; `waist` is how thin the rays are. */
function twinkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, waist: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const radius = i % 2 ? r * waist : r;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
}

const starTint = (colorIndex: number | null | undefined): Rgb =>
  colorIndex == null || colorIndex < 0.05
    ? hex('#d6e4ff')
    : colorIndex < 0.6
      ? hex('#fff7e4')
      : colorIndex < 1.1
        ? hex('#ffe4b4')
        : hex('#ffc59e');

/** The Moon as a picture book paints it: a soft halo, a creamy disc, watercolour maria, earthshine. */
function paintMoon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  illumination: number,
  angle: number,
  day: number,
) {
  const lit = hex('#fff3cf');
  const dusk = 1 - day * 0.75;
  glowAt(ctx, x, y, r * 6.5, hex('#fff2d0'), (0.1 + 0.28 * illumination) * dusk);
  glowAt(ctx, x, y, r * 2.3, lit, 0.08 * (0.4 + illumination) * dusk);
  glowAt(ctx, x, y, r * 3.4, lit, 0.05 * (0.4 + illumination) * dusk);
  ctx.save();
  ctx.translate(x, y);
  // Earthshine: the dark part is a deep, faintly luminous blue rather than a hole.
  ctx.fillStyle = day > 0.5 ? 'rgba(255,255,255,.18)' : css(hex('#5a6ea8'), 0.3 + 0.25 * (1 - day));
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  const turn = ((angle - 90) * Math.PI) / 180;
  ctx.rotate(turn);
  const terminator = 1 - 2 * clamp01(illumination);
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
  ctx.ellipse(
    0,
    0,
    Math.max(0.001, Math.abs(terminator)) * r,
    r,
    0,
    Math.PI / 2,
    -Math.PI / 2,
    terminator > 0,
  );
  ctx.clip();
  ctx.rotate(-turn);
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  body.addColorStop(0, '#fffbea');
  body.addColorStop(0.7, css(lit));
  body.addColorStop(1, '#f1dca8');
  ctx.fillStyle = body;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  // Maria as soft watercolour blots.
  ctx.fillStyle = 'rgba(196,176,140,.32)';
  for (const [mx, my, mr] of [
    [-0.28, -0.3, 0.26],
    [0.12, -0.38, 0.2],
    [0.22, -0.02, 0.24],
    [-0.15, 0.12, 0.17],
    [0.05, 0.42, 0.12],
  ]) {
    ctx.beginPath();
    ctx.ellipse(mx * r, my * r, mr * r, mr * r * 0.82, 0.4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A sculpted cumulus: a shadowed base, a body and a lit crown toward the light, with a flat bottom.
 * `light` is −1 (lit from the left) to 1 (from the right).
 */
function cumulus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  palette: Palette,
  light: number,
  random: () => number,
  alpha: number,
  tiers = 1,
) {
  const puffs: [number, number, number][] = [];
  const n = 5 + Math.floor(random() * 4);
  for (let i = 0; i < n; i++)
    puffs.push([
      x + (i / (n - 1) - 0.5) * size * 2.3,
      y - random() * size * 0.2,
      size * (0.34 + random() * 0.24),
    ]);
  // Tiers of rounded crowns, each narrower and higher: a towering summer cloud when `tiers` is 3.
  for (let tier = 1; tier <= tiers; tier++) {
    const spread = 1.3 / tier;
    for (let i = 0; i < 4 - Math.min(2, tier - 1); i++)
      puffs.push([
        x + (random() - 0.5) * size * spread,
        y - size * (0.42 * tier + random() * 0.35),
        size * (0.4 + random() * 0.22) * (1 - (tier - 1) * 0.12),
      ]);
  }
  const base = y + size * 0.2;
  const path = (dx: number, dy: number, scale: number) => {
    ctx.beginPath();
    for (const [px, py, r] of puffs) {
      ctx.moveTo(px + dx + r * scale, py + dy);
      ctx.arc(px + dx, py + dy, r * scale, 0, TAU);
    }
  };
  const crownTop = Math.min(...puffs.map(([, py, r]) => py - r));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(x - size * 3, y - size * 5, size * 6, base - (y - size * 5));
  ctx.clip();
  // The body: lit at the crown, shadowed toward the flat base, with softened painted edges.
  const shade = ctx.createLinearGradient(0, crownTop, 0, base);
  shade.addColorStop(0, css(mix(palette.cloudLight, palette.cloudBody, 0.15)));
  shade.addColorStop(0.55, css(palette.cloudBody));
  shade.addColorStop(1, css(palette.cloudShadow));
  ctx.shadowColor = css(palette.cloudBody, 0.7);
  ctx.shadowBlur = size * 0.09;
  ctx.fillStyle = shade;
  path(0, 0, 1);
  ctx.fill();
  ctx.shadowBlur = 0;
  path(0, 0, 1);
  ctx.clip();
  // Each billow, back to front, is shaded on its underside and catches the light on its crown.
  const ordered = [...puffs].sort((a, b) => a[1] - b[1]);
  for (const [px, py, r] of ordered) {
    const sx = px - light * r * 0.25,
      sy = py + r * 0.45;
    const under = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.9);
    under.addColorStop(0, css(palette.cloudShadow, 0.35));
    under.addColorStop(1, css(palette.cloudShadow, 0));
    ctx.fillStyle = under;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.9, 0, TAU);
    ctx.fill();
    const hx = px + light * r * 0.35,
      hy = py - r * 0.4;
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 1.05);
    g.addColorStop(0, css(palette.cloudLight, 0.95));
    g.addColorStop(0.55, css(palette.cloudLight, 0.4));
    g.addColorStop(1, css(palette.cloudLight, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 1.05, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Altocumulus: a field of small rounded puffs, lit on top. */
function puffField(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  palette: Palette,
  random: () => number,
) {
  for (let i = 0; i < 9; i++) {
    const px = x + (random() - 0.5) * size * 5,
      py = y + (random() - 0.5) * size * 1.2,
      r = size * (0.25 + random() * 0.25);
    ctx.fillStyle = css(palette.cloudBody, 0.75);
    ctx.beginPath();
    ctx.ellipse(px, py, r * 1.5, r, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = css(palette.cloudLight, 0.8);
    ctx.beginPath();
    ctx.ellipse(px - r * 0.15, py - r * 0.25, r * 1.1, r * 0.6, 0, 0, TAU);
    ctx.fill();
  }
}

/** Cirrus: long feathered brush strokes. */
function cirrus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  palette: Palette,
  random: () => number,
) {
  ctx.lineCap = 'round';
  const tilt = (random() - 0.5) * 0.5;
  for (let i = 0; i < 6; i++) {
    const oy = (random() - 0.5) * length * 0.08,
      ox = (random() - 0.5) * length * 0.15;
    ctx.strokeStyle = css(palette.cloudLight, 0.14 + random() * 0.2);
    ctx.lineWidth = length * (0.012 + random() * 0.02);
    ctx.beginPath();
    ctx.moveTo(x - length / 2 + ox, y + oy + tilt * length * 0.3);
    ctx.quadraticCurveTo(x + ox, y + oy - length * 0.06, x + length / 2 + ox, y + oy - tilt * length * 0.3);
    ctx.stroke();
  }
}

/** A scalloped outline around (cx, cy): the soft, leafy edge of a painted tree crown. */
function scallop(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, phase: number) {
  for (let k = 0; k < 13; k++) {
    const a = (k / 13) * TAU + phase;
    const bump = r * (0.24 + 0.05 * Math.sin(k * 2.7 + phase * 3));
    const bx = cx + Math.cos(a) * r * 0.82,
      by = cy + Math.sin(a) * r * 0.82;
    ctx.moveTo(bx + bump, by);
    ctx.arc(bx, by, bump, 0, TAU);
  }
  ctx.moveTo(cx + r * 0.85, cy);
  ctx.arc(cx, cy, r * 0.85, 0, TAU);
}

/** A broad, leafy tree of a few scalloped masses, shaded beneath and lit on one side. */
function tree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  foliage: Rgb,
  rim: Rgb,
  light: number,
  random: () => number,
) {
  const bark = mix(foliage, [36, 24, 16], 0.55);
  ctx.fillStyle = css(bark);
  ctx.beginPath();
  ctx.moveTo(x - h * 0.045, y);
  ctx.quadraticCurveTo(x - h * 0.02, y - h * 0.3, x - h * 0.012, y - h * 0.55);
  ctx.lineTo(x + h * 0.012, y - h * 0.55);
  ctx.quadraticCurveTo(x + h * 0.02, y - h * 0.3, x + h * 0.045, y);
  ctx.closePath();
  ctx.fill();
  const masses: [number, number, number][] = [
    [-0.17, -0.5, 0.2],
    [0.18, -0.52, 0.21],
    [0, -0.62, 0.26],
    [-0.06, -0.82, 0.19],
    [0.12, -0.76, 0.17],
  ].map(([mx, my, mr]) => [x + (mx + (random() - 0.5) * 0.04) * h, y + my * h, mr * h]);
  const crown = (dx: number, dy: number, scale: number) => {
    ctx.beginPath();
    masses.forEach(([mx, my, mr], i) => scallop(ctx, mx + dx, my + dy, mr * scale, i * 1.7));
  };
  const top = y - h * 1.02,
    bottom = y - h * 0.3;
  const body = ctx.createLinearGradient(0, top, 0, bottom);
  body.addColorStop(0, css(mix(foliage, rim, 0.12)));
  body.addColorStop(1, css(mix(foliage, [0, 0, 0], 0.35)));
  ctx.fillStyle = body;
  crown(0, 0, 1);
  ctx.fill();
  ctx.save();
  crown(0, 0, 1);
  ctx.clip();
  // The lit side of each mass, then small leafy dabs of light.
  ctx.fillStyle = css(mix(foliage, rim, 0.3), 0.6);
  ctx.beginPath();
  masses.forEach(([mx, my, mr], i) =>
    scallop(ctx, mx + light * mr * 0.35, my - mr * 0.3, mr * 0.62, i * 1.7 + 0.5),
  );
  ctx.fill();
  for (let i = 0; i < 46; i++) {
    const [mx, my, mr] = masses[Math.floor(random() * masses.length)];
    const a = -Math.PI / 2 + light * 0.6 + (random() - 0.5) * 2.4,
      d = mr * (0.35 + random() * 0.55);
    ctx.fillStyle = css(mix(foliage, rim, 0.45), 0.35 + random() * 0.25);
    ctx.beginPath();
    ctx.ellipse(mx + Math.cos(a) * d, my + Math.sin(a) * d, h * 0.022, h * 0.013, a + Math.PI / 2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * One layer of land painted like gouache: a lighter crest fading into its body, short brush dabs
 * clipped to it, and a thin line of light along the top.
 */
function landLayer(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  width: number,
  height: number,
  crestColour: Rgb,
  bodyColour: Rgb,
  rim: Rgb,
  rimAlpha: number,
  unit: number,
  random: () => number,
) {
  if (points.length < 2) return;
  const top = points.reduce((m, p) => Math.min(m, p.y), Infinity);
  if (top > height) return;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, height + 10);
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.lineTo(points[points.length - 1].x, height + 10);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(0, top, 0, top + 110 * unit);
  g.addColorStop(0, css(crestColour));
  g.addColorStop(1, css(bodyColour));
  ctx.fillStyle = g;
  path();
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  ctx.lineCap = 'round';
  const depth = Math.min(height, top + 320 * unit) - top;
  for (let i = 0; i < 220; i++) {
    const x = random() * width,
      y = top + random() * depth,
      length = (12 + random() * 46) * unit;
    ctx.strokeStyle =
      random() < 0.5
        ? css(mix(bodyColour, crestColour, 0.8), 0.1 + random() * 0.08)
        : css(mix(bodyColour, [0, 0, 0], 0.25), 0.08 + random() * 0.08);
    ctx.lineWidth = (2 + random() * 5) * unit;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y + (random() - 0.5) * length * 0.25);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = css(rim, rimAlpha);
  ctx.lineWidth = 1.6 * unit;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
}

/** Mist lying in a valley: a band of the horizon's colour that fades upward. */
function mist(
  ctx: CanvasRenderingContext2D,
  y: number,
  width: number,
  colour: Rgb,
  alpha: number,
  depth: number,
) {
  const g = ctx.createLinearGradient(0, y - depth, 0, y + depth * 0.4);
  g.addColorStop(0, css(colour, 0));
  g.addColorStop(0.75, css(colour, alpha));
  g.addColorStop(1, css(colour, alpha * 0.6));
  ctx.fillStyle = g;
  ctx.fillRect(0, y - depth, width, depth * 1.4);
}

/** Low stratus: long glowing streaks near the horizon, lit along their tops. */
function stratus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  palette: Palette,
  random: () => number,
  unit: number,
) {
  const thickness = (5 + random() * 9) * unit;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(length / (thickness * 2), 1);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, thickness * 2);
  g.addColorStop(0, css(palette.cloudBody, 0.75));
  g.addColorStop(0.6, css(palette.cloudBody, 0.45));
  g.addColorStop(1, css(palette.cloudBody, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, thickness * 2, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = css(palette.cloudLight, 0.45);
  ctx.lineWidth = 1.6 * unit;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - length * 0.4, y - thickness * 0.55);
  ctx.quadraticCurveTo(x, y - thickness * 0.9, x + length * 0.38, y - thickness * 0.5);
  ctx.stroke();
}

/** A small house with a pitched roof; its window glows warm once the light fades. */
function house(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  wall: Rgb,
  roof: Rgb,
  glow: number,
) {
  const w = h * 1.15;
  ctx.fillStyle = css(wall);
  ctx.fillRect(x - w / 2, y - h * 0.62, w, h * 0.64);
  ctx.fillStyle = css(roof);
  ctx.fillRect(x + w * 0.2, y - h * 1.02, h * 0.12, h * 0.28);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.62, y - h * 0.6);
  ctx.lineTo(x, y - h * 1.08);
  ctx.lineTo(x + w * 0.62, y - h * 0.6);
  ctx.closePath();
  ctx.fill();
  if (glow > 0.2) glowAt(ctx, x - w * 0.19, y - h * 0.33, h * 0.9, hex('#ffcf7a'), 0.4 * glow);
  ctx.fillStyle = css(mix(hex('#9fb6c8'), hex('#ffd98a'), glow));
  ctx.fillRect(x - w * 0.3, y - h * 0.44, w * 0.22, h * 0.22);
  ctx.fillStyle = css(mix(roof, [0, 0, 0], 0.2));
  ctx.fillRect(x + w * 0.08, y - h * 0.36, w * 0.18, h * 0.38);
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  font: string,
) {
  ctx.font = `700 ${Math.round(size)}px "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.32;
  ctx.strokeStyle = 'rgba(16,24,58,.72)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#fff6e2';
  ctx.fillText(text, x, y);
}

const PLANET_FILL: Record<string, [string, string]> = {
  mercury: ['#e8d6c2', '#b39c86'],
  venus: ['#fffbe8', '#f1dca6'],
  mars: ['#ff9a6a', '#c9573a'],
  jupiter: ['#f9e2bd', '#d6a874'],
  saturn: ['#f6e0a0', '#c8a868'],
};

export function drawIllustration(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: MomentSnapshot,
  toCanvas: ToCanvas,
  horizon: HorizonVariant,
  text: IllustrationText,
  font: string,
) {
  const { sky, weather, layers, view } = snapshot;
  const unit = height / 1000;
  const day = clamp01((sky.sunAltitude + 8) / 14);
  const night = 1 - clamp01((sky.sunAltitude + 14) / 10);
  const cover = clamp01(weather.cloudCover / 100);
  const palette = paletteFor(sky.sunAltitude, cover);
  const seed =
    (Math.floor(snapshot.instant.getTime() / 3600000) * 31 +
      Math.round(snapshot.location.latitude * 10) * 7 +
      Math.round(snapshot.location.longitude * 10)) >>>
    0;
  const inView = (p: Point & { front: boolean }, margin = 40) =>
    p.front && p.x > -margin && p.x < width + margin && p.y > -margin && p.y < height + margin;
  const horizonY = toCanvas(0, view.heading).y;
  // The light that shapes clouds and crests: the Sun by day and twilight, else the Moon.
  const lightBody = sky.sunAltitude > -10 ? sky.sun : sky.moon.visible ? sky.moon : null;
  const lightAt = lightBody ? toCanvas(Math.max(0, lightBody.altitude), lightBody.azimuth) : null;
  const light = lightAt?.front ? Math.max(-1, Math.min(1, (lightAt.x - width / 2) / (width / 2))) : -0.4;
  const rim = mix(palette.cloudLight, palette.glow, 0.4);
  const urban = snapshot.skyBrightness === 'city' ? 1 : snapshot.skyBrightness === 'suburban' ? 0.5 : 0;

  // 1. The sky: painted bands by altitude, from the zenith down to a luminous horizon.
  const yAt = (altitude: number) => toCanvas(altitude, view.heading).y;
  const highest = Math.min(89, view.altitude + view.fov);
  const top = yAt(highest),
    span = horizonY - top || 1;
  const gradient = ctx.createLinearGradient(0, top, 0, horizonY);
  for (const [altitude, colour] of [
    [highest, palette.zenith],
    [45, palette.upper],
    [14, palette.lower],
    [0, palette.horizon],
  ] as [number, Rgb][]) {
    const t = (yAt(Math.min(altitude, highest)) - top) / span;
    if (Number.isFinite(t)) gradient.addColorStop(clamp01(t), css(colour));
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  // Watercolour washes: long, soft horizontal sweeps of neighbouring colours, never quite even.
  const washes = seededRandom(seed + 61);
  for (let i = 0; i < 16; i++) {
    const y = top + washes() * Math.max(height, horizonY) * 1.05;
    const r = (40 + washes() * 90) * unit;
    const colour = mix(washes() < 0.5 ? palette.upper : palette.lower, palette.glow, washes() * 0.3);
    ctx.save();
    ctx.translate(washes() * width, y);
    ctx.scale(6 + washes() * 6, 1);
    glowAt(ctx, 0, 0, r, colour, 0.12 + washes() * 0.1);
    ctx.restore();
  }
  // A luminous haze lying on the horizon.
  mist(ctx, horizonY, width, mix(palette.horizon, palette.glow, 0.35), 0.45, 90 * unit);

  // Glows: toward the Sun near the horizon at dusk and dawn, and moonlight around the Moon.
  if (sky.sunAltitude > -14) {
    const s = toCanvas(Math.max(-2, sky.sun.altitude), sky.sun.azimuth);
    if (s.front) {
      const strength = (1 - Math.abs(sky.sunAltitude + 2) / 14) * (1 - cover * 0.6);
      ctx.save();
      ctx.translate(s.x, Math.max(s.y, horizonY));
      ctx.scale(2.6, 1);
      glowAt(ctx, 0, 0, 420 * unit, palette.glow, 0.55 * strength);
      ctx.restore();
    }
  }
  if (sky.moon.visible) {
    const p = toCanvas(sky.moon.altitude, sky.moon.azimuth);
    if (p.front) glowAt(ctx, p.x, p.y, 520 * unit, hex('#cfe0ff'), 0.22 * sky.moon.illumination * night);
  }
  // Light pollution, as set by the visitor: a warm glow low over the horizon.
  if (urban && night > 0.2) {
    const g = ctx.createLinearGradient(0, horizonY - 260 * unit, 0, horizonY);
    g.addColorStop(0, 'rgba(255,170,110,0)');
    g.addColorStop(1, css(hex('#ffb98a'), 0.3 * urban * night));
    ctx.fillStyle = g;
    ctx.fillRect(0, horizonY - 260 * unit, width, 260 * unit);
  }

  // 2. Stars, through the app's visibility model.
  const named: { name: string; x: number; y: number }[] = [];
  if (layers.stars) {
    const stars: Star[] = sky.stars.filter((s) => s.altitude > 0 && s.magnitude < 5.2).slice(0, 900);
    for (const star of stars) {
      const share = starVisibilityFactors(star, sky, weather, snapshot.skyBrightness).combined;
      if (share < 0.06) continue;
      const p = toCanvas(star.altitude, star.azimuth);
      if (!inView(p)) continue;
      const tint = starTint(star.colorIndex);
      const a = Math.min(1, 0.3 + share * 0.7);
      const r = Math.max(1.1, (5.2 - star.magnitude) * 1.25) * unit;
      if (star.magnitude < 1.6) {
        glowAt(ctx, p.x, p.y, r * 7, tint, 0.3 * a);
        ctx.fillStyle = css(tint, a);
        twinkle(ctx, p.x, p.y, r * 4.2, 0.1);
        ctx.fillStyle = css(hex('#ffffff'), a);
        twinkle(ctx, p.x, p.y, r * 1.6, 0.35);
      } else if (star.magnitude < 3) {
        glowAt(ctx, p.x, p.y, r * 4, tint, 0.22 * a);
        ctx.fillStyle = css(tint, a);
        twinkle(ctx, p.x, p.y, r * 2.2, 0.28);
      } else {
        ctx.fillStyle = css(tint, a * 0.85);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.55, 0, TAU);
        ctx.fill();
      }
      if (layers.labels && star.magnitude < 1.3 && star.name)
        named.push({ name: text.object({ ...star, kind: 'star' }), x: p.x, y: p.y + r * 4.6 });
    }
  }

  // 3. Line patterns as soft chalk dots, faded by twilight and weather as the renderer fades them.
  const linesShare = twilightVisibility(sky.sunAltitude) * weatherVisibility(weather);
  if (layers.lines && linesShare > 0.01) {
    const byId = new Map(sky.stars.map((s) => [s.id, s]));
    ctx.strokeStyle = css(hex('#cfe0ff'), 0.6 * linesShare);
    ctx.lineWidth = 2.6 * unit;
    ctx.lineCap = 'round';
    ctx.setLineDash([0.1, 9 * unit]);
    for (const pattern of CONSTELLATIONS) {
      let shown = false;
      for (const [a, b] of pattern.lines) {
        const sa = byId.get(a),
          sb = byId.get(b);
        if (!sa || !sb || sa.altitude <= 0 || sb.altitude <= 0) continue;
        const pa = toCanvas(sa.altitude, sa.azimuth),
          pb = toCanvas(sb.altitude, sb.azimuth);
        if (!pa.front || !pb.front) continue;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
        shown ||= inView(pa, 0) || inView(pb, 0);
      }
      if (shown && layers.labels) {
        const stars = pattern.lines.flat().map((id) => byId.get(id)!);
        const lowest = stars.reduce((a, b) => (a.altitude < b.altitude ? a : b));
        const p = toCanvas(lowest.altitude, lowest.azimuth);
        named.push({ name: text.pattern(pattern.id), x: p.x, y: p.y + 18 * unit });
      }
    }
    ctx.setLineDash([]);
  }

  // 4. The Sun: a warm disc in soft painted rings.
  if (sky.sun.visible) {
    const p = toCanvas(sky.sun.altitude, sky.sun.azimuth);
    if (inView(p, 120)) {
      const r = 30 * unit;
      glowAt(ctx, p.x, p.y, r * 7, hex('#fff1c2'), 0.5 * (1 - cover * 0.5));
      glowAt(ctx, p.x, p.y, r * 2.4, hex('#ffe9a8'), 0.6);
      const disc = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
      disc.addColorStop(0, '#fffbe6');
      disc.addColorStop(1, sky.sunAltitude < 6 ? '#ffb46a' : '#ffe08a');
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
      if (layers.labels)
        named.push({
          name: text.object({ ...sky.sun, id: 'sun', name: 'Sun', kind: 'sun' }),
          x: p.x,
          y: p.y + r * 1.8,
        });
    }
  }

  // 5. Planets: small glowing pastel worlds where the app would draw them.
  for (const planet of sky.planets) {
    if (!planet.visible) continue;
    const share = planetVisibilityFactors(planet, sky, weather, snapshot.skyBrightness).combined;
    if (share < 0.15) continue;
    const p = toCanvas(planet.altitude, planet.azimuth);
    if (!inView(p)) continue;
    const r = (planet.magnitude < -2 ? 11 : 8.5) * unit;
    const [fill, shade] = PLANET_FILL[planet.id];
    glowAt(ctx, p.x, p.y, r * 4.5, hex(fill), 0.4 * share);
    if (planet.id === 'venus') {
      ctx.fillStyle = css(hex('#ffffff'), 0.8 * share);
      twinkle(ctx, p.x, p.y, r * 3.4, 0.09);
    }
    const ring = (from: number, to: number) => {
      ctx.strokeStyle = css(hex('#f8e6b0'), 0.92);
      ctx.lineWidth = 2.6 * unit;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 2.1, r * 0.72, -0.35, from, to);
      ctx.stroke();
    };
    if (planet.id === 'saturn') ring(Math.PI, TAU);
    const ball = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
    ball.addColorStop(0, '#fffdf4');
    ball.addColorStop(0.5, fill);
    ball.addColorStop(1, shade);
    ctx.fillStyle = ball;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
    if (planet.id === 'jupiter') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.clip();
      ctx.fillStyle = 'rgba(176,120,80,.45)';
      ctx.fillRect(p.x - r, p.y - r * 0.35, r * 2, r * 0.18);
      ctx.fillRect(p.x - r, p.y + r * 0.15, r * 2, r * 0.16);
      ctx.restore();
    }
    if (planet.id === 'saturn') ring(0, Math.PI);
    if (layers.labels)
      named.push({ name: text.object({ ...planet, kind: 'planet' }), x: p.x, y: p.y + r * 2.6 });
  }

  // 6. The Moon, larger than life, in its true phase and orientation.
  if (sky.moon.visible) {
    const p = toCanvas(sky.moon.altitude, sky.moon.azimuth);
    if (inView(p, 120)) {
      const r = 42 * unit;
      paintMoon(ctx, p.x, p.y, r, sky.moon.illumination, sky.moon.brightLimbAngle, day);
      if (layers.labels)
        named.push({
          name: text.object({ ...sky.moon, id: 'moon', name: 'Moon', kind: 'moon' }),
          x: p.x,
          y: p.y + r * 1.45,
        });
    }
  }

  // 7. Clouds: cirrus high, altocumulus in the middle, cumulus and stratus low, as many as each
  // layer's cover, placed across the view (their shapes and places are illustrative).
  const random = seededRandom(seed);
  const low = clamp01(weather.cloudLow / 100),
    mid = clamp01(weather.cloudMid / 100),
    high = clamp01(weather.cloudHigh / 100);
  // Custom weather may give only the total; treat it as low cloud.
  const lowShare = low + mid + high > 0.01 ? low : cover;
  const halfWidth = (Math.atan(Math.tan((view.fov * Math.PI) / 360) * snapshot.aspect) * 180) / Math.PI;
  const scatter = (
    count: number,
    minAlt: number,
    maxAlt: number,
    draw: (x: number, y: number, s: number) => void,
  ) => {
    for (let i = 0; i < count; i++) {
      const az = view.heading + (random() - 0.5) * 2.2 * halfWidth;
      const alt = minAlt + random() * (maxAlt - minAlt);
      const p = toCanvas(alt, az);
      // Lower clouds are farther away, so smaller.
      if (inView(p, 300 * unit)) draw(p.x, p.y, (0.5 + alt / 26) * unit);
    }
  };
  scatter(Math.round(high * 7), 28, 75, (x, y, s) => cirrus(ctx, x, y, 460 * s, palette, random));
  scatter(Math.round(mid * 6), 14, 40, (x, y, s) => puffField(ctx, x, y, 60 * s, palette, random));
  scatter(Math.round(lowShare * 7), 1.2, 7, (x, y) =>
    stratus(ctx, x, y, (260 + random() * 420) * unit, palette, random, unit),
  );
  scatter(Math.round(lowShare * 9), 3, 20, (x, y, s) =>
    cumulus(
      ctx,
      x,
      y,
      120 * s,
      palette,
      light,
      random,
      0.84 + 0.14 * cover,
      random() < 0.3 + lowShare * 0.4 ? 3 : random() < 0.5 ? 2 : 1,
    ),
  );

  // 8. The landscape, painted in depth: the far horizon (the chosen variant), then nearer hills
  // lying below the horizon line, with a tree and a house on the nearest crest.
  if (horizonY < height + 40 * unit) {
    const left = view.heading - 100,
      right = view.heading + 100;
    const edge = (altitude: (az: number) => number, step: number) => {
      const points: Point[] = [];
      for (let az = left; az <= right; az += step) {
        const p = toCanvas(altitude(az), az);
        if (p.front) points.push(p);
      }
      return points;
    };
    const fillBelow = (points: Point[], fill: string | CanvasGradient) => {
      if (points.length < 2) return;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(points[0].x, height + 10);
      for (const p of points) ctx.lineTo(p.x, p.y);
      ctx.lineTo(points[points.length - 1].x, height + 10);
      ctx.closePath();
      ctx.fill();
    };
    const crest = (points: Point[], alpha: number, w: number) => {
      if (points.length < 2) return;
      ctx.strokeStyle = css(rim, alpha);
      ctx.lineWidth = w;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    };
    const far = mix(palette.landFar, palette.horizon, 0.3);
    if (horizon === 'sea')
      paintSea(
        ctx,
        width,
        height,
        horizonY,
        unit,
        palette,
        sky,
        view,
        toCanvas,
        night,
        seed,
        edge,
        fillBelow,
      );
    else {
      if (horizon === 'city')
        drawTown(ctx, toCanvas, left, right, far, night, urban, unit, seed, width, height);
      else {
        const farEdge = edge((az) => horizonAltitude(horizon, az), HORIZON_STEP[horizon] / 5);
        const g = ctx.createLinearGradient(0, horizonY - 30 * unit, 0, horizonY + 40 * unit);
        g.addColorStop(0, css(mix(far, palette.horizon, 0.15)));
        g.addColorStop(1, css(far));
        fillBelow(farEdge, g);
        crest(farEdge, 0.25 + 0.2 * (1 - day), 1.6 * unit);
      }
      // Nearer rolling hills, below the horizon line, with mist in the valleys between them:
      // darker, warmer and more textured as they come closer.
      const n1 = noise1(seed + 11),
        n2 = noise1(seed + 23),
        n3 = noise1(seed + 37);
      const brush = seededRandom(seed + 71);
      const hazeColour = mix(palette.horizon, palette.glow, 0.25);
      const hills = [
        edge((az) => -0.5 - 1.4 * n1(az / 9) - 0.5 * n1(az / 3), 0.5),
        edge((az) => -2.6 - 2.6 * n2(az / 13) - 0.7 * n2(az / 4), 0.5),
        edge((az) => -9 - 5 * n3(az / 18) - 1.2 * n3(az / 5), 0.5),
      ];
      const tones: [Rgb, Rgb][] = [
        [mix(far, palette.landNear, 0.3), mix(far, palette.landNear, 0.5)],
        [mix(palette.landFar, palette.landNear, 0.75), mix(palette.landNear, [6, 10, 18], 0.15)],
        [mix(palette.landNear, [10, 14, 20], 0.35), mix(palette.landNear, [4, 6, 12], 0.6)],
      ];
      hills.forEach((points, i) => {
        if (points.length < 2) return;
        const crestY = points.reduce((m, p) => Math.min(m, p.y), Infinity);
        mist(ctx, crestY + 6 * unit, width, hazeColour, 0.32 - i * 0.08, (70 - i * 15) * unit);
        landLayer(
          ctx,
          points,
          width,
          height,
          tones[i][0],
          tones[i][1],
          rim,
          0.3 - i * 0.07 + 0.15 * (1 - day),
          unit,
          brush,
        );
      });
      const [, homeHill, foreground] = hills;
      // Long grass along the foreground crest.
      const grass = seededRandom(seed + 31);
      ctx.lineCap = 'round';
      for (let i = 0; i < foreground.length; i++) {
        const p = foreground[i];
        for (let k = 0; k < 2; k++) {
          const h = (8 + grass() * 22) * unit;
          ctx.strokeStyle = css(
            grass() < 0.25 ? mix(tones[2][0], rim, 0.25) : mix(tones[2][0], [0, 0, 0], 0.2),
            0.7,
          );
          ctx.lineWidth = (1 + grass() * 1.6) * unit;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y + 4 * unit);
          ctx.quadraticCurveTo(
            p.x + (grass() - 0.5) * 6 * unit,
            p.y - h * 0.5,
            p.x + (grass() - 0.5) * 14 * unit,
            p.y - h,
          );
          ctx.stroke();
        }
      }
      // Wildflowers on the foreground by day.
      if (day > 0.5) {
        const flowers = seededRandom(seed + 33);
        for (let i = 0; i < foreground.length; i += 3) {
          const p = foreground[i];
          if (flowers() > 0.45) continue;
          const y = p.y + (6 + flowers() * 70) * unit;
          ctx.fillStyle = css(
            ([hex('#fff8e8'), hex('#ffe17a'), hex('#f6b6c8')] as Rgb[])[Math.floor(flowers() * 3)],
            0.85 * day,
          );
          ctx.beginPath();
          ctx.arc(p.x + (flowers() - 0.5) * 10 * unit, y, (1.6 + flowers() * 1.8) * unit, 0, TAU);
          ctx.fill();
        }
      }
      // A little house far off on the middle hill, and a big tree near at hand on the foreground,
      // each only where it stays below the horizon line.
      const at = (points: Point[], fraction: number) =>
        points.reduce((best, p) =>
          Math.abs(p.x - width * fraction) < Math.abs(best.x - width * fraction) ? p : best,
        );
      const side = seededRandom(seed + 41)() < 0.5 ? 0.13 : 0.86;
      if (homeHill.length > 2) {
        const home = at(homeHill, side < 0.5 ? 0.34 : 0.64);
        const homeRoom = home.y - horizonY - 6 * unit;
        if (homeRoom > 24 * unit && home.x > 0 && home.x < width) {
          const hh = Math.min(homeRoom, 46 * unit);
          const glow = clamp01(1 - day * 1.3);
          house(
            ctx,
            home.x,
            home.y + 3 * unit,
            hh,
            mix(tones[1][0], hex('#efe2c6'), 0.3 + 0.45 * day),
            mix(hex('#9a4038'), tones[1][1], 0.35 + 0.35 * (1 - day)),
            glow,
          );
          // A thread of chimney smoke drifting with the wind.
          const cx = home.x + hh * 0.3,
            cy = home.y - hh * 0.98;
          if (glow > 0.3 && cy - hh > horizonY) {
            ctx.strokeStyle = css(palette.cloudLight, 0.25);
            ctx.lineWidth = 2.6 * unit;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.bezierCurveTo(
              cx + 6 * unit,
              cy - hh * 0.4,
              cx - 8 * unit,
              cy - hh * 0.6,
              cx + 10 * unit,
              cy - hh,
            );
            ctx.stroke();
          }
        }
      }
      if (foreground.length > 2) {
        const spot = at(foreground, side);
        const room = spot.y - horizonY - 6 * unit;
        if (room > 60 * unit && spot.x > -40 && spot.x < width + 40)
          tree(
            ctx,
            spot.x,
            spot.y + 6 * unit,
            Math.min(room, 260 * unit),
            tones[2][0],
            rim,
            light,
            seededRandom(seed + 43),
          );
      }
    }
  }

  for (const { name, x, y } of named)
    if (inView({ x, y, front: true }, 0)) label(ctx, name, x, y, 21 * unit, font);
}

/** Sea to the horizon: brushed swell, a path of light under the Moon or a low Sun, a far boat. */
function paintSea(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  horizonY: number,
  unit: number,
  palette: Palette,
  sky: MomentSnapshot['sky'],
  view: MomentSnapshot['view'],
  toCanvas: ToCanvas,
  night: number,
  seed: number,
  edge: (altitude: (az: number) => number, step: number) => Point[],
  fillBelow: (points: Point[], fill: string | CanvasGradient) => void,
) {
  const water = ctx.createLinearGradient(0, horizonY, 0, height);
  water.addColorStop(0, css(mix(palette.horizon, palette.landFar, 0.45)));
  water.addColorStop(1, css(mix(palette.landNear, hex('#0a2a4a'), 0.5)));
  fillBelow(
    edge(() => 0, 5),
    water,
  );
  const waves = seededRandom(seed + 3);
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const t = waves();
    const y = horizonY + 4 * unit + t * t * (height - horizonY);
    const w = (20 + t * 140) * unit;
    ctx.strokeStyle = css(mix(palette.horizon, palette.cloudLight, 0.5), 0.12 + 0.12 * waves());
    ctx.lineWidth = (1 + t * 3) * unit;
    const x = waves() * width;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x, y - 3 * unit * (1 + t), x + w / 2, y);
    ctx.stroke();
  }
  const source = sky.moon.visible ? sky.moon : sky.sun.visible ? sky.sun : null;
  if (source) {
    const s = toCanvas(source.altitude, source.azimuth);
    if (s.front && s.x > -100 && s.x < width + 100) {
      const brightness = source === sky.moon ? 0.35 + 0.55 * sky.moon.illumination : 0.8;
      const glitter = seededRandom(seed + 5);
      ctx.fillStyle = css(hex('#fff2c8'), brightness);
      for (let y = horizonY + 3 * unit, i = 0; y < height; y += (5 + i * 0.6) * unit, i++) {
        const spread = (6 + i * 3.2) * unit;
        for (let k = 0; k < 3; k++) {
          const w = (8 + glitter() * 26 + i * 1.5) * unit;
          ctx.globalAlpha = 0.25 + glitter() * 0.6;
          ctx.fillRect(s.x + (glitter() - 0.5) * spread * 2 - w / 2, y, w, (1.6 + i * 0.12) * unit);
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  // A small sailing boat far out, its mast under 1° of altitude, with a lantern at night.
  const boatAz = view.heading + (seededRandom(seed + 9)() - 0.5) * view.fov * 0.8;
  const b = toCanvas(0, boatAz),
    mast = toCanvas(0.9, boatAz);
  if (b.front && b.x > 40 && b.x < width - 40) {
    const s = Math.max(4, b.y - mast.y);
    ctx.fillStyle = css(mix(palette.landNear, [0, 0, 0], 0.3));
    ctx.beginPath();
    ctx.moveTo(b.x - s * 0.7, b.y - s * 0.12);
    ctx.lineTo(b.x + s * 0.7, b.y - s * 0.12);
    ctx.lineTo(b.x + s * 0.5, b.y + s * 0.05);
    ctx.lineTo(b.x - s * 0.5, b.y + s * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b.x - s * 0.05, b.y - s * 0.12);
    ctx.lineTo(b.x - s * 0.05, b.y - s);
    ctx.lineTo(b.x + s * 0.45, b.y - s * 0.2);
    ctx.closePath();
    ctx.fill();
    if (night > 0.3) glowAt(ctx, b.x + s * 0.5, b.y - s * 0.25, s * 0.9, hex('#ffcf7a'), 0.8 * night);
  }
}

/** A picture-book town on the horizon: pitched roofs, the odd clock tower, warm windows. */
function drawTown(
  ctx: CanvasRenderingContext2D,
  toCanvas: ToCanvas,
  left: number,
  right: number,
  far: Rgb,
  night: number,
  urban: number,
  unit: number,
  seed: number,
  width: number,
  height: number,
) {
  const random = seededRandom(seed + 51);
  const windows = seededRandom(seed + 53);
  const shades = [far, mix(far, [0, 0, 0], 0.12), mix(far, [255, 255, 255], 0.06)];
  const ground = toCanvas(0, (left + right) / 2);
  ctx.fillStyle = css(shades[1]);
  ctx.fillRect(0, ground.y, width, height - ground.y + 10);
  for (let az = left; az < right; ) {
    const w = 0.8 + random() * 1.1;
    const tower = random() < 0.06;
    const wall = tower ? 1.5 : 0.35 + random() * 0.55;
    const roof = Math.min(1.95, tower ? 1.95 : wall + 0.18 + random() * 0.3);
    const shade = shades[Math.floor(random() * shades.length)];
    const a = toCanvas(0, az),
      b = toCanvas(0, az + w);
    if (a.front && b.front && b.x > -50 && a.x < width + 50) {
      const wa = toCanvas(wall, az),
        wb = toCanvas(wall, az + w),
        peak = toCanvas(roof, az + w / 2);
      ctx.fillStyle = css(shade);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + 2 * unit);
      ctx.lineTo(wa.x, wa.y);
      ctx.lineTo(peak.x, peak.y);
      ctx.lineTo(wb.x, wb.y);
      ctx.lineTo(b.x, b.y + 2 * unit);
      ctx.closePath();
      ctx.fill();
      if (night > 0.2) {
        const step = (wb.x - wa.x) / 4;
        for (let i = 1; i < 4; i++)
          if (windows() < 0.25 + 0.5 * urban) {
            const x = wa.x + step * i,
              y = wa.y + (a.y - wa.y) * (0.35 + windows() * 0.3);
            ctx.fillStyle = css(hex('#ffd27f'), 0.9 * night);
            ctx.fillRect(x - 1.6 * unit, y - 2 * unit, 3.2 * unit, 3.6 * unit);
          }
      }
    }
    az += w;
  }
}
