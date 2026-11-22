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

function starRadius(magnitude: number): number {
  return Math.max(1.35, Math.min(4.8, 1.45 + (6 - magnitude) * 0.38));
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
      role === 'title' || label === 'phrase'
        ? artwork.locale === 'zh-Hans'
          ? '"Songti SC", "Noto Serif CJK SC", "SimSun", serif'
          : 'Georgia, "Times New Roman", serif'
        : fonts.family;
    const style = label === 'phrase' && artwork.locale === 'en' ? 'italic ' : '';
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
  const objects = Object.freeze(
    artwork.snapshot.objects.map((object): SkyChartDrawObject => {
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
        radius:
          object.kind === 'sun'
            ? 9
            : object.kind === 'moon'
              ? 8
              : object.kind === 'planet'
                ? 5.1
                : starRadius(object.magnitude),
        magnitude: 'magnitude' in object ? object.magnitude : null,
        colorIndex: object.kind === 'star' ? object.colorIndex : null,
      });
    }),
  );
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
  readonly backgroundBottom: string;
  readonly ambient: string;
  readonly ambientFade: string;
  readonly disc: string;
  readonly discHighlight: string;
  readonly discEdge: string;
  readonly discWash: string;
  readonly discWashFade: string;
  readonly frame: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly halo: string;
  readonly footer: string;
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

export const SKY_CHART_PALETTES: Readonly<Record<SkyArtworkTheme, Readonly<SkyChartPalette>>> = Object.freeze(
  {
    midnight: Object.freeze({
      background: '#090e22',
      backgroundBottom: '#20172d',
      ambient: 'rgba(165, 83, 163, 0.22)',
      ambientFade: 'rgba(165, 83, 163, 0)',
      disc: '#18264b',
      discHighlight: '#30456d',
      discEdge: '#101930',
      discWash: 'rgba(176, 111, 163, 0.19)',
      discWashFade: 'rgba(176, 111, 163, 0)',
      frame: '#715e7e',
      accent: '#d9b88b',
      accentSoft: '#9f869f',
      halo: '#f4ddc5',
      footer: 'rgba(196, 157, 174, 0.24)',
      grid: '#4b526d',
      rim: '#c7a77d',
      title: '#fff0dd',
      metadata: '#eddfdf',
      subtle: '#d8c1d1',
      note: '#d2c4d1',
      credit: '#b9aabd',
      star: '#fff7ef',
      starBlue: '#d8e6ff',
      starWarm: '#ffd9b5',
      sun: '#ffd28a',
      moon: '#f9ebdc',
      planet: '#cddbe5',
    }),
    paper: Object.freeze({
      background: '#fbf5ec',
      backgroundBottom: '#f0e5e3',
      ambient: 'rgba(213, 137, 157, 0.24)',
      ambientFade: 'rgba(213, 137, 157, 0)',
      disc: '#e8e8ea',
      discHighlight: '#f7e8ed',
      discEdge: '#d7dce5',
      discWash: 'rgba(170, 146, 184, 0.17)',
      discWashFade: 'rgba(170, 146, 184, 0)',
      frame: '#c3a7a3',
      accent: '#9a685d',
      accentSoft: '#b7928c',
      halo: '#c3a8b2',
      footer: 'rgba(155, 106, 103, 0.28)',
      grid: '#c3afbb',
      rim: '#9a756f',
      title: '#463447',
      metadata: '#544051',
      subtle: '#665463',
      note: '#59485a',
      credit: '#6d5d6a',
      star: '#3e4f68',
      starBlue: '#456c8e',
      starWarm: '#915e55',
      sun: '#b27841',
      moon: '#6e7084',
      planet: '#61718d',
    }),
  },
);

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

function paintSkyDisc(
  ctx: CanvasRenderingContext2D,
  palette: SkyChartPalette,
  cx: number,
  cy: number,
  radius: number,
): void {
  const sky = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.34, 15, cx, cy, radius * 1.16);
  sky.addColorStop(0, palette.discHighlight);
  sky.addColorStop(0.68, palette.disc);
  sky.addColorStop(1, palette.discEdge);
  ctx.fillStyle = sky;
  dot(ctx, cx, cy, radius);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TWO_PI);
  ctx.clip();
  const softWash = ctx.createRadialGradient(
    cx + radius * 0.42,
    cy + radius * 0.57,
    10,
    cx + radius * 0.42,
    cy + radius * 0.57,
    radius * 0.95,
  );
  softWash.addColorStop(0, palette.discWash);
  softWash.addColorStop(1, palette.discWashFade);
  ctx.fillStyle = softWash;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
}

function paintEngravedRing(
  ctx: CanvasRenderingContext2D,
  palette: SkyChartPalette,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.save();
  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TWO_PI);
  ctx.stroke();

  ctx.globalAlpha = 0.56;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 12, 0, TWO_PI);
  ctx.stroke();

  // The ticks are anchored to compass angles but not a second projection.
  // Cardinal labels replace ticks at N/E/S/W, so they never collide.
  for (let index = 0; index < 72; index++) {
    if (index % 18 === 0) continue;
    const a = (index * TWO_PI) / 72 - Math.PI / 2;
    const length = index % 6 === 0 ? 9 : 4;
    const inner = radius + 14;
    const outer = inner + length;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.stroke();
  }
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

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.fill();
}

function drawBody(ctx: CanvasRenderingContext2D, object: SkyChartDrawObject, palette: SkyChartPalette): void {
  const { px, py, radius } = object;
  if (object.kind === 'star') {
    ctx.fillStyle =
      object.colorIndex === null
        ? palette.star
        : object.colorIndex < 0.25
          ? palette.starBlue
          : object.colorIndex > 1.2
            ? palette.starWarm
            : palette.star;
    ctx.globalAlpha = Math.max(0.42, Math.min(1, 0.5 + (6 - (object.magnitude ?? 6)) * 0.08));
    if ((object.magnitude ?? 6) < 2.5) {
      ctx.save();
      ctx.shadowColor = palette.halo;
      ctx.shadowBlur = (object.magnitude ?? 6) < 0.8 ? 13 : 7;
      dot(ctx, px, py, radius);
      ctx.restore();
    } else {
      dot(ctx, px, py, radius);
    }
    // Only the brightest *real* stars earn a restrained four-point sparkle.
    if ((object.magnitude ?? 6) < 0.5) {
      const reach = radius + 5.5;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.9;
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.moveTo(px - reach, py);
      ctx.lineTo(px + reach, py);
      ctx.moveTo(px, py - reach);
      ctx.lineTo(px, py + reach);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle =
    object.kind === 'sun' ? palette.sun : object.kind === 'moon' ? palette.moon : palette.planet;
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
