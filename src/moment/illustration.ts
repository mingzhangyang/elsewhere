import type { MomentSnapshot } from '../lib/moment';
import type { SkyObject } from '../lib/exploration';
import { CONSTELLATIONS, type PatternId } from '../domain/stars';
import { planetVisibilityFactors, starVisibilityFactors } from '../domain/starVisibility';
import { seededRandom } from '../lib/random';
import { HORIZON_STEP, horizonAltitude, type HorizonVariant } from './scenery';

/**
 * The illustrated (cartoon-style) sky for the phase 3 test: a plain 2D canvas drawing from the same
 * calculated snapshot as the realistic image. Positions come from the snapshot through the same
 * projection; only the drawing is stylized (bigger Moon, sparkle stars, puffy clouds). Which stars
 * and planets appear follows the app's visibility model, so a cloudy or bright sky shows fewer.
 * A sketch for testing the idea, not the phase 4 renderer.
 */

/** Maps a direction to canvas pixels in the sky area. */
export type ToCanvas = (altitude: number, azimuth: number) => { x: number; y: number; front: boolean };

export interface IllustrationText {
  object: (object: SkyObject) => string;
  pattern: (id: PatternId) => string;
}

type Rgb = [number, number, number];
const hex = (value: string): Rgb => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as Rgb;
const css = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r},${g},${b},${alpha})`;

/** Sky colours (top, bottom) by Sun altitude, blended between neighbours. */
const SKY_KEYS: [number, Rgb, Rgb][] = [
  [-18, hex('#0b1440'), hex('#1f2c66')],
  [-8, hex('#1d2766'), hex('#7a4f8f')],
  [-1, hex('#34488f'), hex('#f39a6b')],
  [6, hex('#4f8fd8'), hex('#bfe0f7')],
  [30, hex('#3d86de'), hex('#a8d6fb')],
];
function skyColours(sunAltitude: number): [Rgb, Rgb] {
  if (sunAltitude <= SKY_KEYS[0][0]) return [SKY_KEYS[0][1], SKY_KEYS[0][2]];
  for (let i = 1; i < SKY_KEYS.length; i++) {
    const [alt, top, bottom] = SKY_KEYS[i];
    if (sunAltitude <= alt) {
      const [alt0, top0, bottom0] = SKY_KEYS[i - 1];
      const t = (sunAltitude - alt0) / (alt - alt0);
      return [mix(top0, top, t), mix(bottom0, bottom, t)];
    }
  }
  const last = SKY_KEYS[SKY_KEYS.length - 1];
  return [last[1], last[2]];
}
/** 0 at night, 1 in daylight. */
const daylight = (sunAltitude: number) => Math.min(1, Math.max(0, (sunAltitude + 8) / 14));

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const radius = i % 2 ? r * 0.38 : r;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  for (const [dx, dy, r] of [
    [-0.9, 0.15, 0.45],
    [-0.35, -0.2, 0.6],
    [0.3, -0.3, 0.7],
    [0.95, 0.05, 0.5],
    [0.1, 0.2, 0.55],
  ]) {
    ctx.moveTo(x + dx * size + r * size, y + dy * size);
    ctx.arc(x + dx * size, y + dy * size, r * size, 0, Math.PI * 2);
  }
  ctx.fill();
}

/** A lit disc with its terminator, the lit limb toward `angle` degrees clockwise from the top. */
function phaseDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  illumination: number,
  angle: number,
  lit: string,
  dark: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(((angle - 90) * Math.PI) / 180);
  const terminator = 1 - 2 * Math.max(0, Math.min(1, illumination));
  ctx.fillStyle = lit;
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
  ctx.fill();
  ctx.restore();
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  font: string,
) {
  ctx.font = `600 ${Math.round(size)}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.28;
  ctx.strokeStyle = 'rgba(10,16,40,.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#fff8e6';
  ctx.fillText(text, x, y);
}

const PLANET_FILL: Record<string, string> = {
  mercury: '#d9c7b3',
  venus: '#fff1c7',
  mars: '#ff8a5c',
  jupiter: '#f6d6a8',
  saturn: '#f0d58c',
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
  const day = daylight(sky.sunAltitude);
  const cloudShare = weather.cloudCover / 100;

  // Sky: a vertical gradient to the horizon, greyed by cloud.
  const horizonY = toCanvas(0, view.heading).y;
  const [top, bottom] = skyColours(sky.sunAltitude);
  const grey = mix(hex('#3a4256'), hex('#c3cbd6'), day);
  const gradient = ctx.createLinearGradient(0, 0, 0, Math.max(10, Math.min(height, horizonY)));
  gradient.addColorStop(0, css(mix(top, grey, cloudShare * 0.55)));
  gradient.addColorStop(1, css(mix(bottom, grey, cloudShare * 0.55)));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const inView = (p: { x: number; y: number; front: boolean }, margin = 40) =>
    p.front && p.x > -margin && p.x < width + margin && p.y > -margin && p.y < height + margin;

  // Stars, through the app's visibility model; the brightest few hundred, as sparkles and dots.
  const named: { name: string; x: number; y: number }[] = [];
  if (layers.stars) {
    const stars = sky.stars.filter((s) => s.altitude > 0 && s.magnitude < 5).slice(0, 600);
    for (const star of stars) {
      const share = starVisibilityFactors(star, sky, weather, snapshot.skyBrightness).combined;
      if (share < 0.08) continue;
      const p = toCanvas(star.altitude, star.azimuth);
      if (!inView(p)) continue;
      ctx.fillStyle = `rgba(255,246,214,${Math.min(1, 0.35 + share * 0.65)})`;
      const r = Math.max(1.4, (5 - star.magnitude) * 1.7) * unit;
      if (star.magnitude < 1.6) sparkle(ctx, p.x, p.y, r * 1.9);
      else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (star.magnitude < 1.3 && star.name)
        named.push({ name: text.object({ ...star, kind: 'star' }), ...p });
    }
  }

  // Line patterns, dashed, between stars above the horizon.
  if (layers.lines) {
    const byId = new Map(sky.stars.map((s) => [s.id, s]));
    ctx.strokeStyle = day > 0.5 ? 'rgba(255,255,255,.55)' : 'rgba(170,200,255,.6)';
    ctx.lineWidth = 2.2 * unit;
    ctx.setLineDash([9 * unit, 7 * unit]);
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
        named.push({ name: text.pattern(pattern.id), x: p.x, y: p.y + 14 * unit });
      }
    }
    ctx.setLineDash([]);
  }

  // The Sun, a cartoon disc with rays.
  if (sky.sun.visible) {
    const p = toCanvas(sky.sun.altitude, sky.sun.azimuth);
    if (inView(p, 80)) {
      const r = 34 * unit;
      ctx.fillStyle = 'rgba(255,214,94,.35)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffcf4a';
      ctx.lineWidth = 5 * unit;
      ctx.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * r * 1.3, p.y + Math.sin(a) * r * 1.3);
        ctx.lineTo(p.x + Math.cos(a) * r * 1.7, p.y + Math.sin(a) * r * 1.7);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd95e';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (layers.labels)
        named.push({
          name: text.object({ ...sky.sun, id: 'sun', name: 'Sun', kind: 'sun' }),
          x: p.x,
          y: p.y + r * 1.9,
        });
    }
  }

  // Planets, where the app would draw them.
  for (const planet of sky.planets) {
    if (!planet.visible) continue;
    const share = planetVisibilityFactors(planet, sky, weather, snapshot.skyBrightness).combined;
    if (share < 0.15) continue;
    const p = toCanvas(planet.altitude, planet.azimuth);
    if (!inView(p)) continue;
    const r = (planet.magnitude < -2 ? 12 : 9) * unit;
    const glow = ctx.createRadialGradient(p.x, p.y, r, p.x, p.y, r * 2.6);
    glow.addColorStop(0, 'rgba(255,240,200,.45)');
    glow.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    if (planet.id === 'saturn') {
      ctx.strokeStyle = '#f7e2a6';
      ctx.lineWidth = 2.4 * unit;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 2, r * 0.7, -0.35, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = PLANET_FILL[planet.id];
    ctx.strokeStyle = 'rgba(20,24,50,.7)';
    ctx.lineWidth = 1.6 * unit;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (layers.labels)
      named.push({ name: text.object({ ...planet, kind: 'planet' }), x: p.x, y: p.y + r * 2.2 });
  }

  // The Moon, larger than life, with its phase turned as seen.
  if (sky.moon.visible) {
    const p = toCanvas(sky.moon.altitude, sky.moon.azimuth);
    if (inView(p, 80)) {
      const r = 30 * unit;
      ctx.fillStyle = `rgba(255,248,220,${0.12 + 0.2 * sky.moon.illumination})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.9, 0, Math.PI * 2);
      ctx.fill();
      phaseDisc(
        ctx,
        p.x,
        p.y,
        r,
        sky.moon.illumination,
        sky.moon.brightLimbAngle,
        '#fff4cf',
        day > 0.5 ? 'rgba(255,255,255,.25)' : '#2c3658',
      );
      if (layers.labels)
        named.push({
          name: text.object({ ...sky.moon, id: 'moon', name: 'Moon', kind: 'moon' }),
          x: p.x,
          y: p.y + r * 1.5,
        });
    }
  }

  // Clouds: as many puffs as the cover, in seeded places so a redraw keeps them.
  const puffs = Math.round(cloudShare * 10);
  if (puffs) {
    const random = seededRandom(Math.floor(snapshot.instant.getTime() / 3600000) % 100000);
    const colour = mix(
      mix(hex('#3b4668'), hex('#d9a3b0'), Math.max(0, 1 - Math.abs(sky.sunAltitude + 3) / 6)),
      hex('#ffffff'),
      day,
    );
    ctx.fillStyle = css(colour, 0.6 + cloudShare * 0.35);
    const floor = Math.min(height, Math.max(height * 0.3, horizonY));
    for (let i = 0; i < puffs; i++)
      cloud(ctx, random() * width, (0.08 + random() * 0.8) * floor, (55 + random() * 50) * unit);
  }

  // The horizon silhouette and the ground below it.
  const edge: { x: number; y: number }[] = [];
  const step = HORIZON_STEP[horizon] / 5;
  for (let az = view.heading - 100; az <= view.heading + 100; az += step) {
    const p = toCanvas(horizonAltitude(horizon, az), az);
    if (p.front) edge.push(p);
  }
  if (edge.length > 1) {
    const ground =
      horizon === 'sea'
        ? mix(hex('#0b1a33'), hex('#2f6ea3'), day)
        : horizon === 'city'
          ? mix(hex('#121624'), hex('#56606f'), day)
          : mix(hex('#0e1a1c'), hex('#4f7a46'), day);
    ctx.fillStyle = css(ground);
    ctx.beginPath();
    ctx.moveTo(edge[0].x, height + 10);
    for (const p of edge) ctx.lineTo(p.x, p.y);
    ctx.lineTo(edge[edge.length - 1].x, height + 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = css(mix(ground, hex('#ffffff'), 0.25));
    ctx.lineWidth = 2 * unit;
    ctx.beginPath();
    edge.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    const lowest = Math.max(...edge.map((p) => p.y));
    if (horizon === 'city' && day < 0.6) {
      // Lit windows, more under a brighter sky setting.
      const random = seededRandom(7);
      const density =
        snapshot.skyBrightness === 'city' ? 0.5 : snapshot.skyBrightness === 'suburban' ? 0.3 : 0.15;
      ctx.fillStyle = 'rgba(255,214,120,.85)';
      for (let i = 0; i < edge.length; i += 6) {
        const p = edge[i];
        for (let y = p.y + 6 * unit; y < lowest + 30 * unit; y += 9 * unit)
          if (random() < density) ctx.fillRect(p.x, y, 3 * unit, 4 * unit);
      }
    }
    if (horizon === 'sea' && sky.moon.visible) {
      // The Moon's path on the water.
      const m = toCanvas(sky.moon.altitude, sky.moon.azimuth);
      if (m.front && m.x > 0 && m.x < width) {
        ctx.fillStyle = `rgba(255,244,207,${0.25 + 0.5 * sky.moon.illumination})`;
        for (let y = lowest + 6 * unit, i = 0; y < height; y += 10 * unit, i++) {
          const w = (12 + i * 3) * unit * (0.6 + 0.4 * Math.sin(i * 2.3));
          ctx.fillRect(m.x - w / 2, y, w, 2.5 * unit);
        }
      }
    }
  }

  for (const { name, x, y } of named)
    if (inView({ x, y, front: true }, 0)) label(ctx, name, x, y, 22 * unit, font);
}
