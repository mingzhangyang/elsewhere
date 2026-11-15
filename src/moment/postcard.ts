import type { I18n } from '../i18n';
import type { MomentSnapshot } from '../lib/moment';
import type { SkyCapture } from '../renderer/createSkyRenderer';
import { angularDiameter, findSkyObject } from '../lib/exploration';
import { isDeviceLocation } from '../lib/locations';
import { objectName, placeLabel } from '../i18n/names';
import { weatherDescription } from '../lib/weatherText';
import { createProjection } from './projection';
import { drawIllustration, type ToCanvas } from './illustration';
import { HORIZON_STEP, horizonAltitude, type HorizonVariant } from './scenery';
import { seededRandom } from '../lib/random';

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

/** Height of the sky area for a view `aspect` wide over high: as tall as the view, within limits. */
export function skyHeight(aspect: number): number {
  return Math.round(Math.min(1500, Math.max(800, POSTCARD_WIDTH / aspect)));
}

/** Chinese characters and punctuation, which may break anywhere (as character ranges for a RegExp). */
const WIDE = [
  [0x2e80, 0x9fff],
  [0x3000, 0x303f],
  [0xff00, 0xffef],
]
  .map(([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`)
  .join('');

/** Splits text into lines no wider than `width`, between words or, in Chinese, between characters. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const wide = WIDE;
  const tokens = text.match(new RegExp(`[${wide}]|[^\\s${wide}]+|\\s+`, 'g')) ?? [];
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
  const lines: TextLine[] = [
    { text: place.name, size: 56, weight: 700, colour: ink, gap: 8 },
    ...(place.country ? [{ text: place.country, size: 26, weight: 500, colour: soft, gap: 14 }] : []),
    {
      text:
        m.moment.when({
          date: m.f.date(instant, zone),
          time: m.f.time(instant, zone),
          zone: m.f.zone(zone, instant),
        }) + (style === 'illustrated' ? ` · ${m.moment.illustration}` : ''),
      size: 28,
      weight: 600,
      colour: ink,
      gap: 22,
    },
    {
      text: subjectName
        ? m.moment.subject({ name: subjectName, direction, degrees: heading })
        : m.moment.facing({ direction, degrees: heading }),
      size: 26,
      weight: 500,
      colour: ink,
      gap: 8,
    },
    {
      text: m.moment.moon({
        phase: m.phases[sky.moon.phase],
        illumination: sky.moon.illumination * 100,
        up: sky.moon.visible,
      }),
      size: 26,
      weight: 500,
      colour: ink,
      gap: 8,
    },
    {
      text:
        snapshot.provenance.kind === 'none'
          ? m.moment.noWeather
          : m.moment.conditions({
              condition: weatherDescription(snapshot.weather.weatherCode, m),
              cloud: snapshot.weather.cloudCover,
            }),
      size: 26,
      weight: 500,
      colour: ink,
      gap: 22,
    },
    {
      text: m.moment.sentences([
        m.moment.provenance(snapshot.provenance),
        m.moment.method({ illustrated: style === 'illustrated' }),
      ]),
      size: 20,
      weight: 400,
      colour: soft,
      gap: 10,
    },
    { text: m.moment.attribution, size: 19, weight: 400, colour: faint, gap: 0 },
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

  // The compass, as on screen.
  const cx = width - 74,
    cy = 74;
  ctx.fillStyle = painted ? 'rgba(255,248,232,.88)' : 'rgba(8,15,28,.72)';
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-heading * Math.PI) / 180);
  ctx.fillStyle = painted ? '#e0664a' : '#ff9f7a';
  ctx.beginPath();
  ctx.moveTo(0, -45);
  ctx.lineTo(7, -35);
  ctx.lineTo(-7, -35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = painted ? '#24305a' : '#eef5fc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(direction, cx, cy - 4);
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText(`${heading}°`, cx, cy + 18);
  ctx.restore();

  // The panel; under a painted sky, a sheet of paper with a softly deckled top edge.
  ctx.fillStyle = '#f6f1e7';
  if (painted) {
    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    for (let x = 0; x <= width; x += 6)
      ctx.lineTo(x, skyH - 3 + Math.sin(x * 0.045) * 1.6 + Math.sin(x * 0.17 + 1) * 1.1);
    ctx.lineTo(width, canvas.height);
    ctx.closePath();
    ctx.fill();
    paintFinish(ctx, 0, skyH - 6, width, canvas.height - skyH + 6, 7, false);
  } else ctx.fillRect(0, skyH, width, canvas.height - skyH);
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

/**
 * The finish that makes a painting of the illustrated sky: uneven watercolour blooms, a soft
 * vignette and paper grain. `sky` false gives the paper only, for the text panel.
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
    const random = seededRandom(seed);
    ctx.globalCompositeOperation = 'soft-light';
    for (let i = 0; i < 9; i++) {
      const bx = x + random() * w,
        by = y + random() * h,
        r = (0.15 + random() * 0.3) * Math.max(w, h);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      const warm = random() < 0.5;
      g.addColorStop(0, warm ? 'rgba(255,214,170,.22)' : 'rgba(120,150,230,.22)');
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
    v.addColorStop(1, 'rgba(20,16,40,.32)');
    ctx.fillStyle = v;
    ctx.fillRect(x, y, w, h);
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
