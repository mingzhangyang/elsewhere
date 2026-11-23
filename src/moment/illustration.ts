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
import type { HorizonVariant } from './scenery';
import {
  type Palette,
  type Point,
  type Rgb,
  TAU,
  clamp01,
  css,
  glowAt,
  hashOf,
  hex,
  lerp,
  mark,
  mix,
  paletteFor,
  washAt,
} from './paint';
import { type CloudLight, altocumulus, cirrus, cloudSheet, cumulus, stratus } from './clouds';
import { landscapeSeason } from './seasons';
import { paintLandscape } from './landscape';

/**
 * The illustrated sky: a painted, picture-book rendering of the same calculated snapshot as the
 * realistic image, on a plain 2D canvas, in watercolour and gouache. Skies are washed in colours
 * keyed to the Sun's altitude; clouds are heaped from the low, mid and high cloud cover and lit from
 * where the Sun or Moon really is; stars are small hand-painted sparks; the Moon glows in its true
 * phase; and the land is painted in depth with one light across all of it (clouds.ts, landscape.ts).
 *
 * What stays calculated: every star, planet, the Sun and the Moon sit where the projection puts
 * them, and which of them appear follows the app's visibility model, so a bright or cloudy sky shows
 * fewer. What is illustrative: sizes (the Moon and planets are enlarged), colours, cloud shapes and
 * the landscape. Scenery reaches at most 2° above the horizon; anything taller (trees, houses,
 * people) stands on ground below the horizon line, so nothing reported visible is hidden. Nothing is
 * invented in the sky: no Milky Way, meteors or aurora.
 */

/** Maps a direction to canvas pixels in the sky area. */
export type ToCanvas = (altitude: number, azimuth: number) => { x: number; y: number; front: boolean };

export interface IllustrationText {
  object: (object: SkyObject) => string;
  pattern: (id: PatternId) => string;
}

const starTint = (colorIndex: number | null | undefined): Rgb =>
  colorIndex == null || colorIndex < 0.05
    ? hex('#d2e2ff')
    : colorIndex < 0.6
      ? hex('#fff8e6')
      : colorIndex < 1.1
        ? hex('#ffe2ac')
        : hex('#ffbe94');

/**
 * A star as a brush would touch it in: a soft halo, a small uneven dot of paint and, for the bright
 * ones, thin tapered rays, each a little different (`quirk` is the star's own number in [0, 1)).
 */
function paintStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  magnitude: number,
  tint: Rgb,
  alpha: number,
  unit: number,
  quirk: number,
) {
  const r = Math.max(1.05, (5.4 - magnitude) * 1.12) * unit;
  const turn = (quirk - 0.5) * 0.5;
  const white = hex('#ffffff');
  if (magnitude < 1.6) {
    glowAt(ctx, x, y, r * 9, tint, 0.26 * alpha);
    glowAt(ctx, x, y, r * 3.2, white, 0.3 * alpha);
    ctx.fillStyle = css(mix(tint, white, 0.4), 0.9 * alpha);
    ctx.beginPath();
    mark(ctx, x, y, r * (9.5 + quirk * 2.5), r * 0.52, turn + Math.PI / 2);
    mark(ctx, x, y, r * (7.5 + (1 - quirk) * 2.5), r * 0.5, turn);
    mark(ctx, x, y, r * 3.6, r * 0.42, turn + Math.PI / 4);
    mark(ctx, x, y, r * 3.6, r * 0.42, turn - Math.PI / 4);
    ctx.fill();
    ctx.fillStyle = css(white, alpha);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.05, r * 0.95, turn, 0, TAU);
    ctx.fill();
  } else if (magnitude < 3) {
    glowAt(ctx, x, y, r * 5, tint, 0.22 * alpha);
    ctx.fillStyle = css(mix(tint, white, 0.3), 0.8 * alpha);
    ctx.beginPath();
    mark(ctx, x, y, r * (5.2 + quirk * 1.6), r * 0.4, turn + Math.PI / 2);
    mark(ctx, x, y, r * (4.2 + (1 - quirk) * 1.4), r * 0.38, turn);
    ctx.fill();
    ctx.fillStyle = css(white, 0.95 * alpha);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.72, r * 0.64, turn, 0, TAU);
    ctx.fill();
  } else {
    if (magnitude < 4.2) glowAt(ctx, x, y, r * 3.4, tint, 0.16 * alpha);
    ctx.fillStyle = css(tint, alpha * (0.7 + 0.25 * quirk));
    ctx.beginPath();
    ctx.ellipse(x, y, r * (0.5 + 0.2 * quirk), r * 0.5, quirk * 3, 0, TAU);
    ctx.fill();
  }
}

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
  glowAt(ctx, x, y, r * 7.5, hex('#fff2d0'), (0.08 + 0.26 * illumination) * dusk);
  glowAt(ctx, x, y, r * 3.4, lit, 0.09 * (0.4 + illumination) * dusk);
  ctx.save();
  ctx.translate(x, y);
  // Earthshine: the dark part is a deep, faintly luminous blue rather than a hole.
  ctx.fillStyle = day > 0.5 ? 'rgba(255,255,255,.2)' : css(hex('#5a6ea8'), 0.3 + 0.25 * (1 - day));
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
  body.addColorStop(0, '#fffdf0');
  body.addColorStop(0.7, css(lit));
  body.addColorStop(1, '#f0d8a0');
  ctx.fillStyle = body;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  // Maria as soft watercolour blots.
  ctx.fillStyle = 'rgba(190,168,134,.3)';
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
 * The painting's lettering: Latin in an italic book face, Chinese in a brush-written one where the
 * device has it.
 */
export function lettering(text: string, size: number, font: string, weight = 600): string {
  return /[\u2e80-\u9fff]/.test(text)
    ? `${weight} ${Math.round(size * 1.04)}px "Kaiti SC", STKaiti, KaiTi, "Yuanti SC", YouYuan, ${font}`
    : `italic ${weight} ${Math.round(size * 1.06)}px "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Noto Serif", serif`;
}

/** A name lettered onto the painting: cream paint over a soft shadow on a dark sky, ink on a bright one. */
function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  font: string,
  ink: boolean,
) {
  ctx.font = lettering(text, size, font);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = ink ? 'rgba(255,252,240,.9)' : 'rgba(14,18,54,.9)';
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = ink ? '#27305c' : '#fff7e2';
  // Twice, so the soft shadow is dense enough to carry the letters over stars and clouds.
  ctx.fillText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0,0,0,0)';
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
  landscapeArt?: HTMLImageElement | null,
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
  // The one light of the painting: the Sun by day and through twilight, else the Moon.
  const sunLit = sky.sunAltitude > -10;
  const lightBody = sunLit ? sky.sun : sky.moon.visible ? sky.moon : null;
  const lightAt = lightBody ? toCanvas(Math.max(-2, lightBody.altitude), lightBody.azimuth) : null;
  const lightFront = lightAt?.front ? lightAt : null;
  const lightSide = lightFront ? Math.max(-1, Math.min(1, (lightFront.x - width / 2) / (width / 2))) : -0.45;
  const lightX = (lightSide < 0 ? -1 : 1) * Math.max(0.3, Math.abs(lightSide));
  const moonlight = sky.moon.visible ? 0.2 + 0.5 * sky.moon.illumination : 0.1;
  // Facing a low light, the land is seen against it: mostly shade, with light only at its edges.
  const against = lightFront && lightBody && lightBody.altitude < 14 ? 0.45 * (1 - Math.abs(lightSide)) : 0;
  const lightStrength =
    lerp(moonlight, 1, clamp01((sky.sunAltitude + 12) / 12)) * (1 - cover * 0.35) * (1 - against);
  const urban = snapshot.skyBrightness === 'city' ? 1 : snapshot.skyBrightness === 'suburban' ? 0.5 : 0;
  const halfWidth = (Math.atan(Math.tan((view.fov * Math.PI) / 360) * snapshot.aspect) * 180) / Math.PI;

  // 1. The sky: bands of colour by altitude, from the zenith down to a luminous horizon.
  const yAt = (altitude: number) => toCanvas(altitude, view.heading).y;
  const highest = Math.min(89, view.altitude + view.fov);
  const top = yAt(highest),
    span = horizonY - top || 1;
  const gradient = ctx.createLinearGradient(0, top, 0, horizonY);
  for (const [altitude, colour] of [
    [highest, palette.zenith],
    [48, palette.upper],
    [16, palette.lower],
    [0, palette.horizon],
  ] as [number, Rgb][]) {
    const t = (yAt(Math.min(altitude, highest)) - top) / span;
    if (Number.isFinite(t)) gradient.addColorStop(clamp01(t), css(colour));
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  // Wet-in-wet washes: broad, soft sweeps of neighbouring colours, darker and lighter, so no part
  // of the sky is quite even. Kept level and shapeless: they are paint, not a Milky Way.
  const washes = seededRandom(seed + 61);
  const skyBottom = Math.min(height, horizonY);
  for (let i = 0; i < 22; i++) {
    const t = washes();
    const y = lerp(Math.max(0, top), skyBottom, t);
    const r = (50 + washes() * 120) * unit;
    const tone = washes();
    const colour =
      tone < 0.4
        ? mix(t < 0.5 ? palette.zenith : palette.upper, [14, 12, 52], 0.25)
        : tone < 0.75
          ? mix(t < 0.5 ? palette.upper : palette.lower, palette.glow, washes() * 0.25)
          : mix(palette.lower, palette.horizon, washes());
    washAt(ctx, washes() * width, y, r, 4 + washes() * 6, colour, 0.1 + washes() * 0.14);
  }
  // A luminous haze lying on the horizon.
  const haze = ctx.createLinearGradient(0, horizonY - 110 * unit, 0, horizonY + 20 * unit);
  const hazeColour = mix(palette.horizon, palette.glow, 0.4);
  haze.addColorStop(0, css(hazeColour, 0));
  haze.addColorStop(0.8, css(hazeColour, 0.5));
  haze.addColorStop(1, css(hazeColour, 0.35));
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizonY - 110 * unit, width, 130 * unit);

  // Glows: toward the Sun near the horizon at dusk and dawn, and moonlight around the Moon.
  if (sky.sunAltitude > -14) {
    const s = toCanvas(Math.max(-2, sky.sun.altitude), sky.sun.azimuth);
    if (s.front) {
      const strength = (1 - Math.abs(sky.sunAltitude + 2) / 14) * (1 - cover * 0.6);
      const y = Math.max(s.y, horizonY - 4 * unit);
      washAt(ctx, s.x, y, 460 * unit, 2.8, palette.glow, 0.5 * strength);
      washAt(ctx, s.x, y, 150 * unit, 3.6, mix(palette.glow, hex('#fff6dc'), 0.5), 0.45 * strength);
    }
  }
  if (sky.moon.visible) {
    const p = toCanvas(sky.moon.altitude, sky.moon.azimuth);
    if (p.front) glowAt(ctx, p.x, p.y, 560 * unit, hex('#cfe0ff'), 0.24 * sky.moon.illumination * night);
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
  /** Names to letter in at the end: below their object, or above it (`top`) when that would fall on the land. */
  const named: { name: string; x: number; y: number; top?: number }[] = [];
  /**
   * The Sun, Moon, planets and first-magnitude stars are painted after the clouds (`overClouds`), so
   * an illustrative cloud can never cover them, whatever its shape. Clouds are also placed to leave
   * room around them (`keepClear`), so that they usually pass beside rather than behind.
   */
  const overClouds: (() => void)[] = [];
  const keepClear: { x: number; y: number; r: number; star?: boolean }[] = [];
  if (layers.stars) {
    const stars: Star[] = sky.stars.filter((s) => s.altitude > 0 && s.magnitude < 5.2).slice(0, 900);
    for (const star of stars) {
      const share = starVisibilityFactors(star, sky, weather, snapshot.skyBrightness).combined;
      if (share < 0.06) continue;
      const p = toCanvas(star.altitude, star.azimuth);
      if (!inView(p)) continue;
      const a = Math.min(1, 0.3 + share * 0.7);
      const paint = () =>
        paintStar(ctx, p.x, p.y, star.magnitude, starTint(star.colorIndex), a, unit, hashOf(star.id));
      if (star.magnitude < 1.6) {
        overClouds.push(paint);
        keepClear.push({ x: p.x, y: p.y, r: 26 * unit, star: true });
      } else paint();
      if (layers.labels && star.magnitude < 1.3 && star.name) {
        const r = Math.max(1.05, (5.4 - star.magnitude) * 1.12) * unit;
        named.push({
          name: text.object({ ...star, kind: 'star' }),
          x: p.x,
          y: p.y + r * 5.4,
          top: p.y - r * 5.4,
        });
      }
    }
  }

  // 3. Line patterns as soft chalk dots, faded by twilight and weather as the renderer fades them.
  const linesShare = twilightVisibility(sky.sunAltitude) * weatherVisibility(weather);
  if (layers.lines && linesShare > 0.01) {
    const byId = new Map(sky.stars.map((s) => [s.id, s]));
    ctx.strokeStyle = css(hex('#d6e2ff'), 0.55 * linesShare);
    ctx.lineWidth = 2.4 * unit;
    ctx.lineCap = 'round';
    ctx.setLineDash([0.1, 8 * unit]);
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

  // 4. The Sun: a warm disc in soft painted rings, larger and redder as it sinks.
  if (sky.sun.visible) {
    const p = toCanvas(sky.sun.altitude, sky.sun.azimuth);
    if (inView(p, 120)) {
      const low = clamp01(1 - sky.sunAltitude / 8);
      const r = (30 + 8 * low) * unit;
      overClouds.push(() => {
        glowAt(ctx, p.x, p.y, r * 9, hex('#fff1c2'), 0.42 * (1 - cover * 0.5));
        glowAt(ctx, p.x, p.y, r * 4, mix(hex('#fff4cf'), hex('#ffc880'), low), 0.5);
        glowAt(ctx, p.x, p.y, r * 1.9, hex('#fffbe8'), 0.75);
        const disc = ctx.createRadialGradient(p.x - r * 0.25, p.y - r * 0.25, r * 0.1, p.x, p.y, r);
        disc.addColorStop(0, '#fffdf0');
        disc.addColorStop(0.6, css(mix(hex('#fff3b8'), hex('#ffd27a'), low)));
        disc.addColorStop(1, css(mix(hex('#ffe38a'), hex('#ff9a58'), low)));
        ctx.fillStyle = disc;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
      });
      keepClear.push({ x: p.x, y: p.y, r: r * 2.2 });
      if (layers.labels)
        named.push({
          name: text.object({ ...sky.sun, id: 'sun', name: 'Sun', kind: 'sun' }),
          x: p.x,
          y: p.y + r * 1.7,
          top: p.y - r * 1.7,
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
    overClouds.push(() => {
      const [fill, shade] = PLANET_FILL[planet.id];
      glowAt(ctx, p.x, p.y, r * 5.5, hex(fill), 0.36 * share);
      if (planet.id === 'venus') {
        ctx.fillStyle = css(hex('#ffffff'), 0.8 * share);
        ctx.beginPath();
        mark(ctx, p.x, p.y, r * 7.4, r * 0.34, Math.PI / 2 + 0.06);
        mark(ctx, p.x, p.y, r * 6, r * 0.32, 0.06);
        ctx.fill();
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
    });
    keepClear.push({ x: p.x, y: p.y, r: 30 * unit });
    if (layers.labels)
      named.push({
        name: text.object({ ...planet, kind: 'planet' }),
        x: p.x,
        y: p.y + r * 2.6,
        top: p.y - r * 2.6,
      });
  }

  // 6. The Moon, larger than life, in its true phase and orientation.
  if (sky.moon.visible) {
    const p = toCanvas(sky.moon.altitude, sky.moon.azimuth);
    if (inView(p, 120)) {
      const r = 42 * unit;
      overClouds.push(() =>
        paintMoon(ctx, p.x, p.y, r, sky.moon.illumination, sky.moon.brightLimbAngle, day),
      );
      keepClear.push({ x: p.x, y: p.y, r: r * 1.5 });
      if (layers.labels)
        named.push({
          name: text.object({ ...sky.moon, id: 'moon', name: 'Moon', kind: 'moon' }),
          x: p.x,
          y: p.y + r * 1.45,
          top: p.y - r * 1.45,
        });
    }
  }

  // 7. Clouds: cirrus high, altocumulus in the middle, cumulus and stratus low, as many as each
  // layer's cover, placed across the view (their shapes and places are illustrative) and lit from
  // where the light really is.
  const random = seededRandom(seed);
  const low = clamp01(weather.cloudLow / 100),
    mid = clamp01(weather.cloudMid / 100),
    high = clamp01(weather.cloudHigh / 100);
  // Custom weather may give only the total; treat it as low cloud.
  const lowShare = low + mid + high > 0.01 ? low : cover;
  // Without the Moon, a night cloud has no bright side.
  const dim = sunLit ? 0 : 0.75 * (1 - (sky.moon.visible ? sky.moon.illumination : 0));
  const cloudPalette: Palette = { ...palette, cloudLight: mix(palette.cloudLight, palette.cloudBody, dim) };
  const diagonal = Math.hypot(width, height);
  // A low Sun lights the bellies of the clouds; at night a town's lights do, faintly.
  const lowSun = sunLit ? clamp01(1 - Math.abs(sky.sunAltitude) / 7) * (1 - cover * 0.5) : 0;
  const under = Math.max(lowSun, urban * night * 0.5);
  const underColour = lowSun > 0 ? mix(palette.glow, hex('#ff9a6e'), 0.45) : hex('#ffb078');
  const lightOn = (x: number, y: number): CloudLight => {
    let lx = lightSide * 0.5,
      ly = -0.85,
      backlit = 0;
    if (lightFront) {
      const dx = lightFront.x - x,
        dy = lightFront.y - y;
      const d = Math.hypot(dx, dy) || 1;
      // By day the light also falls from above; near dusk it comes level from the Sun's side.
      const above = sunLit ? 0.3 + 0.45 * day : 0.45;
      lx = (dx / d) * (1 - above);
      ly = Math.min(0.1, (dy / d) * (1 - above)) - above;
      backlit = clamp01(1 - d / (diagonal * 0.4)) * (sunLit ? 1 - day * 0.65 : 0.6);
    }
    const length = Math.hypot(lx, ly) || 1;
    return { x: lx / length, y: ly / length, backlit, under, underColour };
  };
  /**
   * A place for a cloud between two altitudes whose painted footprint (`extent`, in pixels for the
   * cloud's scale: half its width, its reach above and below the point it is placed by) holds none of
   * the objects kept clear. Those are painted over the clouds in any case; this only makes clouds
   * pass beside them rather than behind.
   */
  const place = (
    minAlt: number,
    maxAlt: number,
    extent: (scale: number) => { half: number; up: number; down: number },
  ): (Point & { alt: number; scale: number }) | null => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const az = view.heading + (random() - 0.5) * 2.2 * halfWidth;
      const alt = minAlt + random() * (maxAlt - minAlt);
      const p = toCanvas(alt, az);
      if (!inView(p, 300 * unit)) continue;
      // Lower clouds are farther away, so smaller.
      const scale = (0.45 + alt / 24) * unit;
      const { half, up, down } = extent(scale);
      // The amount of cloud follows the cover: when no gap among the bright stars is found, the cloud
      // may pass behind them (they are painted over it).
      if (
        keepClear.some(
          (k) =>
            !(k.star && attempt > 5) &&
            Math.abs(k.x - p.x) < half + k.r &&
            k.y > p.y - up - k.r &&
            k.y < p.y + down + k.r,
        )
      )
        continue;
      return { x: p.x, y: p.y, alt, scale };
    }
    return null;
  };
  // Use reported total cover for the deck. Summing layers would turn partly cloudy weather
  // into full overcast whenever multiple cloud layers overlap.
  const sheetAmount = cover;
  if (sheetAmount > 0.35)
    cloudSheet(
      ctx,
      width,
      Math.max(0, top),
      horizonY - 30 * unit,
      cloudPalette,
      lightOn(width / 2, horizonY * 0.4),
      random,
      sheetAmount,
    );
  for (let i = 0, n = Math.round(high * 5); i < n; i++) {
    // Strokes up to 1.1 lengths long, spread 0.4 lengths across and 0.14 lengths up and down.
    const p = place(28, 75, (scale) => ({
      half: 480 * scale * 0.8,
      up: 480 * scale * 0.2,
      down: 480 * scale * 0.15,
    }));
    if (p) cirrus(ctx, p.x, p.y, 480 * p.scale, cloudPalette, lightOn(p.x, p.y), random);
  }
  for (let i = 0, n = Math.round(mid * 4); i < n; i++) {
    // Up to four rows of up to seven puffs, 1.25 sizes apart, rows 0.72 sizes apart.
    const p = place(14, 40, (scale) => ({
      half: 34 * scale * 6,
      up: 34 * scale * 2.4,
      down: 34 * scale * 2.4,
    }));
    if (p) altocumulus(ctx, p.x, p.y, 34 * p.scale, cloudPalette, lightOn(p.x, p.y), random);
  }
  for (let i = 0, n = Math.round(lowShare * 3); i < n; i++) {
    const length = (260 + random() * 420) * unit;
    // Bars up to 1.05 lengths long, set up to a quarter length off centre, stacked about 40 units.
    const p = place(1.2, 7, () => ({ half: length * 0.8, up: 45 * unit, down: 45 * unit }));
    if (p) stratus(ctx, p.x, p.y, length, cloudPalette, lightOn(p.x, p.y), random, unit);
  }
  const heaps: (Point & { size: number; tiers: number; alt: number })[] = [];
  for (let i = 0, n = Math.round(lowShare * 6); i < n; i++) {
    // Fewer, connected cloud banks preserve gaps for twilight and bright celestial objects.
    // Tiers shape the crown, not separate spherical volumes.
    const tiers = random() < 0.45 ? 2 : 1;
    const grow = 0.78 + random() * 0.42;
    const p = place(3, 21, (scale) => {
      const size = 108 * grow * scale;
      // Density-field wisps spread on both sides and below the former hard silhouette.
      return { half: size * 2.33, up: size * 1.9, down: size * 0.64 };
    });
    if (p) heaps.push({ x: p.x, y: p.y, alt: p.alt, size: 108 * grow * p.scale, tiers });
  }
  // Farther (lower) clouds first, so nearer ones overlap them.
  heaps.sort((a, b) => a.alt - b.alt);
  for (const heap of heaps)
    cumulus(
      ctx,
      heap.x,
      heap.y,
      heap.size,
      cloudPalette,
      lightOn(heap.x, heap.y - heap.size * 0.5),
      random,
      heap.tiers,
    );

  // The Sun, Moon, planets and bright stars, over the clouds: what the app reports as visible stays
  // visible on the image.
  for (const paint of overClouds) paint();

  // 8. The landscape, painted in depth under the same light.
  paintLandscape({
    season: landscapeSeason(snapshot),
    ctx,
    width,
    height,
    unit,
    horizonY,
    palette,
    toCanvas,
    view,
    sky,
    day,
    night,
    // A place keeps its terrain and landmarks as the simulated sky moves through the day.
    seed:
      Math.imul(Math.round(snapshot.location.latitude * 100), 73856093) ^
      Math.imul(Math.round(snapshot.location.longitude * 100), 19349663),
    lightX,
    lightStrength,
    halfWidth,
    horizon,
    landscapeArt,
  });

  const size = 21 * unit;
  for (const { name, x, y, top } of named) {
    // A name that would be lettered across the land goes above its object instead.
    const at = top !== undefined && y + size * 1.3 > horizonY ? top - size * 1.25 : y;
    if (inView({ x, y: at, front: true }, 0)) label(ctx, name, x, at, size, font, sky.sunAltitude > 4);
  }
}
