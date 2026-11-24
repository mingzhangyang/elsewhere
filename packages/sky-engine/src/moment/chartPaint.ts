import type { SkyChartSnapshotObject } from '../domain/skyChartSnapshot';

const TWO_PI = 2 * Math.PI;
export type SkyArtworkTheme = 'midnight' | 'paper';

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

function starRadius(magnitude: number): number {
  return Math.max(1.35, Math.min(4.8, 1.45 + (6 - magnitude) * 0.38));
}

/** The same normalization-to-pixel transform for the app artwork and the standalone chart. */
export function chartDrawObject(
  object: SkyChartSnapshotObject,
  disc: Readonly<{ cx: number; cy: number; radius: number }>,
): SkyChartDrawObject {
  // SM2-C already did all altitude/azimuth computation, selection and projection.
  // This is ONLY a linear normalization-to-canvas transform.
  const px = disc.cx + object.x * disc.radius;
  const py = disc.cy + object.y * disc.radius;
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

export function paintSkyDisc(
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

export function paintEngravedRing(
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

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.fill();
}

export function drawBody(
  ctx: CanvasRenderingContext2D,
  object: SkyChartDrawObject,
  palette: SkyChartPalette,
): void {
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
