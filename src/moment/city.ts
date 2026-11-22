import { seededRandom } from '../lib/random';
import type { LandScene } from './landscape';
import { css, deepen, hex, mix, type Rgb } from './paint';
import { TOWN_TOP } from './scenery';

// The shared moment already carries the Sun's local horizon coordinates.
// In twilight an eastern Sun is rising and a western Sun is setting.
export function cityLight(altitude: number, azimuth: number) {
  if (altitude >= 6) return 'day';
  if (altitude < -6) return 'night';
  return azimuth < 180 ? 'dawn' : 'dusk';
}

const colours = {
  dawn: { wall: '#838ea7', glass: '#f2c9c3', water: '#869cb6', lamp: '#ffe2b0', occupancy: 0.18 },
  day: { wall: '#7596a3', glass: '#cbe0dc', water: '#6999a4', lamp: '#fff7d6', occupancy: 0.02 },
  dusk: { wall: '#755770', glass: '#ffa666', water: '#996774', lamp: '#ffd495', occupancy: 0.52 },
  night: { wall: '#273955', glass: '#446080', water: '#21334b', lamp: '#ffda98', occupancy: 0.67 },
};

export function paintCityHorizon(scene: LandScene, haze: Rgb) {
  const { ctx, view, toCanvas, horizonY, width, unit } = scene;
  for (let i = Math.floor((view.heading - 90) / 1.5); i < (view.heading + 90) / 1.5; i++) {
    const random = seededRandom(Math.imul(((i % 240) + 240) % 240, 2654435761));
    random(); // Decorrelate neighbouring roof heights after seeding each azimuth block.
    const top = 0.35 + random() ** 2 * (TOWN_TOP - 0.35);
    const a = toCanvas(top, i * 1.5);
    const b = toCanvas(top, i * 1.5 + 1.42);
    if (!a.front || !b.front || b.x < 0 || a.x > width) continue;
    ctx.fillStyle = css(deepen(haze, random() * 0.22));
    const y = Math.max(a.y, b.y);
    ctx.fillRect(a.x, y, b.x - a.x, horizonY + unit - y);
  }
}

/** Two terraces of offices above a quay, seen across the water and an elevated rail line. */
export function paintCityBlocks(scene: LandScene) {
  const { ctx, width, height, horizonY, unit, sky, palette, lightX, seed } = scene;
  const tone = colours[cityLight(sky.sunAltitude, sky.sun.azimuth)];
  const wall = hex(tone.wall),
    glass = hex(tone.glass),
    lamp = hex(tone.lamp);
  const depth = height - horizonY;
  const quay = horizonY + depth * 0.63;
  const scale = Math.min(unit, depth / 290);
  const random = seededRandom(seed + 113);
  const water = ctx.createLinearGradient(0, horizonY, 0, height);
  water.addColorStop(0, css(mix(hex(tone.water), palette.horizon, 0.4)));
  water.addColorStop(1, css(deepen(hex(tone.water), 0.28)));
  ctx.fillStyle = water;
  ctx.fillRect(0, quay, width, height - quay);
  ctx.fillStyle = css(mix(palette.landFar, palette.horizon, 0.55));
  ctx.fillRect(0, horizonY, width, quay - horizonY);

  for (const near of [false, true]) {
    const base = near ? quay : horizonY + depth * 0.38;
    const size = near ? scale : scale * 0.55;
    for (let x = -45 * size; x < width; ) {
      const w = (26 + random() * 65) * size;
      const h = (base - horizonY) * (0.2 + random() ** 1.6 * 0.7);
      const y = base - h;
      const face = mix(wall, near ? glass : palette.horizon, (near ? 0.08 : 0.38) + random() * 0.23);
      const flank = w * 0.18;
      const frontX = lightX > 0 ? x + flank : x;
      ctx.fillStyle = css(deepen(face, 0.22));
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = css(face);
      ctx.fillRect(frontX, y, w - flank, h);
      // A setback penthouse and a narrow cornice catch the sky light.
      const crown = h > 80 * size ? 0.13 * h : 4 * size;
      ctx.fillRect(x + w * 0.18, y - crown, w * 0.56, crown + size);
      if (h > 90 * size) {
        ctx.fillRect(x + w * 0.32, y - crown * 1.6, w * 0.28, crown);
        ctx.fillRect(x + w * 0.45, y - crown * 2.3, size, crown);
      }
      ctx.fillStyle = css(glass, 0.7);
      ctx.fillRect(frontX, y, w - flank, 1.6 * size);
      const ribbon = random() < 0.38;
      for (let floor = y + 6 * size; floor < base - 4 * size; floor += 8 * size) {
        for (let col = frontX + 3 * size; col < frontX + w - flank - 5 * size; col += 8 * size) {
          ctx.fillStyle = random() < tone.occupancy ? css(lamp) : css(glass, 0.58);
          ctx.fillRect(col, floor, (ribbon ? 7.5 : 4) * size, 3 * size);
        }
      }
      if (near) {
        for (let j = 0; j < 8; j++) {
          ctx.strokeStyle = css(random() < tone.occupancy ? lamp : face, 0.35 - j * 0.035);
          ctx.lineWidth = (1 + random() * 2) * scale;
          const rx = x + random() * w * 0.45;
          const ry = quay + depth * j * 0.022;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx + w * (0.16 + random() * 0.5), ry);
          ctx.stroke();
        }
      }
      x += w + (1 + random() * 5) * size;
    }
  }

  // Viaduct piers and a commuter train in side profile.
  const rail = horizonY + depth * 0.88;
  ctx.fillStyle = css(deepen(wall, 0.55));
  for (let x = 30 * scale; x < width; x += 148 * scale) {
    ctx.fillRect(x, rail, 9 * scale, height - rail);
    ctx.fillRect(x - 5 * scale, rail, 19 * scale, 10 * scale);
  }
  ctx.fillRect(0, rail, width, 5 * scale);
  const car = Math.min(95 * scale, width / 5);
  const start = (width - 3 * car) * 0.43;
  for (let i = 0; i < 3; i++) {
    const x = start + i * car;
    ctx.fillStyle = css(mix(wall, glass, 0.65));
    ctx.fillRect(x, rail - 14 * scale, car - 2 * scale, 13 * scale);
    ctx.fillStyle = css(deepen(wall, 0.4));
    ctx.fillRect(x, rail - 5 * scale, car - 2 * scale, 3 * scale);
    ctx.fillStyle = css(tone.occupancy > 0.1 ? lamp : wall);
    for (let j = 1; j <= 7; j++) ctx.fillRect(x + (j * car) / 9, rail - 12 * scale, car / 13, 5 * scale);
  }
}
