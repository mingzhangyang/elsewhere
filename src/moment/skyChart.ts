import type { SkyArtwork } from '../lib/skyArtwork';
import {
  chartDrawObject,
  drawBody,
  paintEngravedRing,
  paintSkyDisc,
  SKY_CHART_PALETTES,
  type SkyChartDrawObject,
  type SkyChartPalette,
} from '../../packages/sky-engine/src/moment/chartPaint';

export {
  SKY_CHART_PALETTES,
  type SkyChartDrawObject,
  type SkyChartPalette,
} from '../../packages/sky-engine/src/moment/chartPaint';

export const SKY_CHART_ARTWORK_SIZE = Object.freeze({ width: 1200, height: 1500 });
const TWO_PI = 2 * Math.PI;
const GRAPH = Object.freeze({ cx: 600, cy: 498, radius: 418 });

export interface SkyChartFonts {
  readonly status: 'ready' | 'fallback';
  /** Use the identical resource when measuring and drawing; fallback requires a fresh layout. */
  readonly family: 'system-ui' | 'sans-serif';
  /** Optional handwriting accent loaded only for keepsake generation. */
  readonly handwriting?: 'caveat' | 'native';
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
      // InkScribe's Caveat handwriting accent is imported ONLY when an actual browser
      // prepares a keepsake. It is never part of explorer startup and only the
      // Latin 400 subset is emitted. The Chinese phrase uses local KaiTi stacks
      // rather than shipping megabytes of CJK font shards.
      let handwriting: 'caveat' | 'native' = 'native';
      if (!fontSet && typeof document !== 'undefined') {
        try {
          await import('@fontsource/caveat/latin-400.css');
          const faces = await document.fonts.load('400 26px "Caveat"', 'The stars remember');
          if (faces.some((face) => face.family === 'Caveat' && face.status === 'loaded')) {
            handwriting = 'caveat';
          }
        } catch {
          // Keep the serif title and native handwritten fallback; measure afresh.
        }
      }
      await selected.ready;
      // The chosen CSS stack must be settled before measuring and painting.
      if (
        selected.check('400 20px system-ui', '星空 Stars') &&
        selected.check('400 52px Georgia, "Times New Roman", serif', 'The sky remembers') &&
        selected.check('400 52px "Songti SC", "Noto Serif CJK SC", "SimSun", serif', '星光记得')
      ) {
        return fontSet
          ? Object.freeze({ status: 'ready' as const, family: 'system-ui' as const })
          : Object.freeze({ status: 'ready' as const, family: 'system-ui' as const, handwriting });
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
    for (const { segment: grapheme } of new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(
      word,
    )) {
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
    const family =
      label === 'phrase'
        ? fonts.status === 'fallback'
          ? 'serif'
          : artwork.locale === 'zh-Hans'
            ? '"Long Cang", "Kaiti SC", "STKaiti", "KaiTi", serif'
            : fonts.handwriting === 'caveat'
              ? '"Caveat", "Bradley Hand", cursive'
              : '"Bradley Hand", "Segoe Print", cursive'
        : role === 'title'
          ? fonts.status === 'fallback'
            ? 'serif'
            : artwork.locale === 'zh-Hans'
              ? '"Songti SC", "Noto Serif CJK SC", "SimSun", serif'
              : 'Georgia, "Times New Roman", serif'
          : fonts.family;
    const style = label === 'phrase' && artwork.locale === 'en' && !fonts.handwriting ? 'italic ' : '';
    const font = style + weight + ' ' + fontSize + 'px ' + family;
    const lines = wrapText(value ?? '', artwork.locale, font, 1052, maxLines, metrics, label);
    return Object.freeze({ role, top, lineHeight, font, lines });
  };
  const blocks = Object.freeze([
    text(artwork.title, 'title', 'title', 972, 52, 400, 58, 2),
    text(artwork.location, 'location', 'metadata', 1093, 27, 500, 32, 2),
    text(artwork.dateTime, 'date/time', 'metadata', 1164, 24, 400, 32, 1),
    text(artwork.timeNote, 'time intent', 'subtle', 1206, 19, 400, 26, 1),
    text(artwork.phrase, 'phrase', 'metadata', 1248, 26, 400, 32, 2),
    text(artwork.scienceNote, 'scientific note', 'note', 1331, 17, 400, 22, 2),
    text(artwork.daylightNote, 'daytime note', 'note', 1381, 16, 400, 21, 2),
    text(artwork.starCredit, 'HYG attribution', 'credit', 1428, 15, 400, 20, 1),
    text(artwork.astronomyCredit, 'astronomy attribution', 'credit', 1453, 15, 400, 20, 1),
  ]);
  const slots = [
    [972, 1088],
    [1093, 1157],
    [1164, 1196],
    [1206, 1232],
    [1248, 1312],
    [1331, 1375],
    [1381, 1423],
    [1428, 1448],
    [1453, 1473],
  ] as const;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.top !== slots[i][0] || block.top + block.lines.length * block.lineHeight > slots[i][1]) {
      throw new SkyChartLayoutError('Text section overlap');
    }
  }
  const objects = Object.freeze(artwork.snapshot.objects.map((object) => chartDrawObject(object, GRAPH)));
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

/**
 * The colored washes and engraved border are editorial decoration, NOT a
 * computed Milky Way, a weather simulation, or additional celestial bodies.
 * All celestial dots and halos are anchored to actual SM2-C objects only.
 */
function paintArtworkGround(ctx: CanvasRenderingContext2D, palette: SkyChartPalette): void {
  const wash = ctx.createLinearGradient(0, 0, 0, 1500);
  wash.addColorStop(0, palette.background);
  wash.addColorStop(1, palette.backgroundBottom);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 1200, 1500);

  const ambient = ctx.createRadialGradient(670, 560, 70, 670, 560, 910);
  ambient.addColorStop(0, palette.ambient);
  ambient.addColorStop(1, palette.ambientFade);
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, 1200, 1500);

  ctx.save();
  ctx.strokeStyle = palette.frame;
  ctx.lineWidth = 1.1;
  ctx.globalAlpha = 0.68;
  ctx.strokeRect(29, 29, 1142, 1462);
  ctx.globalAlpha = 0.3;
  ctx.strokeRect(41, 41, 1118, 1438);
  ctx.restore();
}

function drawTracking(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'right',
): void {
  const segments = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)];
  const widths = segments.map(({ segment }) => ctx.measureText(segment).width);
  const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, segments.length - 1) * spacing;
  let position = align === 'left' ? x : x - total;
  for (let i = 0; i < segments.length; i++) {
    ctx.fillText(segments[i].segment, position, y);
    position += widths[i] + spacing;
  }
}

function paintEditorialDetails(
  ctx: CanvasRenderingContext2D,
  layout: SkyChartArtworkLayout,
  palette: SkyChartPalette,
): void {
  ctx.save();
  ctx.font = '500 15px ' + layout.fonts.family;
  ctx.fillStyle = palette.accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  drawTracking(ctx, 'ELSEWHERE', 76, 63, 3, 'left');
  drawTracking(
    ctx,
    layout.artwork.locale === 'zh-Hans' ? '星 空 纪 念' : 'CELESTIAL KEEPSAKE',
    1125,
    63,
    layout.artwork.locale === 'zh-Hans' ? 2 : 1.6,
    'right',
  );

  // A flourish is typographic furniture outside the projected sky. No fake stars.
  if (layout.blocks[0].lines.length === 1) {
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = palette.accentSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(475, 1064);
    ctx.lineTo(567, 1064);
    ctx.moveTo(633, 1064);
    ctx.lineTo(725, 1064);
    ctx.stroke();
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(600, 1059);
    ctx.lineTo(605, 1064);
    ctx.lineTo(600, 1069);
    ctx.lineTo(595, 1064);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = palette.footer;
  ctx.globalAlpha = 0.84;
  ctx.beginPath();
  ctx.moveTo(174, 1320);
  ctx.lineTo(1026, 1320);
  ctx.stroke();
  ctx.restore();
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
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * 5 !== height * 4
  ) {
    throw new RangeError('Canvas output must have positive integer 4:5 dimensions.');
  }
  const palette = SKY_CHART_PALETTES[layout.artwork.theme];
  if (!palette) throw new TypeError('Unsupported sky chart artwork palette.');
  ctx.save();
  try {
    ctx.scale(width / layout.width, height / layout.height);
    ctx.clearRect(0, 0, layout.width, layout.height);
    paintArtworkGround(ctx, palette);
    const { cx, cy, radius } = layout.disc;
    paintSkyDisc(ctx, palette, cx, cy, radius);
    ctx.save();
    try {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TWO_PI);
      ctx.clip();
      for (const object of layout.objects) drawBody(ctx, object, palette);
    } finally {
      ctx.restore();
    }
    paintEngravedRing(ctx, palette, cx, cy, radius);
    paintEditorialDetails(ctx, layout, palette);
    ctx.font = '500 20px ' + fonts.family;
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
