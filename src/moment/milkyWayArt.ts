import type { MomentSnapshot } from '../lib/moment';
import { createSceneToGalactic, MILKY_WAY_SHAPE as shape } from '../domain/galactic';
import { limitingMagnitude, milkyWayVisibility, weatherVisibility } from '../domain/starVisibility';
import { createSkyRay } from './projection';
import { type Palette, clamp01, lerp } from './paint';

const RAD = Math.PI / 180;
const bell = (x: number, width: number) => Math.exp(-(x * x) / (width * width));
const smooth = (t: number) => t * t * (3 - 2 * t);
const step = (a: number, b: number, x: number) => smooth(clamp01((x - a) / (b - a)));

/** Continuous 3-D pigment noise: fixed in Galactic space, including across longitude +/-180. */
function hash(x: number, y: number, z: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 2246822519);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, z: number) {
  const i = Math.floor(x),
    j = Math.floor(y),
    k = Math.floor(z);
  const u = smooth(x - i),
    v = smooth(y - j),
    w = smooth(z - k);
  const slice = (n: number) =>
    lerp(lerp(hash(i, j, n), hash(i + 1, j, n), u), lerp(hash(i, j + 1, n), hash(i + 1, j + 1, n), u), v);
  return lerp(slice(k), slice(k + 1), w);
}

/** The Galaxy's light, before atmospheric visibility. The texture is not a survey image. */
function pigment(x: number, y: number, z: number, l: number, b: number) {
  const al = Math.abs(l);
  const along =
    shape.base +
    shape.inner * bell(al, shape.innerWidth) +
    shape.cygnus * bell(l - shape.secondaryLongitude, shape.secondaryWidth) +
    shape.carina * bell(l + shape.secondaryLongitude, shape.secondaryWidth);
  const band = bell(b, shape.bandWidth + shape.innerBandWidth * bell(al, shape.widthFalloff));
  const bulge = bell(l, shape.bulgeWidth) * bell(b - shape.bulgeLatitude, shape.bulgeHeight);
  const clouds = 0.65 * noise(x * 7, y * 7, z * 7) + 0.35 * noise(x * 15 + 2, y * 15 + 7, z * 15);
  const fine = 0.7 * noise(x * 25 + 3, y * 25 + 3, z * 25 + 3) + 0.3 * noise(x * 49, y * 49, z * 49);
  const light =
    band * along * (0.5 + 1.1 * clouds * clouds) + bulge * shape.bulgeStrength * (0.6 + 0.6 * clouds);
  const rift = (step(-18, -2, l) - step(75, 92, l)) * bell(b - 2 - 2 * Math.sin(l * RAD * 4), 2 + 2.5 * fine);
  const dust = Math.max(0, Math.min(0.85, rift * 0.8 + (fine - 0.45) * 0.9 * band));
  return light * (1 - dust);
}

/** Painted diffuse light behind stars, clouds and land. No work on a hidden Galaxy. */
export function paintMilkyWay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: MomentSnapshot,
  palette: Palette,
) {
  const { layers, sky, skyBrightness, weather, view, aspect } = snapshot;
  if (!layers.stars) return;
  const limit = limitingMagnitude(skyBrightness, sky.moon);
  // Partial cloud banks are painted over the wash; a solid overcast extinguishes it even in gaps
  // in the illustrative clouds. The image-only clear weather override is already in snapshot.
  const share =
    milkyWayVisibility(limit, sky.sunAltitude) *
    weatherVisibility(weather) *
    (1 - step(0.8, 1, weather.cloudCover / 100));
  if (share <= 0) return;

  // Bounded offscreen raster (at most 480² pixels). Each sample is a sky ray, not a brush
  // anchored to the page, so changing the camera or the output crop preserves the structure.
  const scale = Math.min(1, 480 / Math.max(width, height));
  const w = Math.max(1, Math.ceil(width * scale));
  const h = Math.max(1, Math.ceil(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const buffer = canvas.getContext('2d');
  if (!buffer) return;
  const image = buffer.createImageData(w, h);
  const rayAt = createSkyRay(view, aspect, width, height);
  const galactic = createSceneToGalactic(sky.starField);
  const cool = palette.cloudLight;
  const warm = [239, 216, 184];
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const ray = rayAt(((px + 0.5) * width) / w, ((py + 0.5) * height) / h);
      if (ray[1] <= 0) continue;
      const [x, y, z] = galactic(ray);
      const b = Math.asin(Math.max(-1, Math.min(1, z))) / RAD;
      if (Math.abs(b) > shape.latitudeCutoff) continue;
      const l = Math.atan2(y, x) / RAD;
      const air = step(shape.airStart, shape.airEnd, ray[1]);
      const alpha = Math.min(0.42, 0.29 * pigment(x, y, z, l, b) * air * share);
      if (alpha < 0.5 / 255) continue;
      const tint = bell(Math.abs(l), 40);
      const i = (py * w + px) * 4;
      for (let c = 0; c < 3; c++) image.data[i + c] = lerp(cool[c], warm[c], tint);
      image.data[i + 3] = alpha * 255;
    }
  }
  buffer.putImageData(image, 0, 0);
  ctx.save();
  // A straight geometric horizon in this roll-free camera. Prevent even interpolation at its edge
  // from leaking paint below the horizon. At the zenith the entire forward view is above it.
  const coverHeight = Math.max(width / aspect, height);
  const halfFov = (view.fov * RAD) / 2;
  const horizonY = height / 2 + (coverHeight * Math.tan(view.altitude * RAD)) / (2 * Math.tan(halfFov));
  ctx.beginPath();
  ctx.rect(0, 0, width, Math.max(0, Math.min(height, horizonY)));
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, width, height);
  ctx.restore();
}
