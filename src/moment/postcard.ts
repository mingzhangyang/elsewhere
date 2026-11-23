import type { I18n } from '../i18n';
import type { MomentSnapshot } from '../lib/moment';
import type { SkyCapture } from '../renderer/createSkyRenderer';
import { angularDiameter, findSkyObject } from '../lib/exploration';
import { isDeviceLocation } from '../lib/locations';
import { objectName, placeLabel } from '../i18n/names';
import { weatherDescription } from '../lib/weatherText';
import { createProjection } from './projection';
import { drawIllustration, lettering, type ToCanvas } from './illustration';
import { noise1 } from './paint';
import { HORIZON_STEP, horizonAltitude, type HorizonVariant } from './scenery';
import { seededRandom } from '../lib/random';
import { momentImageCopy } from './imageCopy';

/**
 * The keepsake image of a sky moment (ROADMAP phase 3 prototype), composed on a 2D canvas: the sky
 * (captured from the renderer, or illustrated from the same snapshot), the target ring and compass
 * the screen shows as HTML, then a light panel with the place, local time, Moon phase, conditions,
 * where the conditions come from and the data attributions (principle 3). Only the place name is
 * printed, never coordinates (principle 4). Worded in the language shown when it is drawn.
 */

export type MomentStyle = 'realistic' | 'illustrated';
export const MOMENT_STYLES: MomentStyle[] = ['realistic', 'illustrated'];

export interface PostcardInput {
  snapshot: MomentSnapshot;
  style: MomentStyle;
  horizon: HorizonVariant;
  landscapeArt?: HTMLImageElement | null;
  /** The renderer's frame, captured with the ridge drawn only for the ridge variant. Realistic only. */
  capture: SkyCapture | null;
  i18n: I18n;
  /** The site's address, printed small in the corner. */
  site: string;
}

export const POSTCARD_WIDTH = 1200;
export const FONT =
  '"Segoe UI", ui-sans-serif, system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
const PAD = 56;
const PAPER = '#f6f1e7';

/** Height of the sky area for a view `aspect` wide over high: as tall as the view, within limits. */
export function skyHeight(aspect: number): number {
  return Math.round(Math.min(1500, Math.max(800, POSTCARD_WIDTH / aspect)));
}

/** CJK/fullwidth tokenization, compiled once rather than per line. U+3000–303F lies within U+2E80–9FFF. */
const WRAP_TOKENS = /[\u2e80-\u9fff\uff00-\uffef]|[^\s\u2e80-\u9fff\uff00-\uffef]+|\s+/g;

/** Splits text into lines no wider than `width`, between words or, in Chinese, between characters. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const tokens = text.match(WRAP_TOKENS) ?? [];
  const lines: string[] = [];
  let line = '';
  for (const token of tokens) {
    const next = line + token;
    if (line.trim() && ctx.measureText(next.trimEnd()).width > width && !/^\s+$/.test(token)) {
      lines.push(line.trimEnd());
      line = token.trimStart();
    } else line = next;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

interface TextLine {
  text: string;
  size: number;
  weight: number;
  colour: string;
  gap: number;
}

export function drawPostcard({
  snapshot,
  style,
  horizon,
  landscapeArt,
  capture,
  i18n,
  site,
}: PostcardInput): HTMLCanvasElement {
  const { m } = i18n;
  const { sky, view, location, instant } = snapshot;
  const width = POSTCARD_WIDTH;
  const skyH = skyHeight(snapshot.aspect);
  // The view as it was on screen, scaled to cover the sky area and centered.
  const coverW = Math.max(width, skyH * snapshot.aspect);
  const coverH = coverW / snapshot.aspect;
  const left = (width - coverW) / 2,
    top = (skyH - coverH) / 2;
  const project = createProjection(view, snapshot.aspect);
  const toCanvas: ToCanvas = (altitude, azimuth) => {
    const p = project(altitude, azimuth);
    return { x: left + ((p.x + 1) / 2) * coverW, y: top + ((1 - p.y) / 2) * coverH, front: p.front };
  };

  // Text first, to size the panel.
  const place = isDeviceLocation(location)
    ? { name: m.moment.devicePlace, country: '' }
    : placeLabel(location, i18n);
  const zone = location.timezone;
  const heading = Math.round(view.heading) % 360;
  const direction = m.directions[Math.round(heading / 45) % 8];
  const subject = snapshot.subject;
  const subjectName =
    subject?.kind === 'object'
      ? objectName(subject.object, i18n)
      : subject
        ? m.patterns[subject.id]
        : undefined;
  const ink = '#1d2433',
    soft = '#4a5468',
    faint = '#6b7385';
  const line = (text: string, size = 26, weight = 500, colour = ink, gap = 8): TextLine => ({
    text,
    size,
    weight,
    colour,
    gap,
  });
  const lines: TextLine[] = [
    line(place.name, 56, 700),
    ...(place.country ? [line(place.country, 26, 500, soft, 14)] : []),
    line(
      m.moment.when({
        date: m.f.date(instant, zone),
        time: m.f.time(instant, zone),
        zone: m.f.zone(zone, instant),
      }) + (style === 'illustrated' ? ` · ${m.moment.illustration}` : ''),
      28,
      600,
      ink,
      22,
    ),
    ...(snapshot.provenance.kind === 'clear'
      ? [line(momentImageCopy[i18n.locale].clearSkyBadge, 25, 700, '#335b73', 16)]
      : []),
    line(
      subjectName
        ? m.moment.subject({ name: subjectName, direction, degrees: heading })
        : m.moment.facing({ direction, degrees: heading }),
    ),
    line(
      m.moment.moon({
        phase: m.phases[sky.moon.phase],
        illumination: sky.moon.illumination * 100,
        up: sky.moon.visible,
      }),
    ),
    line(
      snapshot.provenance.kind === 'none'
        ? m.moment.noWeather
        : m.moment.conditions({
            condition: weatherDescription(snapshot.weather.weatherCode, m),
            cloud: snapshot.weather.cloudCover,
          }),
      26,
      500,
      ink,
      22,
    ),
    line(
      m.moment.sentences([
        m.moment.provenance(snapshot.provenance),
        m.moment.method({ illustrated: style === 'illustrated' }),
      ]),
      20,
      400,
      soft,
      10,
    ),
    line(m.moment.attribution, 19, 400, faint, 0),
  ];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  let ctx = canvas.getContext('2d')!;
  const laidOut = lines.map((line) => {
    ctx.font = `${line.weight} ${line.size}px ${FONT}`;
    return { ...line, rows: wrap(ctx, line.text, width - PAD * 2) };
  });
  const panelH =
    PAD * 2 + laidOut.reduce((sum, line) => sum + line.rows.length * line.size * 1.3 + line.gap, 0) + 28;
  canvas.height = Math.ceil(skyH + panelH);
  ctx = canvas.getContext('2d')!;

  // The sky.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, skyH);
  ctx.clip();
  const unit = skyH / 1000;
  if (style === 'realistic' && capture) {
    ctx.drawImage(capture.image, left, top, coverW, coverH);
    if (horizon !== 'ridge') drawSilhouette(ctx, toCanvas, view.heading, horizon, sky.sunAltitude, skyH);
  } else
    drawIllustration(
      ctx,
      width,
      skyH,
      snapshot,
      toCanvas,
      horizon,
      { object: (object) => objectName(object, i18n), pattern: (id) => m.patterns[id] },
      FONT,
      landscapeArt,
    );
  const painted = style === 'illustrated' || !capture;
  if (painted) paintFinish(ctx, 0, 0, width, skyH, Math.round(instant.getTime() / 3600000));

  // The target ring, as the screen draws it over the subject.
  if (subject?.kind === 'object') {
    const object = findSkyObject(sky, subject.object.id);
    let ring: { x: number; y: number; r: number } | null = null;
    if (style === 'realistic' && capture?.target)
      ring = {
        x: left + capture.target.x * coverW,
        y: top + capture.target.y * coverH,
        r: capture.target.radius * coverH,
      };
    else if (object) {
      const p = toCanvas(object.altitude, object.azimuth);
      const disc = ((angularDiameter(object) / view.fov) * coverH) / 2;
      const drawn =
        style === 'illustrated' ? (object.kind === 'moon' ? 42 : object.kind === 'sun' ? 34 : 12) * unit : 0;
      if (p.front) ring = { x: p.x, y: p.y, r: Math.max(26 * unit, disc + 10 * unit, drawn + 12 * unit) };
    }
    if (ring && painted) {
      // Drawn by hand: two loose, slightly offset loops of soft chalk.
      ctx.strokeStyle = 'rgba(255,236,190,.85)';
      ctx.lineCap = 'round';
      for (const [dx, dy, grow, w] of [
        [0, 0, 1, 3.2],
        [1.5, -1, 1.08, 1.6],
      ]) {
        ctx.lineWidth = w * unit;
        ctx.beginPath();
        ctx.ellipse(
          ring.x + dx * unit,
          ring.y + dy * unit,
          ring.r * grow,
          ring.r * grow * 0.94,
          0.3,
          0.15,
          Math.PI * 2 + 0.45,
        );
        ctx.stroke();
      }
    } else if (ring) {
      ctx.strokeStyle = 'rgba(255,214,140,.95)';
      ctx.lineWidth = 3 * unit;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // The compass, as on screen; on a painting, a small paper disc ruled and lettered in ink.
  const inset = painted ? 82 : 74;
  const cx = width - inset,
    cy = inset;
  ctx.fillStyle = painted ? 'rgba(250,244,230,.9)' : 'rgba(8,15,28,.72)';
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fill();
  if (painted) {
    ctx.strokeStyle = 'rgba(39,48,92,.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, 40.5, 0.1, Math.PI * 2 + 0.25);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-heading * Math.PI) / 180);
  ctx.fillStyle = painted ? '#d85a40' : '#ff9f7a';
  ctx.beginPath();
  ctx.moveTo(0, -45);
  ctx.lineTo(7, -35);
  ctx.lineTo(-7, -35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = painted ? '#27305c' : '#eef5fc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = painted ? lettering(direction, 23, FONT, 700) : `700 22px ${FONT}`;
  ctx.fillText(direction, cx, cy - 5);
  ctx.font = painted ? lettering(`${heading}°`, 15, FONT, 600) : `500 15px ${FONT}`;
  ctx.fillText(`${heading}°`, cx, cy + 17);
  ctx.restore();

  // The panel; under a painted sky, the same sheet of paper the sky is painted on.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, skyH, width, canvas.height - skyH);
  if (painted) paintFinish(ctx, 0, skyH, width, canvas.height - skyH, 7, false);
  let y = skyH + PAD;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (const line of laidOut) {
    ctx.font = `${line.weight} ${line.size}px ${FONT}`;
    ctx.fillStyle = line.colour;
    for (const row of line.rows) {
      ctx.fillText(row, PAD, y);
      y += line.size * 1.3;
    }
    y += line.gap;
  }
  ctx.font = `600 18px ${FONT}`;
  ctx.fillStyle = faint;
  ctx.textAlign = 'right';
  ctx.fillText(site, width - PAD, canvas.height - PAD + 4);
  return canvas;
}

/** A scenery silhouette over the realistic sky: near black at night, a dark grey-green by day. */
function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  toCanvas: ToCanvas,
  heading: number,
  horizon: HorizonVariant,
  sunAltitude: number,
  height: number,
) {
  const day = Math.min(1, Math.max(0, (sunAltitude + 8) / 14));
  const shade = (night: number[], noon: number[]) =>
    `rgb(${night.map((v, i) => Math.round(v + (noon[i] - v) * day)).join(',')})`;
  const edge: { x: number; y: number }[] = [];
  for (let az = heading - 100; az <= heading + 100; az += HORIZON_STEP[horizon] / 5) {
    const p = toCanvas(horizonAltitude(horizon, az), az);
    if (p.front) edge.push(p);
  }
  if (edge.length < 2) return;
  ctx.fillStyle = horizon === 'sea' ? shade([6, 14, 28], [46, 92, 128]) : shade([5, 8, 13], [40, 52, 50]);
  ctx.beginPath();
  ctx.moveTo(edge[0].x, height + 10);
  for (const p of edge) ctx.lineTo(p.x, p.y);
  ctx.lineTo(edge[edge.length - 1].x, height + 10);
  ctx.closePath();
  ctx.fill();
}

let grainTile: HTMLCanvasElement | null = null;
/** A tile of paper grain: fine speckle and a few longer fibres, mid-grey around 128. */
function paperGrain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const size = 384;
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const ctx = tile.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const random = seededRandom(1234);
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (random() - 0.5) * 70;
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  ctx.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = random() * size,
      y = random() * size,
      a = random() * Math.PI,
      l = 4 + random() * 14;
    ctx.strokeStyle = random() < 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.12)';
    ctx.lineWidth = 0.6 + random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  grainTile = tile;
  return tile;
}

let washTile: HTMLCanvasElement | null = null;
/**
 * A tile of uneven pigment, as a wash dries on paper: smooth cloudy noise in three sizes, mid-grey
 * around 128, repeating at its edges. Enlarged over the painting it makes no area quite flat.
 */
function pigmentWash(): HTMLCanvasElement {
  if (washTile) return washTile;
  const size = 128;
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const ctx = tile.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const random = seededRandom(4321);
  const octaves = [4, 9, 23].map((cells) => ({
    cells,
    values: Array.from({ length: cells * cells }, random),
  }));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const weights = [0.55, 0.3, 0.15];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (let o = 0; o < octaves.length; o++) {
        const { cells, values } = octaves[o];
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const u = smooth(fx - x0);
        const w = smooth(fy - y0);
        const row = y0 * cells;
        const next = ((y0 + 1) % cells) * cells;
        const x1 = (x0 + 1) % cells;
        const a = values[row + x0];
        const b = values[row + x1];
        const c = values[next + x0];
        const d = values[next + x1];
        const top = a + (b - a) * u;
        const bottom = c + (d - c) * u;
        v += (top + (bottom - top) * w - 0.5) * weights[o];
      }
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 128 + v * 190;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  washTile = tile;
  return tile;
}

/** The painted area's outline: a rectangle whose edges wander, as a brush leaves them. */
function paintedEdge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
) {
  // Slow drift with a finer tremor, different on each side.
  const drift = noise1(seed + 99),
    tremor = noise1(seed + 199);
  const wander = (side: number, t: number) =>
    (drift(side * 61 + t / 90) - 0.5) * 7 + (tremor(side * 47 + t / 17) - 0.5) * 2.4;
  const corner = 12;
  ctx.moveTo(x + corner, y + wander(0, 0));
  for (let t = corner; t <= w - corner; t += 12) ctx.lineTo(x + t, y + wander(0, t));
  for (let t = corner; t <= h - corner; t += 12) ctx.lineTo(x + w + wander(1, t), y + t);
  for (let t = w - corner; t >= corner; t -= 12) ctx.lineTo(x + t, y + h + wander(2, t));
  for (let t = h - corner; t >= corner; t -= 12) ctx.lineTo(x + wander(3, t), y + t);
  ctx.closePath();
}

/** Width of the bare paper left around the painted sky. */
const MARGIN = 22;

/**
 * The finish that makes a painting of the illustrated sky: light that bleeds softly out of the
 * bright passages, uneven pigment, a soft vignette, a border of bare paper with a wandering painted
 * edge, and paper grain over all of it. `sky` false gives the paper only, for the text panel.
 */
function paintFinish(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  sky = true,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (sky) {
    // Diffusion: a small, smoothed copy of the painting laid back over it, so lights glow into
    // their surroundings and edges soften as they do in wet paint.
    const sw = Math.ceil(w / 14),
      sh = Math.ceil(h / 14);
    const small = document.createElement('canvas');
    small.width = sw;
    small.height = sh;
    const s = small.getContext('2d')!;
    s.imageSmoothingQuality = 'high';
    s.drawImage(ctx.canvas, x, y, w, h, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.14;
    ctx.drawImage(small, 0, 0, sw, sh, x, y, w, h);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.28;
    ctx.drawImage(small, 0, 0, sw, sh, x, y, w, h);
    // Uneven pigment at two sizes.
    const wash = pigmentWash();
    for (const [size, alpha, shift] of [
      [w * 1.1, 0.5, 0.13],
      [w * 0.36, 0.3, 0.41],
    ]) {
      ctx.globalAlpha = alpha;
      for (let ty = y - size * shift; ty < y + h; ty += size)
        for (let tx = x - size * shift; tx < x + w; tx += size) ctx.drawImage(wash, tx, ty, size, size);
    }
    ctx.globalAlpha = 1;
    const random = seededRandom(seed);
    for (let i = 0; i < 6; i++) {
      const bx = x + random() * w,
        by = y + random() * h,
        r = (0.15 + random() * 0.3) * Math.max(w, h);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      const warm = random() < 0.5;
      g.addColorStop(0, warm ? 'rgba(255,214,170,.2)' : 'rgba(120,150,230,.2)');
      g.addColorStop(1, 'rgba(128,128,128,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
    const v = ctx.createRadialGradient(
      x + w / 2,
      y + h * 0.45,
      Math.min(w, h) * 0.35,
      x + w / 2,
      y + h / 2,
      Math.max(w, h) * 0.78,
    );
    v.addColorStop(0, 'rgba(20,16,40,0)');
    v.addColorStop(1, 'rgba(20,16,40,.26)');
    ctx.fillStyle = v;
    ctx.fillRect(x, y, w, h);
    // Bare paper around the painting; pigment gathers in a slightly darker line at its edge.
    const edge = () => {
      ctx.beginPath();
      paintedEdge(ctx, x + MARGIN, y + MARGIN, w - MARGIN * 2, h - MARGIN - 14, seed);
    };
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = 'rgba(70,74,120,.22)';
    ctx.lineWidth = 5;
    edge();
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = PAPER;
    edge();
    ctx.rect(x, y, w, h);
    ctx.fill('evenodd');
  }
  const pattern = ctx.createPattern(paperGrain(), 'repeat');
  if (pattern) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = sky ? 0.22 : 0.3;
    ctx.fillStyle = pattern;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}
