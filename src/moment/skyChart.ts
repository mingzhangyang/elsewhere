import type { SkyChartSnapshotObject } from '../domain/skyChartSnapshot';
import type { SkyArtwork, SkyArtworkTheme } from '../lib/skyArtwork';

export const SKY_CHART_ARTWORK_SIZE = Object.freeze({ width: 1200, height: 1500 });
const TWO_PI = 2 * Math.PI;
const GRAPH = Object.freeze({ cx: 600, cy: 498, radius: 418 });

export interface SkyChartFonts {
  readonly status: 'ready' | 'fallback';
  /** Use the identical resource when measuring and drawing; fallback requires a fresh layout. */
  readonly family: 'system-ui' | 'sans-serif';
}

export interface SkyChartFontSet {
  readonly ready: Promise<unknown>;
  check(font: string, text?: string): boolean;
}

/** Lazy: no document or FontFaceSet access until invoked. No font fetch at module import. */
export async function prepareSkyChartFonts(fontSet?: SkyChartFontSet): Promise<SkyChartFonts> {
  const selected = fontSet ?? (typeof document !== 'undefined' ? document.fonts : undefined);
  if (selected) {
    try {
      await selected.ready;
      if (selected.check('400 20px system-ui', '星空 Stars')) {
        return Object.freeze({ status: 'ready' as const, family: 'system-ui' as const });
      }
    } catch {
      // Even on a rejected font resource, the generic browser font is available.
    }
  }
  return Object.freeze({ status: 'fallback' as const, family: 'sans-serif' as const });
}

export interface SkyChartTextMetrics {
  /** Return width in design pixels for the exact font string. */
  measure(text: string, font: string): number;
}

/** A Canvas 2D metric adapter; measures with the actual chosen rendering context. */
export function canvasSkyChartTextMetrics(ctx: CanvasRenderingContext2D): SkyChartTextMetrics {
  return {
    measure(text, font) {
      ctx.save();
      try {
        ctx.font = font;
        return ctx.measureText(text).width;
      } finally {
        ctx.restore();
      }
    },
  };
}

export type SkyChartTextRole = 'title' | 'metadata' | 'subtle' | 'note' | 'credit';

export interface SkyChartTextBlock {
  readonly role: SkyChartTextRole;
  readonly top: number;
  readonly lineHeight: number;
  readonly font: string;
  readonly lines: readonly string[];
}

export interface SkyChartDrawObject {
  readonly id: string;
  readonly kind: SkyChartSnapshotObject['kind'];
  /** Copy of the SM2-C unit-disc center; kept unrounded. */
  readonly x: number;
  readonly y: number;
  readonly px: number;
  readonly py: number;
  readonly radius: number;
  readonly magnitude: number | null;
  readonly colorIndex: number | null;
}

export interface SkyChartArtworkLayout {
  readonly artwork: SkyArtwork;
  readonly fonts: SkyChartFonts;
  readonly width: 1200;
  readonly height: 1500;
  readonly disc: Readonly<{ cx: number; cy: number; radius: number }>;
  readonly compass: readonly Readonly<{ text: string; x: number; y: number }>[];
  readonly blocks: readonly SkyChartTextBlock[];
  readonly objects: readonly SkyChartDrawObject[];
}

export class SkyChartLayoutError extends RangeError {
  constructor(label: string) {
    super('Artwork text cannot fit the fixed layout: ' + label);
    this.name = 'SkyChartLayoutError';
  }
}

function measured(metrics: SkyChartTextMetrics, text: string, font: string): number {
  const width = metrics.measure(text, font);
  if (!Number.isFinite(width) || width < 0 || (text.length > 0 && width === 0)) {
    throw new SkyChartLayoutError('Invalid or unready font measurements');
  }
  return width;
}

/** Prefer word breaks, then graphemes for continuous Chinese text or long tokens. */
function wrapText(
  text: string,
  locale: SkyArtwork['locale'],
  font: string,
  width: number,
  maxLines: number,
  metrics: SkyChartTextMetrics,
  label: string,
): readonly string[] {
  if (!text) return Object.freeze([]);
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
  };
  const words = new Intl.Segmenter(locale, { granularity: 'word' }).segment(text);
  for (const { segment } of words) {
    if (measured(metrics, line + segment, font) <= width) {
      line += segment;
      continue;
    }
    flush();
    const word = segment.trimStart();
    if (!word) continue;
    if (measured(metrics, word, font) <= width) {
      line = word;
      continue;
    }
    // A single unbreakable word/Chinese run is split at visible grapheme boundaries.
    for (const { segment: grapheme } of new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(word)) {
      if (measured(metrics, line + grapheme, font) > width) {
        if (!line) throw new SkyChartLayoutError(label + ' glyph exceeds available width');
        flush();
      }
      line += grapheme;
    }
  }
  flush();
  if (lines.length > maxLines) throw new SkyChartLayoutError(label + ' exceeds ' + maxLines + ' lines');
  return Object.freeze(lines);
}

function starRadius(magnitude: number): number {
  return Math.max(1.25, Math.min(4.5, 1.5 + (6 - magnitude) * 0.38));
}

/**
 * Pure in the supplied metric function; measures all content before any canvas paint.
 * The palette is deliberately absent: both themes share exactly the same positions/layout.
 */
export function layoutSkyChartArtwork(
  artwork: SkyArtwork,
  metrics: SkyChartTextMetrics,
  fonts: SkyChartFonts,
): SkyChartArtworkLayout {
  if (!artwork || artwork.formatVersion !== 1 || !metrics || typeof metrics.measure !== 'function') {
    throw new TypeError('A validated artwork and a text metric adapter are required.');
  }
  if (
    !fonts ||
    (fonts.status !== 'ready' && fonts.status !== 'fallback') ||
    (fonts.family !== 'system-ui' && fonts.family !== 'sans-serif')
  ) {
    throw new TypeError('Prepared font resources are required.');
  }
  const text = (
    value: string | null,
    label: string,
    role: SkyChartTextRole,
    top: number,
    fontSize: number,
    weight: number,
    lineHeight: number,
    maxLines: number,
  ): SkyChartTextBlock => {
    const font = weight + ' ' + fontSize + 'px ' + fonts.family;
    const lines = wrapText(value ?? '', artwork.locale, font, 1052, maxLines, metrics, label);
    return Object.freeze({ role, top, lineHeight, font, lines });
  };
  const blocks = Object.freeze([
    text(artwork.title, 'title', 'title', 985, 43, 600, 49, 2),
    text(artwork.location, 'location', 'metadata', 1090, 28, 500, 32, 2),
    text(artwork.dateTime, 'date/time', 'metadata', 1164, 26, 500, 32, 1),
    text(artwork.timeNote, 'time intent', 'subtle', 1207, 20, 400, 27, 1),
    text(artwork.phrase, 'phrase', 'metadata', 1246, 23, 400, 32, 2),
    text(artwork.scienceNote, 'scientific note', 'note', 1332, 17, 400, 23, 2),
    text(artwork.daylightNote, 'daytime note', 'note', 1385, 16, 400, 22, 2),
    text(artwork.starCredit, 'HYG attribution', 'credit', 1433, 15, 400, 20, 1),
    text(artwork.astronomyCredit, 'astronomy attribution', 'credit', 1463, 15, 400, 20, 1),
  ]);
  const slots = [
    [985, 1083], [1090, 1154], [1164, 1196], [1207, 1234],
    [1246, 1310], [1332, 1378], [1385, 1429], [1433, 1453], [1463, 1483],
  ] as const;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.top !== slots[i][0] || block.top + block.lines.length * block.lineHeight > slots[i][1]) {
      throw new SkyChartLayoutError('Text section overlap');
    }
  }
  const objects = Object.freeze(artwork.snapshot.objects.map((object): SkyChartDrawObject => {
    // SM2-C already did all altitude/azimuth computation, selection and projection.
    // This is ONLY a linear normalization-to-canvas transform.
    const px = GRAPH.cx + object.x * GRAPH.radius;
    const py = GRAPH.cy + object.y * GRAPH.radius;
    if (!Number.isFinite(px) || !Number.isFinite(py) || Math.hypot(object.x, object.y) > 1 + 1e-12) {
      throw new RangeError('Invalid drawable sky chart coordinate.');
    }
    return Object.freeze({
      id: object.id,
      kind: object.kind,
      x: object.x,
      y: object.y,
      px,
      py,
      radius: object.kind === 'sun' ? 9 : object.kind === 'moon' ? 8 :
        object.kind === 'planet' ? 5.1 : starRadius(object.magnitude),
      magnitude: 'magnitude' in object ? object.magnitude : null,
      colorIndex: object.kind === 'star' ? object.colorIndex : null,
    });
  }));
  const zh = artwork.locale === 'zh-Hans';
  const compass = Object.freeze([
    Object.freeze({ text: zh ? '北' : 'N', x: GRAPH.cx, y: 55 }),
    Object.freeze({ text: zh ? '东' : 'E', x: 143, y: GRAPH.cy }),
    Object.freeze({ text: zh ? '南' : 'S', x: GRAPH.cx, y: 950 }),
    Object.freeze({ text: zh ? '西' : 'W', x: 1057, y: GRAPH.cy }),
  ]);
  return Object.freeze({
    artwork,
    fonts,
    width: 1200 as const,
    height: 1500 as const,
    disc: GRAPH,
    compass,
    blocks,
    objects,
  });
}

export interface SkyChartPalette {
  readonly background: string;
  readonly disc: string;
  readonly grid: string;
  readonly rim: string;
  readonly title: string;
  readonly metadata: string;
  readonly subtle: string;
  readonly note: string;
  readonly credit: string;
  readonly star: string;
  readonly starBlue: string;
  readonly starWarm: string;
  readonly sun: string;
  readonly moon: string;
  readonly planet: string;
}

export const SKY_CHART_PALETTES: Readonly<Record<SkyArtworkTheme, Readonly<SkyChartPalette>>> = Object.freeze({
  midnight: Object.freeze({
    background: '#0b152c',
    disc: '#112443',
    grid: '#334b70',
    rim: '#91a9c6',
    title: '#f4efe6',
    metadata: '#e8e4dc',
    subtle: '#c6d3e4',
    note: '#bbc9db',
    credit: '#a8b9d2',
    star: '#f8f4e9',
    starBlue: '#c9ddfa',
    starWarm: '#f3cfac',
    sun: '#f6cc85',
    moon: '#eee6d6',
    planet: '#c7dfd7',
  }),
  paper: Object.freeze({
    background: '#f5f0e6',
    disc: '#ebe6d9',
    grid: '#c8bdad',
    rim: '#6e7a8a',
    title: '#26364c',
    metadata: '#304259',
    subtle: '#4d5c6c',
    note: '#445466',
    credit: '#4c5a6b',
    star: '#3e526e',
    starBlue: '#365e86',
    starWarm: '#956245',
    sun: '#b47a35',
    moon: '#5c6674',
    planet: '#356976',
  }),
});

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.fill();
}

function drawBody(ctx: CanvasRenderingContext2D, object: SkyChartDrawObject, palette: SkyChartPalette): void {
  const { px, py, radius } = object;
  if (object.kind === 'star') {
    ctx.fillStyle = object.colorIndex === null
      ? palette.star
      : object.colorIndex < 0.25 ? palette.starBlue : object.colorIndex > 1.2 ? palette.starWarm : palette.star;
    ctx.globalAlpha = Math.max(0.62, Math.min(1, 0.72 + (6 - (object.magnitude ?? 6)) * 0.035));
    dot(ctx, px, py, radius);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = object.kind === 'sun' ? palette.sun : object.kind === 'moon' ? palette.moon : palette.planet;
  dot(ctx, px, py, radius);
  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = object.kind === 'planet' ? 1.4 : 1.9;
  ctx.beginPath();
  ctx.arc(px, py, radius + (object.kind === 'planet' ? 3.1 : 3.8), 0, TWO_PI);
  ctx.stroke();
  if (object.kind === 'moon') {
    // Orientation-neutral Moon symbol. Illumination is retained by the snapshot,
    // but S06 projected bright-limb rotation is NOT solved in SM3-A.
    ctx.fillStyle = palette.disc;
    dot(ctx, px, py, 1.25);
  }
}

/**
 * Vector Canvas 2D paint at an explicit 4:5 output size. Never calls astronomy,
 * selection, projection, font loading, weather, camera or Date.now.
 * Does not create blobs, URLs, downloads or browser UI (reserved for SM3-B/C).
 */
export function drawSkyChartArtwork(
  ctx: CanvasRenderingContext2D,
  layout: SkyChartArtworkLayout,
  fonts: SkyChartFonts,
): void {
  if (!ctx || !ctx.canvas || !layout || !layout.artwork || !fonts) {
    throw new TypeError('Canvas, layout and font resources are required.');
  }
  if (fonts !== layout.fonts) {
    throw new TypeError('Font resources changed after layout; measure and layout again.');
  }
  const { width, height } = ctx.canvas;
  if (
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
    width <= 0 || height <= 0 || width * 5 !== height * 4
  ) {
    throw new RangeError('Canvas output must have positive integer 4:5 dimensions.');
  }
  const palette = SKY_CHART_PALETTES[layout.artwork.theme];
  if (!palette) throw new TypeError('Unsupported sky chart artwork palette.');
  ctx.save();
  try {
    ctx.scale(width / layout.width, height / layout.height);
    ctx.clearRect(0, 0, layout.width, layout.height);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, layout.width, layout.height);
    const { cx, cy, radius } = layout.disc;
    ctx.fillStyle = palette.disc;
    dot(ctx, cx, cy, radius);
    ctx.save();
    try {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TWO_PI);
      ctx.clip();
      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1.35;
      for (const portion of [1 / 3, 2 / 3]) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * portion, 0, TWO_PI);
        ctx.stroke();
      }
      for (const object of layout.objects) drawBody(ctx, object, palette);
    } finally {
      ctx.restore();
    }
    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TWO_PI);
    ctx.stroke();
    ctx.font = '600 22px ' + fonts.family;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = palette.subtle;
    for (const direction of layout.compass) ctx.fillText(direction.text, direction.x, direction.y);
    ctx.textBaseline = 'top';
    for (const block of layout.blocks) {
      ctx.font = block.font;
      ctx.fillStyle = palette[block.role];
      for (let i = 0; i < block.lines.length; i++) {
        ctx.fillText(block.lines[i], 600, block.top + i * block.lineHeight);
      }
    }
  } finally {
    ctx.restore();
  }
}
