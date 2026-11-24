import { seededRandom } from '../lib/random';
import { noise1 } from './paint';

export const PAPER = '#f6f1e7';

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
export function paintFinish(
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
