import type {
  IllustrationComposition,
  IllustrationPattern,
  LayerSettings,
  MomentSnapshot,
} from '../contracts';
import { CONSTELLATIONS } from '../domain/stars';
import {
  buildSkyChartSnapshot,
  type SkyChartSnapshot,
  type SkyChartSnapshotObject,
} from '../domain/skyChartSnapshot';
import { prepareIllustrationScene } from '../render';
import { framePattern } from './framing';
import { createCoverProjection } from './projection';
import {
  chartDrawObject,
  drawBody,
  paintEngravedRing,
  paintSkyDisc,
  SKY_CHART_PALETTES,
  type SkyArtworkTheme,
  type SkyChartPalette,
} from './chartPaint';
import { requireImageSize, resetImageCanvas } from './imageCanvas';
import { invalidInput } from '../errors';
import { validateInstant } from '../domain/time';
import type { RenderCanvas, RenderContext2D } from './scratchCanvas';

export interface SkyChartOptions {
  theme?: SkyArtworkTheme;
  limitingMagnitude?: number;
  locale?: 'en' | 'zh-Hans';
}

export interface MinimalSkyMapOptions extends SkyChartOptions {
  composition?: IllustrationComposition;
  patterns?: readonly IllustrationPattern[];
  layers?: Partial<LayerSettings>;
}

function paletteFor(options: SkyChartOptions): SkyChartPalette {
  const theme = options.theme ?? 'midnight';
  if (theme !== 'midnight' && theme !== 'paper') throw invalidInput('Unknown chart theme.');
  if (options.locale !== undefined && options.locale !== 'en' && options.locale !== 'zh-Hans') {
    throw invalidInput('Unsupported chart locale.');
  }
  return SKY_CHART_PALETTES[theme];
}

function chartSnapshot(scene: MomentSnapshot, limit?: number): SkyChartSnapshot {
  return buildSkyChartSnapshot(
    {
      time: { kind: 'utc', utc: Date.prototype.toISOString.call(validateInstant(scene.instant)) },
      location: {
        ...scene.location,
        name: scene.location.name.trim() || 'Unspecified',
        country: scene.location.country.trim() || 'Unspecified',
      },
      limitingMagnitude: limit,
    },
    scene.sky,
  );
}

function credit(
  ctx: RenderContext2D,
  width: number,
  height: number,
  palette: SkyChartPalette,
  options: SkyChartOptions,
  daylight: boolean,
  unit: number,
): void {
  const zh = options.locale === 'zh-Hans';
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, Math.round(height - 57 * unit), width, 57 * unit + 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${15 * unit}px system-ui, sans-serif`;
  ctx.fillStyle = palette.metadata;
  ctx.fillText(
    zh ? '计算天体位置 · 并非实际目视可见性' : 'Calculated positions · not observed visibility',
    width / 2,
    height - 44 * unit,
    width * 0.94,
  );
  if (daylight) {
    ctx.fillText(
      zh ? '请勿直视太阳' : 'Never look directly at the Sun',
      width / 2,
      height - 27 * unit,
      width * 0.94,
    );
  }
  ctx.fillStyle = palette.credit;
  ctx.font = `${12 * unit}px system-ui, sans-serif`;
  ctx.fillText(
    'HYG v4.1 · David Nash / Astronexus · CC BY-SA 4.0',
    width / 2,
    height - 10 * unit,
    width * 0.94,
  );
}

/** All-sky position diagram. The established chart selection is independent of weather/daylight. */
export function renderSkyChart(
  canvas: RenderCanvas,
  scene: MomentSnapshot,
  options: SkyChartOptions = {},
): SkyChartSnapshot {
  const { width, height } = requireImageSize(canvas, 160);
  const palette = paletteFor(options);
  const snapshot = chartSnapshot(scene, options.limitingMagnitude);
  const ctx = resetImageCanvas(canvas);
  const unit = Math.min(width, height) / 1000;
  const w = width / unit;
  const h = height / unit;
  const disc = { cx: w / 2, cy: (h - 57) / 2, radius: 408 };
  ctx.save();
  try {
    ctx.scale(unit, unit);
    const wash = ctx.createLinearGradient(0, 0, 0, h);
    wash.addColorStop(0, palette.background);
    wash.addColorStop(1, palette.backgroundBottom);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    paintSkyDisc(ctx, palette, disc.cx, disc.cy, disc.radius);
    ctx.save();
    try {
      ctx.beginPath();
      ctx.arc(disc.cx, disc.cy, disc.radius, 0, 2 * Math.PI);
      ctx.clip();
      for (const object of snapshot.objects) drawBody(ctx, chartDrawObject(object, disc), palette);
    } finally {
      ctx.restore();
    }
    paintEngravedRing(ctx, palette, disc.cx, disc.cy, disc.radius);
    ctx.fillStyle = palette.subtle;
    ctx.font = '500 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const zh = options.locale === 'zh-Hans';
    for (const [text, x, y] of [
      [zh ? '北' : 'N', disc.cx, disc.cy - 450],
      [zh ? '东' : 'E', disc.cx - 450, disc.cy],
      [zh ? '南' : 'S', disc.cx, disc.cy + 450],
      [zh ? '西' : 'W', disc.cx + 450, disc.cy],
    ] as const) {
      ctx.fillText(text, x, y);
    }
    credit(ctx, w, h, palette, options, scene.sky.sunAltitude >= 0, 1);
  } finally {
    ctx.restore();
  }
  return snapshot;
}

type MapPoint = { object: SkyChartSnapshotObject; x: number; y: number; radius: number };

function mapPoints(
  scene: MomentSnapshot,
  objects: readonly SkyChartSnapshotObject[],
  width: number,
  height: number,
  unit: number,
): MapPoint[] {
  const { toCanvas } = createCoverProjection(scene.view, scene.aspect, width, height);
  return objects.flatMap((object) => {
    const point = toCanvas(object.altitude, object.azimuth);
    if (!point.front || point.x < 0 || point.x > width || point.y < 0 || point.y > height) return [];
    const radius =
      object.kind === 'star' ? Math.max(1, 3.5 - object.magnitude * 0.4) : object.kind === 'planet' ? 4 : 6;
    return [{ object, x: point.x, y: point.y, radius: radius * unit }];
  });
}

/** A clean perspective star diagram: no invented background stars, terrain or atmosphere. */
export function renderMinimalSkyMap(
  canvas: RenderCanvas,
  scene: MomentSnapshot,
  options: MinimalSkyMapOptions = {},
): MomentSnapshot {
  const { width, height } = requireImageSize(canvas, 160);
  const palette = paletteFor(options);
  const unit = Math.min(width, height) / 800;
  const mapHeight = Math.round(height - 57 * unit);
  const snapshot = chartSnapshot(scene, options.limitingMagnitude ?? 4.5);
  const mode = options.composition ?? 'current';
  const patterns = options.patterns ?? CONSTELLATIONS;
  const prepared = prepareIllustrationScene(scene, width, mapHeight, {
    ...options,
    composition: typeof mode === 'object' ? 'current' : mode,
  });
  let framed = prepared;
  if (typeof mode === 'object') {
    if (!mode || typeof mode.pattern !== 'string') throw invalidInput('Invalid illustration composition.');
    const pattern = patterns.find((entry) => entry.id === mode.pattern);
    if (!pattern) throw invalidInput('Unknown illustration pattern: ' + mode.pattern);
    const selected = new Set(
      snapshot.objects.filter((object) => object.kind === 'star').map((object) => object.id),
    );
    const lines = pattern.lines.filter(([a, b]) => selected.has(a) && selected.has(b));
    framed = framePattern(prepared, lines, width / mapHeight, true);
  }
  const points = mapPoints(framed, snapshot.objects, width, mapHeight, unit);
  const ctx = resetImageCanvas(canvas);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(0, 0, width, mapHeight);
    ctx.clip();
    // The pattern contract uses only selected catalog stars, regardless of dot visibility.
    const starsById = new Map(
      points.filter((point) => point.object.kind === 'star').map((point) => [point.object.id, point]),
    );
    if (framed.layers.lines) {
      ctx.strokeStyle = palette.accentSoft;
      ctx.lineWidth = Math.max(0.7, unit);
      ctx.beginPath();
      for (const pattern of patterns) {
        for (const [a, b] of pattern.lines) {
          const start = starsById.get(a);
          const end = starsById.get(b);
          if (!start || !end) continue;
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
        }
      }
      ctx.stroke();
    }
    for (const { object, x, y, radius } of points) {
      ctx.fillStyle =
        object.kind === 'sun'
          ? palette.sun
          : object.kind === 'moon'
            ? palette.moon
            : object.kind === 'planet'
              ? palette.planet
              : palette.star;
      if (object.kind !== 'star' || framed.layers.stars) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
      }
      if (framed.layers.labels && (object.kind !== 'star' || (object.name && object.magnitude <= 1.5))) {
        ctx.font = `${13 * unit}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const name =
          'name' in object
            ? object.name
            : object.kind === 'moon'
              ? options.locale === 'zh-Hans'
                ? '月亮'
                : 'Moon'
              : options.locale === 'zh-Hans'
                ? '太阳'
                : 'Sun';
        ctx.fillText(name, x + radius + 4 * unit, y);
      }
    }
  } finally {
    ctx.restore();
  }
  credit(ctx, width, height, palette, options, scene.sky.sunAltitude >= 0, unit);
  return framed;
}
