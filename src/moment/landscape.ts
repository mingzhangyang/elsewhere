import type { MomentSnapshot } from '../lib/moment';
import { seededRandom } from '../lib/random';
import {
  HORIZON_STEP,
  ISLAND_TOP,
  MAST_TOP,
  TOWN_TOP,
  horizonAltitude,
  type HorizonVariant,
} from './scenery';
import {
  type Palette,
  type Point,
  type Rgb,
  TAU,
  blade,
  blob,
  clamp01,
  css,
  deepen,
  glowAt,
  hex,
  lerp,
  mark,
  mix,
  noise1,
} from './paint';

/**
 * The land under the illustrated sky. Above the horizon line there is only the chosen horizon
 * variant, under 2° of altitude (scenery.ts). Everything taller (hills, trees, houses, people)
 * is painted on ground below the horizon line and clipped to it, so nothing the app reports as
 * visible is ever hidden. All of it is illustrative.
 */

type ToCanvas = (altitude: number, azimuth: number) => { x: number; y: number; front: boolean };

export interface LandScene {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  unit: number;
  horizonY: number;
  palette: Palette;
  toCanvas: ToCanvas;
  view: MomentSnapshot['view'];
  sky: MomentSnapshot['sky'];
  /** 0 at night to 1 by day. */
  day: number;
  /** 1 in full night, 0 from dusk on. */
  night: number;
  /** The visitor's light-pollution setting, 0 to 1. */
  urban: number;
  seed: number;
  /** Which side the light comes from, −1 (left) to 1 (right). */
  lightX: number;
  /** How strongly the land is lit: full by day, moonlight at night, little under a dark sky. */
  lightStrength: number;
  /** Half the horizontal field of view, in degrees. */
  halfWidth: number;
  horizon: HorizonVariant;
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

interface LayerTone {
  crest: Rgb;
  body: Rgb;
  light: Rgb;
  shade: Rgb;
  /** Depth of the crest-to-body gradient and of the light along the slopes, in pixels. */
  depth: number;
  lightAlpha: number;
  /** Brush marks across the layer. */
  marks: number;
}

/**
 * One layer of land painted like gouache: the body, broad light on the slopes that face the light
 * and shade on those that turn away, loose brush marks that follow the ground, and a broken line
 * of light where a crest catches it.
 */
function landLayer(scene: LandScene, points: Point[], tone: LayerTone, random: () => number) {
  const { ctx, width, height, unit, lightX } = scene;
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
  const g = ctx.createLinearGradient(0, top, 0, top + tone.depth * 2.4);
  g.addColorStop(0, css(tone.crest));
  g.addColorStop(1, css(tone.body));
  ctx.fillStyle = g;
  path();
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  // Slopes: ground that falls away toward the light is lit, ground that falls the other way is
  // shaded. Each stretch of the crest gets its own strength, so the light swells and fades along it.
  const slopeAt = (i: number) => {
    const a = points[Math.max(0, i - 2)],
      b = points[Math.min(points.length - 1, i + 3)];
    return ((b.y - a.y) / Math.max(1, b.x - a.x)) * lightX;
  };
  const facing = (i: number) => clamp01((slopeAt(i) + 0.03) * 4.5);
  const away = (i: number) => clamp01((-slopeAt(i) - 0.03) * 4.5);
  for (const [pick, colour, alpha] of [
    [away, tone.shade, 0.5],
    [facing, tone.light, tone.lightAlpha],
  ] as [typeof facing, Rgb, number][])
    for (const [reach, share] of [
      [3.2, 0.3],
      [1.5, 0.4],
      [0.6, 0.45],
    ]) {
      const drop = tone.depth * reach;
      // Laid in four thin glazes: each covers the stretches at least that strongly turned.
      const LEVELS = 4;
      ctx.fillStyle = css(colour, (alpha * share) / LEVELS);
      for (let level = 1; level <= LEVELS; level++) {
        const threshold = (level - 0.5) / LEVELS;
        ctx.beginPath();
        for (let i = 0; i < points.length - 1; i++) {
          if (pick(i) < threshold) continue;
          let end = i;
          while (end < points.length - 2 && pick(end + 1) >= threshold) end++;
          // A glaze hugs the crest and swells toward the middle of its stretch, like a brush
          // pressed down and lifted.
          const length = end + 1 - i;
          ctx.moveTo(points[i].x, points[i].y);
          for (let k = i + 1; k <= end + 1; k++) ctx.lineTo(points[k].x, points[k].y);
          for (let k = end; k > i; k--) {
            const t = (k - i) / length;
            const swell = drop * Math.min(1, Math.sin(Math.PI * t) * 1.8);
            ctx.lineTo(points[k].x - lightX * swell * 0.5, points[k].y + swell);
          }
          ctx.closePath();
          i = end;
        }
        ctx.fill();
      }
    }
  // Brush marks following the ground: lighter and darker dabs of the same paint.
  const span = Math.min(height - top, tone.depth * 9);
  for (const [colour, alpha] of [
    [mix(tone.body, tone.light, 0.55), 0.16 + 0.2 * tone.lightAlpha],
    [deepen(tone.body, 0.35), 0.22],
  ] as [Rgb, number][]) {
    ctx.fillStyle = css(colour, alpha);
    ctx.beginPath();
    for (let i = 0; i < tone.marks / 2; i++) {
      const index = Math.floor(random() * (points.length - 1));
      const a = points[index],
        b = points[index + 1];
      const t = random();
      const slope = Math.atan2(b.y - a.y, Math.max(1, b.x - a.x));
      mark(
        ctx,
        a.x + random() * (b.x - a.x),
        a.y + (4 + t * t * span) * 1,
        (14 + random() * 50 + t * 40) * unit,
        (1.5 + random() * 3.5 + t * 3) * unit,
        slope * (1 - t) + (random() - 0.5) * 0.12,
        0,
      );
    }
    ctx.fill();
  }
  ctx.restore();
  // The crest catches the light in broken touches, not as an outline.
  ctx.strokeStyle = css(tone.light, Math.min(1, tone.lightAlpha * 1.2));
  ctx.lineWidth = 1.4 * unit;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < points.length - 1; i++)
    if (facing(i) > 0.25 && random() < 0.7 && points[i].x > -20 && points[i].x < width + 20) {
      ctx.moveTo(points[i].x, points[i].y + 0.6 * unit);
      ctx.lineTo(points[i + 1].x, points[i + 1].y + 0.6 * unit);
    }
  ctx.stroke();
}

interface TreeColours {
  dark: Rgb;
  mid: Rgb;
  light: Rgb;
  bark: Rgb;
}

/** A handful of small leaf-shaped dabs around a point: what breaks a round mass into foliage. */
function leaves(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spread: number,
  size: number,
  count: number,
  random: () => number,
  ring = false,
) {
  for (let i = 0; i < count; i++) {
    const a = random() * TAU,
      d = ring ? spread * (0.82 + random() * 0.3) : spread * Math.sqrt(random()),
      s = size * (0.6 + random() * 0.8),
      turn = random() * Math.PI;
    const x = cx + Math.cos(a) * d,
      y = cy + Math.sin(a) * d * 0.92;
    ctx.moveTo(x + s * Math.cos(turn), y + s * Math.sin(turn));
    ctx.ellipse(x, y, s, s * 0.55, turn, 0, TAU);
  }
}

/**
 * A broad-leaved tree: a trunk that forks, and a crown built of leafy clumps, each painted in three
 * values (shade, body, light) with ragged leaf edges and gaps where the sky shows through.
 */
function broadleaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  c: TreeColours,
  lightX: number,
  strength: number,
  random: () => number,
) {
  const lean = (random() - 0.5) * 0.1 * h;
  const fork = { x: x + lean * 0.7, y: y - h * 0.36 };
  const clumps: [number, number, number, boolean][] = (
    [
      [-0.3, -0.58, 0.2, true],
      [0.3, -0.6, 0.2, true],
      [0.02, -0.8, 0.24, true],
      [-0.42, -0.45, 0.12, false],
      [0.43, -0.46, 0.12, false],
      [-0.19, -0.5, 0.19, false],
      [0.2, -0.5, 0.2, false],
      [-0.14, -0.72, 0.2, false],
      [0.15, -0.73, 0.19, false],
      [0, -0.9, 0.15, false],
    ] as [number, number, number, boolean][]
  ).map(([fx, fy, fr, back]) => [
    x + lean + (fx + (random() - 0.5) * 0.05) * h,
    y + (fy + (random() - 0.5) * 0.04) * h,
    fr * h * (0.9 + random() * 0.25),
    back,
  ]);
  const clump = (cx: number, cy: number, r: number, back: boolean) => {
    ctx.fillStyle = css(back ? deepen(c.dark, 0.12) : c.dark);
    ctx.beginPath();
    blob(ctx, cx, cy, r, r * 0.9, random, 0.2, 10);
    leaves(ctx, cx, cy, r, r * 0.2, 16, random, true);
    ctx.fill();
    if (back) return;
    const mx = cx + lightX * r * 0.16,
      my = cy - r * 0.2;
    ctx.fillStyle = css(mix(c.dark, c.mid, 0.4 + 0.6 * strength));
    ctx.beginPath();
    blob(ctx, mx, my, r * 0.7, r * 0.62, random, 0.24, 9);
    leaves(ctx, mx, my, r * 0.7, r * 0.17, 12, random, true);
    ctx.fill();
    const lx = cx + lightX * r * 0.36,
      ly = cy - r * 0.42;
    ctx.fillStyle = css(mix(c.mid, c.light, 0.35 + 0.65 * strength), 0.55 + 0.45 * strength);
    ctx.beginPath();
    blob(ctx, lx, ly, r * 0.36, r * 0.28, random, 0.3, 7);
    leaves(ctx, lx, ly, r * 0.5, r * 0.13, 12, random);
    ctx.fill();
  };
  for (const [cx, cy, r, back] of clumps) if (back) clump(cx, cy, r, true);
  // The trunk, flared at the foot, and branches reaching into the crown.
  ctx.fillStyle = css(c.bark);
  ctx.beginPath();
  ctx.moveTo(x - h * 0.062, y + h * 0.01);
  ctx.quadraticCurveTo(x - h * 0.028, y - h * 0.08, fork.x - h * 0.026, fork.y);
  ctx.lineTo(fork.x + h * 0.026, fork.y);
  ctx.quadraticCurveTo(x + h * 0.03, y - h * 0.08, x + h * 0.066, y + h * 0.01);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = css(c.bark);
  ctx.lineCap = 'round';
  for (const [cx, cy, r] of [clumps[0], clumps[1], clumps[2], clumps[5], clumps[6]]) {
    ctx.lineWidth = h * 0.022;
    ctx.beginPath();
    ctx.moveTo(fork.x, fork.y + h * 0.02);
    ctx.quadraticCurveTo(lerp(fork.x, cx, 0.3), lerp(fork.y, cy, 0.75), cx, cy + r * 0.3);
    ctx.stroke();
  }
  // Light catching one side of the trunk.
  ctx.strokeStyle = css(mix(c.bark, c.light, 0.5), 0.5 * strength);
  ctx.lineWidth = h * 0.012;
  ctx.beginPath();
  ctx.moveTo(x + lightX * h * 0.03, y - h * 0.04);
  ctx.quadraticCurveTo(x + lightX * h * 0.018, y - h * 0.2, fork.x + lightX * h * 0.014, fork.y);
  ctx.stroke();
  for (const [cx, cy, r, back] of clumps) if (!back) clump(cx, cy, r, false);
}

/** A conifer: drooping tiers that narrow to a point, lit along one side. */
function conifer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  c: TreeColours,
  lightX: number,
  strength: number,
  random: () => number,
) {
  ctx.fillStyle = css(c.bark);
  ctx.fillRect(x - h * 0.02, y - h * 0.14, h * 0.04, h * 0.15);
  const tiers = 6;
  for (const lit of [false, true]) {
    ctx.fillStyle = lit ? css(mix(c.mid, c.light, 0.3 + 0.5 * strength), 0.4 + 0.5 * strength) : css(c.dark);
    ctx.beginPath();
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const ty = y - h * (0.08 + 0.9 * t),
        w = h * 0.2 * (1 - t * 0.82) * (0.9 + random() * 0.25),
        apex = ty - h * 0.26 * (1 - t * 0.4);
      if (lit) {
        ctx.moveTo(x + lightX * w * 0.1, apex + h * 0.03);
        ctx.quadraticCurveTo(x + lightX * w * 0.6, ty - h * 0.03, x + lightX * w * 0.95, ty + h * 0.015);
        ctx.quadraticCurveTo(x + lightX * w * 0.5, ty - h * 0.005, x + lightX * w * 0.2, ty - h * 0.01);
        ctx.closePath();
      } else {
        ctx.moveTo(x, apex);
        ctx.quadraticCurveTo(x + w * 0.5, ty - h * 0.05, x + w, ty + h * 0.025);
        ctx.quadraticCurveTo(x + w * 0.4, ty - h * 0.005, x, ty + h * 0.01);
        ctx.quadraticCurveTo(x - w * 0.4, ty - h * 0.005, x - w, ty + h * 0.025);
        ctx.quadraticCurveTo(x - w * 0.5, ty - h * 0.05, x, apex);
      }
    }
    ctx.fill();
  }
}

interface HouseColours {
  wall: Rgb;
  roof: Rgb;
  trim: Rgb;
}

/**
 * A cottage seen side-on: a long wall under a pitched roof with a chimney. Its windows glow warm
 * once the light fades (`glow` 0 to 1).
 */
function cottage(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  c: HouseColours,
  glow: number,
  lightX: number,
  gable: boolean,
) {
  const w = h * (gable ? 0.95 : 1.4);
  const eave = y - h * (gable ? 0.56 : 0.5);
  // The wall, lighter toward the light, shaded under the eave.
  const wall = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  wall.addColorStop(lightX > 0 ? 1 : 0, css(c.wall));
  wall.addColorStop(lightX > 0 ? 0 : 1, css(deepen(c.wall, 0.28)));
  ctx.fillStyle = wall;
  ctx.fillRect(x - w / 2, eave, w, y - eave + h * 0.03);
  ctx.fillStyle = css(deepen(c.wall, 0.45), 0.55);
  ctx.fillRect(x - w / 2, eave, w, h * 0.07);
  // Chimney, then the roof over it.
  ctx.fillStyle = css(deepen(c.roof, 0.3));
  ctx.fillRect(x + w * 0.18, y - h * 1.06, h * 0.13, h * 0.3);
  ctx.fillStyle = css(c.roof);
  ctx.beginPath();
  if (gable) {
    ctx.moveTo(x - w * 0.62, eave + h * 0.03);
    ctx.lineTo(x, y - h * 1.02);
    ctx.lineTo(x + w * 0.62, eave + h * 0.03);
  } else {
    ctx.moveTo(x - w * 0.58, eave + h * 0.03);
    ctx.lineTo(x - w * 0.4, y - h);
    ctx.lineTo(x + w * 0.4, y - h);
    ctx.lineTo(x + w * 0.58, eave + h * 0.03);
  }
  ctx.closePath();
  ctx.fill();
  // Light along the ridge and the lit pitch of the roof.
  ctx.fillStyle = css(mix(c.roof, c.trim, 0.55), 0.7);
  ctx.beginPath();
  if (gable) {
    ctx.moveTo(x, y - h * 1.02);
    ctx.lineTo(x + lightX * w * 0.62, eave + h * 0.03);
    ctx.lineTo(x + lightX * w * 0.5, eave + h * 0.03);
    ctx.lineTo(x, y - h * 0.92);
  } else {
    ctx.moveTo(x - w * 0.4, y - h);
    ctx.lineTo(x + w * 0.4, y - h);
    ctx.lineTo(x + w * 0.43, y - h * 0.92);
    ctx.lineTo(x - w * 0.43, y - h * 0.92);
  }
  ctx.closePath();
  ctx.fill();
  // Door and windows; the windows light up at dusk and spill onto the ground.
  ctx.fillStyle = css(deepen(c.roof, 0.35));
  ctx.fillRect(x - h * 0.07, y - h * 0.3, h * 0.14, h * 0.32);
  const pane = mix(mix(c.wall, hex('#7f9cc0'), 0.6), hex('#ffd98a'), glow);
  for (const side of gable ? [-0.26, 0.26] : [-0.32, 0.3]) {
    const wx = x + side * w,
      wy = y - h * 0.3;
    if (glow > 0.15) glowAt(ctx, wx, wy, h * 0.7, hex('#ffc56e'), 0.38 * glow);
    ctx.fillStyle = css(pane);
    ctx.fillRect(wx - h * 0.075, wy - h * 0.085, h * 0.15, h * 0.17);
    ctx.fillStyle = css(deepen(c.wall, 0.5), 0.7);
    ctx.fillRect(wx - h * 0.008, wy - h * 0.085, h * 0.016, h * 0.17);
  }
  if (glow > 0.15) {
    ctx.save();
    ctx.translate(x, y + h * 0.06);
    ctx.scale(1, 0.22);
    glowAt(ctx, 0, 0, w * 0.9, hex('#ffc56e'), 0.3 * glow);
    ctx.restore();
  }
}

/**
 * Two small figures seen from behind, a grown-up and a child hand in hand, looking up at the sky:
 * the people this sky is being kept for.
 */
function onlookers(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  scene: LandScene,
  towardSky: number,
) {
  const { day, palette, lightX, lightStrength } = scene;
  const dim = (colour: Rgb) => mix(deepen(palette.landNear, 0.35), colour, 0.12 + 0.88 * day);
  const person = (px: number, ph: number, coat: Rgb, hair: Rgb, lift: number) => {
    const shoulder = y - ph * 0.78,
      hem = y - ph * 0.3;
    ctx.fillStyle = css(dim(hex('#2b2f4a')));
    ctx.fillRect(px - ph * 0.085, hem - ph * 0.02, ph * 0.07, ph * 0.33);
    ctx.fillRect(px + ph * 0.015, hem - ph * 0.02, ph * 0.07, ph * 0.33);
    ctx.fillStyle = css(dim(coat));
    ctx.beginPath();
    ctx.moveTo(px - ph * 0.13, shoulder + ph * 0.03);
    ctx.quadraticCurveTo(px, shoulder - ph * 0.06, px + ph * 0.13, shoulder + ph * 0.03);
    ctx.quadraticCurveTo(px + ph * 0.19, hem - ph * 0.2, px + ph * 0.17, hem);
    ctx.quadraticCurveTo(px, hem + ph * 0.04, px - ph * 0.17, hem);
    ctx.quadraticCurveTo(px - ph * 0.19, hem - ph * 0.2, px - ph * 0.13, shoulder + ph * 0.03);
    ctx.fill();
    // The arm on the sky's side: raised to point, or lowered to hold a hand.
    ctx.strokeStyle = css(dim(coat));
    ctx.lineWidth = ph * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px + towardSky * ph * 0.12, shoulder + ph * 0.06);
    ctx.lineTo(px + towardSky * ph * (0.2 + 0.1 * lift), shoulder + ph * (0.3 - 0.52 * lift));
    ctx.stroke();
    ctx.fillStyle = css(dim(hair));
    ctx.beginPath();
    ctx.arc(px, y - ph * 0.88, ph * 0.105, 0, TAU);
    ctx.fill();
    // A touch of light down the side that faces it.
    ctx.strokeStyle = css(mix(dim(coat), palette.leafLight, 0.7), 0.25 + 0.55 * lightStrength);
    ctx.lineWidth = Math.max(1, ph * 0.025);
    ctx.beginPath();
    ctx.moveTo(px + lightX * ph * 0.14, shoulder + ph * 0.06);
    ctx.quadraticCurveTo(px + lightX * ph * 0.18, hem - ph * 0.2, px + lightX * ph * 0.16, hem - ph * 0.02);
    ctx.stroke();
  };
  // Their shadow on the grass.
  ctx.fillStyle = css(deepen(palette.landNear, 0.5), 0.3);
  ctx.beginPath();
  ctx.ellipse(x - towardSky * h * 0.1, y + h * 0.01, h * 0.42, h * 0.045, 0, 0, TAU);
  ctx.fill();
  person(x, h, hex('#c8553d'), hex('#3a2a24'), 1);
  person(x - towardSky * h * 0.36, h * 0.62, hex('#f2c14e'), hex('#2a2422'), 0);
}

/** Grass along a crest: tufts of thin tapered blades in the meadow's own colour, some catching the light. */
function grass(scene: LandScene, points: Point[], dark: Rgb, light: Rgb, random: () => number, size: number) {
  const { ctx, unit, lightStrength, lightX } = scene;
  for (const lit of [false, true]) {
    ctx.fillStyle = css(lit ? light : dark, lit ? 0.3 + 0.6 * lightStrength : 0.94);
    ctx.beginPath();
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1];
      if (random() < (lit ? 0.6 : 0.12)) continue;
      const u = random();
      const x = lerp(a.x, b.x, u),
        y = lerp(a.y, b.y, u) + 3 * unit;
      const blades = 3 + Math.floor(random() * 5);
      // Mostly short, now and then a tall tuft.
      const tall = size * (0.35 + random() * random() * random() * 2.6) * (lit ? 0.85 : 1);
      for (let k = 0; k < blades; k++)
        blade(
          ctx,
          x + (random() - 0.5) * 11 * unit,
          y,
          tall * (0.45 + random() * 0.7) * unit,
          ((random() - 0.4) * tall * 0.6 + (lit ? lightX * 2 : 0)) * unit,
          (0.7 + random() * 0.9) * unit,
        );
    }
    ctx.fill();
  }
}

/** Meadow flowers on a slope: small five-petalled blossoms on stems, larger toward the viewer. */
function flowers(
  scene: LandScene,
  crest: Point[],
  bottom: number,
  stem: Rgb,
  random: () => number,
  count: number,
) {
  const { ctx, unit, day, lightStrength } = scene;
  // In fading light the petals keep their own colour but lose their brightness: no glow.
  const fade = (colour: Rgb) => mix(deepen(scene.palette.landNear, 0.1), colour, 0.18 + 0.82 * day * day);
  const petals = [hex('#fffaf0'), hex('#ffd95e'), hex('#f7a8c4'), hex('#ff8a6a'), hex('#b9a4f0')].map(fade);
  const heart = fade(hex('#f2a23a'));
  for (let i = 0; i < count; i++) {
    const p = crest[Math.floor(random() * (crest.length - 1))];
    const depth = random();
    const y = p.y + 8 * unit + depth * depth * (bottom - p.y);
    if (y > bottom + 20 * unit) continue;
    const s = (2.4 + depth * 4.6) * unit * (0.8 + random() * 0.5);
    const x = p.x + (random() - 0.5) * 30 * unit;
    const sway = (random() - 0.5) * s * 2;
    ctx.strokeStyle = css(stem, 0.9);
    ctx.lineWidth = Math.max(1, s * 0.22);
    ctx.beginPath();
    ctx.moveTo(x, y + s * 4.2);
    ctx.quadraticCurveTo(x + sway * 0.2, y + s * 2, x + sway, y);
    ctx.stroke();
    ctx.fillStyle = css(petals[Math.floor(random() * petals.length)], 0.75 + 0.25 * lightStrength);
    ctx.beginPath();
    const turn = random() * TAU;
    for (let k = 0; k < 5; k++) {
      const a = turn + (k / 5) * TAU;
      const px = x + sway + Math.cos(a) * s * 0.8,
        py = y + Math.sin(a) * s * 0.62;
      ctx.moveTo(px + s * 0.62, py);
      ctx.ellipse(px, py, s * 0.62, s * 0.5, a, 0, TAU);
    }
    ctx.fill();
    ctx.fillStyle = css(heart);
    ctx.beginPath();
    ctx.arc(x + sway, y, s * 0.36, 0, TAU);
    ctx.fill();
  }
}

/**
 * Small trees along a crest, in loose groups: rounded crowns (or pointed firs) that overlap into
 * hedgerows, each with a lit side, standing on their own small shadows.
 */
function copse(
  scene: LandScene,
  points: Point[],
  c: TreeColours,
  size: number,
  density: number,
  pointed: boolean,
  random: () => number,
) {
  const { ctx, horizonY, unit, lightX, lightStrength } = scene;
  const stride = Math.max(1, Math.round((size * 0.55) / 8));
  let run = 0;
  for (let i = 0; i < points.length; i += stride) {
    if (run <= 0 && random() < density * stride) run = 1 + Math.floor(random() * 5);
    if (run-- <= 0) continue;
    const p = points[i];
    const tall = random() < 0.22;
    const h = Math.min(size * (0.55 + random() * 0.7) * (tall ? 1.25 : 1), p.y - horizonY - 2 * unit);
    if (h < 3 * unit) continue;
    const x = p.x + (random() - 0.5) * 5 * unit,
      y = p.y + 2 * unit;
    ctx.fillStyle = css(deepen(c.dark, 0.25), 0.3);
    ctx.beginPath();
    ctx.ellipse(x - lightX * h * 0.3, y, h * 0.6, h * 0.1, 0, 0, TAU);
    ctx.fill();
    if (pointed) {
      ctx.fillStyle = css(c.dark);
      ctx.beginPath();
      ctx.moveTo(x, y - h * 1.4);
      ctx.quadraticCurveTo(x + h * 0.12, y - h * 0.5, x + h * 0.36, y);
      ctx.lineTo(x - h * 0.36, y);
      ctx.quadraticCurveTo(x - h * 0.12, y - h * 0.5, x, y - h * 1.4);
      ctx.fill();
      ctx.fillStyle = css(mix(c.mid, c.light, 0.5), 0.3 + 0.5 * lightStrength);
      ctx.beginPath();
      ctx.moveTo(x, y - h * 1.34);
      ctx.quadraticCurveTo(x + lightX * h * 0.14, y - h * 0.5, x + lightX * h * 0.33, y - h * 0.03);
      ctx.lineTo(x + lightX * h * 0.1, y - h * 0.03);
      ctx.closePath();
      ctx.fill();
      continue;
    }
    crown(scene, x, y, h, tall, c, random);
  }
}

/** One small rounded tree: a leafy mass in shade, with its body and its light out to the edge on the lit side. */
function crown(
  scene: LandScene,
  x: number,
  y: number,
  h: number,
  tall: boolean,
  c: TreeColours,
  random: () => number,
) {
  const { ctx, lightX, lightStrength } = scene;
  const rx = h * (tall ? 0.4 : 0.56),
    ry = h * (tall ? 0.6 : 0.46);
  const cy = y - ry * 0.95;
  ctx.fillStyle = css(c.dark);
  ctx.beginPath();
  blob(ctx, x, cy, rx, ry, random, 0.24, 9);
  blob(ctx, x + (random() - 0.5) * rx, y - ry * 0.6, rx * 0.75, ry * 0.6, random, 0.2, 7);
  leaves(ctx, x, cy, rx * 0.98, h * 0.085, 9, random, true);
  ctx.fill();
  // The body reaches the outline on the side of the light, so the shade shows only below and behind.
  ctx.fillStyle = css(c.mid, 0.6 + 0.4 * lightStrength);
  ctx.beginPath();
  blob(ctx, x + lightX * rx * 0.26, cy - ry * 0.2, rx * 0.86, ry * 0.84, random, 0.24, 8);
  leaves(ctx, x + lightX * rx * 0.3, cy - ry * 0.25, rx * 0.9, h * 0.075, 7, random, true);
  ctx.fill();
  ctx.fillStyle = css(mix(c.light, c.mid, 0.3), 0.15 + 0.75 * lightStrength);
  ctx.beginPath();
  blob(ctx, x + lightX * rx * 0.46, cy - ry * 0.46, rx * 0.46, ry * 0.42, random, 0.3, 6);
  leaves(ctx, x + lightX * rx * 0.36, cy - ry * 0.4, rx * 0.7, h * 0.07, 7, random);
  ctx.fill();
}

/** Sea to the horizon: washes that mirror the sky, brushed swell, a path of light, a far boat. */
function paintSea(scene: LandScene, haze: Rgb) {
  const { ctx, width, height, horizonY, unit, palette, sky, view, toCanvas, night, day, seed } = scene;
  const deep = mix(mix(palette.landNear, hex('#0c3a66'), 0.55), palette.upper, 0.25);
  const water = ctx.createLinearGradient(0, horizonY, 0, Math.max(height, horizonY + 10));
  water.addColorStop(0, css(mix(palette.horizon, palette.landFar, 0.4)));
  water.addColorStop(0.25, css(mix(palette.lower, palette.landFar, 0.55)));
  water.addColorStop(1, css(deep));
  ctx.fillStyle = water;
  ctx.fillRect(0, horizonY, width, height - horizonY + 10);
  // Low islands far out, already half haze.
  const isles = seededRandom(seed + 7);
  const n = noise1(seed + 8);
  for (let k = 0; k < 2; k++) {
    const centre = view.heading + (isles() - 0.5) * 2 * scene.halfWidth,
      span = 6 + isles() * 12,
      tall = 0.5 + isles() * 0.7;
    ctx.fillStyle = css(mix(palette.landFar, haze, 0.45 + 0.2 * k));
    ctx.beginPath();
    let started = false;
    for (let a = -span; a <= span; a += 0.5) {
      const shape = Math.max(0, 1 - (a / span) ** 2) * (0.55 + 0.45 * n((centre + a) / 2.5));
      const p = toCanvas(Math.min(ISLAND_TOP, tall * shape), centre + a);
      if (!p.front) continue;
      if (started) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, horizonY + 1);
      ctx.lineTo(p.x, p.y);
      started = true;
    }
    const end = toCanvas(0, centre + span);
    if (end.front) ctx.lineTo(end.x, horizonY + 1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizonY, width, height - horizonY + 10);
  ctx.clip();
  mist(ctx, horizonY + 10 * unit, width, haze, 0.35, 26 * unit);
  // Swell: tapered strokes, fine and close far out, broad and loose near the viewer.
  const waves = seededRandom(seed + 3);
  const room = height - horizonY;
  for (const [colour, alpha, count] of [
    [deepen(deep, 0.3), 0.3, 90],
    [mix(palette.lower, palette.cloudLight, 0.5), 0.26, 110],
  ] as [Rgb, number, number][]) {
    ctx.fillStyle = css(colour, alpha);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const t = waves();
      const y = horizonY + 3 * unit + t * t * room;
      mark(
        ctx,
        waves() * width,
        y,
        (26 + t * 240) * unit * (0.5 + waves()),
        (0.9 + t * 4.5) * unit,
        0,
        -(1 + t * 3) * unit,
      );
    }
    ctx.fill();
  }
  // The path of light under the Moon or a low Sun: broken strokes that widen toward the viewer.
  const source =
    sky.moon.visible && night > 0.05
      ? sky.moon
      : sky.sun.visible
        ? sky.sun
        : sky.moon.visible
          ? sky.moon
          : null;
  if (source) {
    const s = toCanvas(source.altitude, source.azimuth);
    if (s.front && s.x > -100 && s.x < width + 100) {
      const moonlit = source === sky.moon;
      const brightness = moonlit ? (0.3 + 0.6 * sky.moon.illumination) * (1 - day * 0.7) : 0.9;
      const colour = moonlit ? hex('#f4f0d8') : mix(palette.glow, hex('#fff6d8'), 0.5);
      const glitter = seededRandom(seed + 5);
      ctx.save();
      ctx.translate(s.x, horizonY);
      ctx.scale(1, 2.2);
      glowAt(ctx, 0, room * 0.1, room * 0.5, colour, 0.16 * brightness);
      ctx.restore();
      for (let y = horizonY + 2 * unit, i = 0; y < height; y += (3.5 + i * 0.5) * unit, i++) {
        const t = (y - horizonY) / room;
        const spread = (10 + t * 150) * unit * (moonlit ? 0.8 : 1);
        ctx.fillStyle = css(colour, brightness * (0.85 - 0.45 * t));
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const off = (glitter() - 0.5) * 2;
          mark(
            ctx,
            s.x + off * Math.abs(off) * spread,
            y,
            (10 + glitter() * 30 + t * 90) * unit * (1 - Math.abs(off) * 0.6),
            (0.9 + t * 3.2) * unit,
            0,
            0,
          );
        }
        ctx.fill();
      }
    }
  }
  ctx.restore();
  // A small sailing boat far out, with a lantern at night.
  const boatAz = view.heading + (seededRandom(seed + 9)() - 0.5) * view.fov * 0.8;
  const b = toCanvas(0, boatAz),
    mast = toCanvas(MAST_TOP, boatAz);
  if (b.front && b.x > 40 && b.x < width - 40) {
    const s = Math.max(4, b.y - mast.y);
    ctx.fillStyle = css(deepen(palette.landNear, 0.3));
    ctx.beginPath();
    ctx.moveTo(b.x - s * 0.7, b.y - s * 0.1);
    ctx.lineTo(b.x + s * 0.7, b.y - s * 0.1);
    ctx.lineTo(b.x + s * 0.5, b.y + s * 0.06);
    ctx.lineTo(b.x - s * 0.5, b.y + s * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = css(mix(hex('#d8704a'), deepen(palette.landFar, 0.2), 0.15 + 0.6 * (1 - day)));
    ctx.beginPath();
    ctx.moveTo(b.x - s * 0.05, b.y - s * 0.14);
    ctx.lineTo(b.x - s * 0.05, b.y - s);
    ctx.quadraticCurveTo(b.x + s * 0.4, b.y - s * 0.55, b.x + s * 0.48, b.y - s * 0.18);
    ctx.closePath();
    ctx.fill();
    if (night > 0.3) glowAt(ctx, b.x + s * 0.5, b.y - s * 0.25, s * 0.9, hex('#ffcf7a'), 0.8 * night);
  }
}

/** A picture-book town on the horizon, under 2°: pitched roofs, the odd tower, warm windows. */
function farTown(scene: LandScene, left: number, right: number, far: Rgb) {
  const { ctx, toCanvas, night, urban, unit, seed, width, lightX, palette, lightStrength } = scene;
  const random = seededRandom(seed + 51);
  const windows = seededRandom(seed + 53);
  const shades = [far, deepen(far, 0.14), mix(far, palette.horizon, 0.18)];
  for (let az = left; az < right; ) {
    const w = 0.8 + random() * 1.1;
    const tower = random() < 0.07;
    const wall = tower ? TOWN_TOP - 0.5 : 0.35 + random() * 0.55;
    const roof = Math.min(TOWN_TOP, tower ? TOWN_TOP : wall + 0.18 + random() * 0.3);
    const shade = shades[Math.floor(random() * shades.length)];
    const a = toCanvas(0, az),
      b = toCanvas(0, az + w);
    if (a.front && b.front && b.x > -50 && a.x < width + 50) {
      const inset = tower ? w * 0.3 : 0;
      const wa = toCanvas(wall, az + inset),
        wb = toCanvas(wall, az + w - inset),
        peak = toCanvas(roof, az + w / 2);
      ctx.fillStyle = css(shade);
      ctx.beginPath();
      ctx.moveTo(wa.x, a.y + 2 * unit);
      ctx.lineTo(wa.x, wa.y);
      ctx.lineTo(peak.x, peak.y);
      ctx.lineTo(wb.x, wb.y);
      ctx.lineTo(wb.x, b.y + 2 * unit);
      ctx.closePath();
      ctx.fill();
      // The roof pitch that faces the light.
      ctx.fillStyle = css(mix(shade, palette.landLight, 0.5), 0.25 + 0.45 * lightStrength);
      ctx.beginPath();
      ctx.moveTo(peak.x, peak.y);
      ctx.lineTo(lightX > 0 ? wb.x : wa.x, wa.y);
      ctx.lineTo(peak.x, wa.y);
      ctx.closePath();
      ctx.fill();
      if (night > 0.2) {
        const step = (wb.x - wa.x) / 4;
        for (let i = 1; i < 4; i++)
          if (windows() < 0.3 + 0.5 * urban) {
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

/** Rows of small houses and garden trees stepping down a slope below the horizon line. */
function hillTown(
  scene: LandScene,
  crest: Point[],
  rows: number,
  size: number,
  trees: TreeColours,
  random: () => number,
  distance: number,
) {
  const { ctx, unit, horizonY, day, night, urban, lightX, palette } = scene;
  const walls = [hex('#f4e8cf'), hex('#ecdcc0'), hex('#e6e2d6')];
  const roofs = [hex('#b85a40'), hex('#a8503e'), hex('#c06a48'), hex('#66708e'), hex('#b85a40')];
  // Daylight colours sink into the dusk, and into the haze with distance.
  const shadeOf = (colour: Rgb) =>
    mix(mix(deepen(palette.landMid, 0.25), colour, 0.16 + 0.84 * day), palette.landFar, distance);
  for (let row = 0; row < rows; row++) {
    const scale = size * (1 + row * 0.32);
    for (let i = Math.floor(random() * 3); i < crest.length; i += 1 + Math.floor(random() * 3)) {
      const p = crest[i];
      const y = p.y + (4 + row * 1.25 * size) * unit;
      const h = Math.min(scale * (0.8 + random() * 0.5) * unit, y - horizonY - 3 * unit);
      if (h < 5 * unit) {
        random();
        continue;
      }
      if (random() < 0.34) {
        crown(scene, p.x, y, h * 1.15, random() < 0.25, trees, random);
        continue;
      }
      const lit = random() < 0.35 + 0.45 * urban;
      cottage(
        ctx,
        p.x,
        y,
        h,
        {
          wall: shadeOf(walls[Math.floor(random() * walls.length)]),
          roof: shadeOf(roofs[Math.floor(random() * roofs.length)]),
          trim: mix(palette.landLight, palette.cloudLight, 0.5),
        },
        lit ? clamp01(night * 1.4 + (1 - day) * 0.5) : 0,
        lightX,
        random() < 0.5,
      );
    }
  }
}

export function paintLandscape(scene: LandScene) {
  const { ctx, width, height, unit, horizonY, palette, toCanvas, view, day, night, urban, seed, horizon } =
    scene;
  if (horizonY > height + 40 * unit) return;
  const { lightX, lightStrength } = scene;
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
  const haze = mix(palette.horizon, palette.glow, 0.25);
  const far = mix(palette.landFar, palette.horizon, 0.32);
  const brush = seededRandom(seed + 71);
  const light = mix(palette.landLight, palette.glow, 0.15);

  // The horizon variant itself: the only scenery above the horizon line, under 2°.
  if (horizon === 'sea') paintSea(scene, haze);
  else if (horizon === 'city') {
    ctx.fillStyle = css(deepen(far, 0.12));
    ctx.fillRect(0, horizonY, width, height - horizonY + 10);
    if (night > 0.2) washAtHorizon(scene, hex('#ffbe8c'), 0.22 * night * (0.4 + 0.6 * urban), 70 * unit);
    farTown(scene, left, right, far);
  } else {
    const farEdge = edge((az) => horizonAltitude(horizon, az), HORIZON_STEP[horizon] / 5);
    landLayer(
      scene,
      farEdge,
      {
        crest: mix(far, palette.horizon, horizon === 'mountains' ? 0 : 0.12),
        body: mix(far, haze, 0.35),
        light: horizon === 'mountains' ? mix(light, palette.cloudLight, 0.6) : mix(light, haze, 0.4),
        shade: deepen(far, 0.25),
        depth: (horizon === 'mountains' ? 9 : 12) * unit,
        lightAlpha: (horizon === 'mountains' ? 0.75 : 0.4) * lightStrength,
        marks: 30,
      },
      brush,
    );
  }

  // Everything else stands on ground below the horizon line.
  const ground = height - horizonY;
  if (ground < 14 * unit) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizonY + 1, width, ground + 10);
  ctx.clip();
  const reach = Math.min(ground, 640 * unit);
  // Azimuth across the canvas, near enough for placing illustrative ground.
  const azAt = (x: number) => view.heading + (x / width - 0.5) * 2 * scene.halfWidth;
  const crestLine = (base: number, swing: number, noise: (x: number) => number, scale: number) => {
    const points: Point[] = [];
    for (let x = -24; x <= width + 24; x += 8) {
      const az = azAt(x);
      points.push({
        x,
        y: horizonY + reach * (base + swing * (noise(az / scale) * 0.75 + noise(az / (scale * 0.31)) * 0.25)),
      });
    }
    return points;
  };
  const rugged = horizon === 'mountains';
  const peak = (noise: (x: number) => number) => (x: number) => {
    const v = noise(x);
    return rugged ? Math.abs(2 * v - 1) : v;
  };
  const n1 = noise1(seed + 11),
    n2 = noise1(seed + 23),
    n3 = noise1(seed + 37);
  const trees: TreeColours = {
    dark: deepen(mix(palette.landNear, palette.landMid, 0.25), 0.2),
    mid: mix(palette.landNear, palette.landLight, 0.4),
    light: palette.leafLight,
    bark: deepen(mix(palette.landNear, hex('#5a3a2c'), 0.45), 0.25),
  };
  // Farther trees lose their darks to the air between.
  const distant = (toward: Rgb, amount: number): TreeColours => ({
    dark: mix(trees.dark, toward, amount),
    mid: mix(trees.mid, toward, amount * 0.8),
    light: mix(trees.light, haze, amount * 0.6),
    bark: trees.bark,
  });
  const midTrees = distant(palette.landMid, 0.4),
    farTrees = distant(far, 0.62);
  const at = (points: Point[], fraction: number) =>
    points.reduce((best, p) =>
      Math.abs(p.x - width * fraction) < Math.abs(best.x - width * fraction) ? p : best,
    );
  const side = seededRandom(seed + 41)() < 0.5 ? -1 : 1;

  if (horizon !== 'sea') {
    const hills = [
      crestLine(0.03, 0.1, peak(n1), rugged ? 7 : 11),
      crestLine(0.2, 0.17, peak(n2), rugged ? 10 : 16),
    ];
    const tones: LayerTone[] = [
      {
        crest: mix(far, palette.landMid, 0.45),
        body: mix(mix(far, palette.landMid, 0.6), haze, 0.3),
        light: mix(light, haze, 0.2),
        shade: deepen(palette.landMid, 0.2),
        depth: 16 * unit,
        lightAlpha: 0.55 * lightStrength,
        marks: 90,
      },
      {
        crest: mix(palette.landMid, palette.landNear, 0.25),
        body: mix(mix(palette.landMid, palette.landNear, 0.45), haze, 0.16),
        light,
        shade: deepen(palette.landNear, 0.15),
        depth: 26 * unit,
        lightAlpha: 0.6 * lightStrength,
        marks: 150,
      },
    ];
    hills.forEach((points, i) => {
      const crestY = points.reduce((m, p) => Math.min(m, p.y), Infinity);
      mist(ctx, crestY + 8 * unit, width, haze, 0.42 - i * 0.1 + 0.12 * (1 - day), (46 + i * 14) * unit);
      landLayer(scene, points, tones[i], brush);
      const wood = seededRandom(seed + 81 + i);
      if (horizon === 'city')
        hillTown(scene, points, 2 + i, 15 + i * 13, i ? midTrees : farTrees, wood, i ? 0.08 : 0.3);
      else
        copse(scene, points, i ? midTrees : farTrees, (13 + i * 14) * unit, 0.05 + i * 0.012, rugged, wood);
    });
    // A cottage on the middle hill, away from the tree, with a thread of chimney smoke at dusk.
    if (horizon !== 'city') {
      const home = at(hills[1], side < 0 ? 0.36 : 0.62);
      const hh = Math.min(home.y - horizonY - 5 * unit, 56 * unit);
      if (hh > 16 * unit) {
        const glow = clamp01(1.25 - day * 1.6);
        cottage(
          ctx,
          home.x,
          home.y + 4 * unit,
          hh,
          {
            wall: mix(deepen(palette.landMid, 0.2), hex('#f6ead0'), 0.2 + 0.75 * day),
            roof: mix(deepen(palette.landMid, 0.3), hex('#b4503a'), 0.3 + 0.65 * day),
            trim: mix(light, palette.cloudLight, 0.5),
          },
          glow,
          lightX,
          false,
        );
        const cx = home.x + hh * 0.34,
          cy = home.y - hh * 1.02;
        if (glow > 0.3 && cy - hh * 0.9 > horizonY) {
          ctx.strokeStyle = css(palette.cloudLight, 0.22);
          ctx.lineWidth = 3 * unit;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.bezierCurveTo(
            cx + 6 * unit,
            cy - hh * 0.35,
            cx - 8 * unit,
            cy - hh * 0.55,
            cx + 10 * unit,
            cy - hh * 0.85,
          );
          ctx.stroke();
        }
        const garden = seededRandom(seed + 47);
        copse(
          scene,
          [
            { x: home.x - hh * 1.3, y: home.y + 5 * unit },
            { x: home.x - hh * 1.0, y: home.y + 6 * unit },
            { x: home.x + hh * 1.15, y: home.y + 6 * unit },
          ],
          midTrees,
          hh * 0.8,
          1,
          rugged,
          garden,
        );
      }
    }
  }

  // The foreground: a near rise of meadow (a headland, by the sea) with grass, flowers, a tree and
  // two people looking up.
  if (ground > 70 * unit) {
    const sea = horizon === 'sea';
    const rise = sea
      ? (() => {
          // A grassy headland rising from one bottom corner.
          const points: Point[] = [];
          for (let x = -24; x <= width + 24; x += 8) {
            const u = side < 0 ? x / width : 1 - x / width;
            const lift = clamp01(1 - u / 0.62);
            points.push({
              x,
              y:
                horizonY +
                reach * (1.04 - 0.6 * lift * lift * (3 - 2 * lift) - 0.035 * n3(azAt(x) / 4) * lift) +
                (ground - reach),
            });
          }
          return points;
        })()
      : crestLine(0.5, 0.26, n3, 20).map((p) => ({ x: p.x, y: p.y + (ground - reach) * 0.6 }));
    const crestY = rise.reduce((m, p) => Math.min(m, p.y), Infinity);
    if (!sea) mist(ctx, crestY + 10 * unit, width, haze, 0.26 + 0.12 * (1 - day), 60 * unit);
    const near = mix(palette.landNear, palette.landMid, 0.12);
    landLayer(
      scene,
      rise,
      {
        crest: mix(near, palette.landLight, 0.1 + 0.25 * lightStrength * day),
        body: deepen(palette.landNear, 0.18),
        light,
        shade: deepen(palette.landNear, 0.35),
        depth: 34 * unit,
        lightAlpha: 0.7 * lightStrength,
        marks: 170,
      },
      brush,
    );
    const visible = rise.filter((p) => p.y < height + 10 * unit);
    if (visible.length > 2) {
      const meadow = seededRandom(seed + 31);
      grass(
        scene,
        visible,
        deepen(near, 0.08),
        mix(mix(palette.landLight, palette.leafLight, 0.5), near, 0.3),
        meadow,
        26,
      );
      if (day > 0.12)
        flowers(
          scene,
          visible,
          height,
          deepen(near, 0.1),
          seededRandom(seed + 33),
          Math.round(18 + 44 * day),
        );
      const fraction = side < 0 ? 0.14 : 0.86;
      const spot = at(visible, fraction);
      const room = spot.y - horizonY - 8 * unit;
      const big = seededRandom(seed + 43);
      if (room > 60 * unit && spot.x > -40 && spot.x < width + 40) {
        const h = Math.min(room, 300 * unit);
        // The tree's shadow lies on the grass away from the light.
        ctx.fillStyle = css(deepen(palette.landNear, 0.5), 0.28);
        ctx.beginPath();
        ctx.ellipse(spot.x - lightX * h * 0.18, spot.y + 8 * unit, h * 0.42, h * 0.045, 0, 0, TAU);
        ctx.fill();
        if (rugged) {
          conifer(
            ctx,
            spot.x + side * h * 0.2,
            spot.y + 8 * unit,
            h * 0.7,
            trees,
            lightX,
            lightStrength,
            big,
          );
          conifer(ctx, spot.x, spot.y + 10 * unit, h, trees, lightX, lightStrength, big);
        } else broadleaf(ctx, spot.x, spot.y + 8 * unit, h, trees, lightX, lightStrength, big);
      }
      const stand = at(visible, side < 0 ? 0.31 : 0.69);
      const tall = Math.min(stand.y - horizonY - 8 * unit, 64 * unit, ground * 0.3);
      if (tall > 22 * unit) onlookers(ctx, stand.x, stand.y + 5 * unit, tall, scene, -side);
      // Tall seed heads in front of everything, at the bottom edge.
      const reeds = seededRandom(seed + 35);
      ctx.strokeStyle = css(deepen(near, 0.3));
      ctx.fillStyle = css(mix(deepen(near, 0.2), palette.landLight, 0.25 + 0.3 * lightStrength));
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const p = visible[Math.floor(reeds() * visible.length)];
        const h = (30 + reeds() * 44) * unit;
        if (p.y - h < horizonY + 4 * unit) continue;
        const lean = (reeds() - 0.4) * h * 0.4;
        ctx.lineWidth = 1.3 * unit;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + 4 * unit);
        ctx.quadraticCurveTo(p.x + lean * 0.2, p.y - h * 0.6, p.x + lean, p.y - h);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(p.x + lean, p.y - h, 2.2 * unit, 6.5 * unit, lean / h, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** A warm haze lying on the horizon line, for a town's lights. */
function washAtHorizon(scene: LandScene, colour: Rgb, alpha: number, depth: number) {
  const { ctx, width, horizonY } = scene;
  const g = ctx.createLinearGradient(0, horizonY - depth, 0, horizonY);
  g.addColorStop(0, css(colour, 0));
  g.addColorStop(1, css(colour, alpha));
  ctx.fillStyle = g;
  ctx.fillRect(0, horizonY - depth, width, depth);
}
