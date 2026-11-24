import type { I18n } from '../i18n';
import type { MomentSnapshot } from '../lib/moment';
import type { SkyCapture } from '../renderer/createSkyRenderer';
import { angularDiameter, findSkyObject } from '../lib/exploration';
import { isDeviceLocation } from '../lib/locations';
import { objectName, placeLabel } from '../i18n/names';
import { weatherDescription } from '../lib/weatherText';
import { createCoverProjection } from './projection';
import { lettering, type ToCanvas } from './illustration';
import { paintIllustrationPanel } from '../../packages/sky-engine/src/moment/panel';
import { paintFinish, PAPER } from '../../packages/sky-engine/src/moment/paintFinish';
import { HORIZON_STEP, horizonAltitude, type HorizonVariant } from './scenery';
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
  const { coverW, coverH, left, top, toCanvas } = createCoverProjection(view, snapshot.aspect, width, skyH);

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
  } else {
    paintIllustrationPanel(ctx, width, skyH, snapshot, {
      landscape: horizon,
      text: { object: (object) => objectName(object, i18n), pattern: (id) => m.patterns[id] },
      font: FONT,
      landscapeArt,
    });
  }
  const painted = style === 'illustrated' || !capture;

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
