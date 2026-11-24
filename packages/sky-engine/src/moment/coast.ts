import { seededRandom } from '../lib/random';
import type { LandScene } from './landscape';
import { css, deepen, hex, lerp, mix, noise1, type Rgb } from './paint';
import { seasonalColours } from './seasons';

/** A tidal cove seen from above. The same shoreline guides the sand, shoals and incoming surf. */
export function paintCove(scene: LandScene) {
  const { ctx, width, height, horizonY, day, seed, palette, season, unit } = scene;
  const depth = height - horizonY;
  if (depth < 10 * unit) return;
  const random = seededRandom(seed + 103);
  const weathering = noise1(seed + 105);
  const side = random() < 0.5 ? -1 : 1;
  const reach = Math.min(0.56 * width, depth * 2.45);
  const tones = seasonalColours[season];
  const local = (colour: string) => mix(deepen(palette.landMid, 0.38), hex(colour), 0.04 + day * 0.94);
  const sand = local(tones.sand);
  const shallow = local(tones.shallow);
  const foam = mix(palette.horizon, hex('#fff7df'), day * 0.9);
  const surf = (season === 'winter' ? 1.25 : season === 'summer' ? 0.8 : 1) * reach;
  const shore = (t: number) => reach * (0.11 + 0.74 * t * t - 0.065 * Math.sin(t * Math.PI * 2));
  const yAt = (t: number) => horizonY + depth * (0.44 + 0.56 * t);
  ctx.save();
  ctx.translate(side > 0 ? 0 : width, 0);
  ctx.scale(side, 1);

  // Draw nested strips from offshore towards the dry beach. Break up the wave crests along their length.
  const band = (offset: number, colour: Rgb, alpha: number) => {
    ctx.fillStyle = css(colour, alpha);
    ctx.beginPath();
    ctx.moveTo(-2, yAt(0));
    for (let i = 0; i <= 84; i++) {
      const t = i / 84;
      const swell = (0.24 + 0.76 * t) * (0.89 + 0.17 * weathering(t * 15 + offset * 8));
      ctx.lineTo(shore(t) + offset * surf * swell, yAt(t));
    }
    ctx.lineTo(-2, height + 1);
    ctx.fill();
  };
  band(0.58, shallow, 0.18);
  band(0.33, shallow, 0.35);
  band(0.14, shallow, 0.48);
  band(0.018, foam, 0.94);
  band(0, mix(sand, shallow, 0.28), 1);
  band(-0.08, sand, 1);
  for (let line = 1; line <= 4; line++) {
    const offset = surf * (0.09 * line + 0.015 * line * line);
    for (let t = 0; t < 1; ) {
      const span = (0.044 + random() * 0.13) / Math.sqrt(line);
      const points = Array.from({ length: 17 }, (_, j) => {
        const u = j / 16,
          q = t + span * u;
        return {
          x: shore(q) + offset * (0.21 + 0.79 * q) + surf * 0.018 * weathering(23 * q + line),
          y: yAt(q),
          curl: Math.sin(Math.PI * u) * depth * (0.004 + q * 0.022) * (0.7 + 0.3 * weathering(80 * q)),
        };
      });
      // The lit lip spills onto a darker translucent face, tapering at both ends.
      for (const [colour, thickness] of [
        [deepen(shallow, 0.35), 1.8],
        [foam, 0.67],
      ] as const) {
        ctx.fillStyle = css(colour, 0.84 - line * 0.095);
        ctx.beginPath();
        for (const p of points) ctx.lineTo(p.x, p.y);
        for (let j = points.length - 1; j >= 0; j--) {
          const p = points[j];
          ctx.lineTo(p.x, p.y + p.curl * thickness);
        }
        ctx.fill();
      }
      t += span + random() * 0.032;
    }
  }

  // Little skipping stones and seaweed gather just above the high-water mark.
  for (let i = 0; i < 115; i++) {
    const t = random();
    const x = shore(t) * (0.12 + random() * 0.8);
    ctx.fillStyle = css(deepen(sand, 0.48), 0.22 + random() * 0.26);
    ctx.beginPath();
    ctx.ellipse(x, yAt(t), (0.8 + 2 * t * random()) * unit, (0.4 + t) * unit, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const rock = scene.landscapeArt;
  if (rock) {
    const w = reach * 0.93;
    const h = (w * rock.naturalHeight) / rock.naturalWidth;
    const base = yAt(0.14);
    // Break the reflected cliff into short horizontal bands as the water recedes from its foot.
    ctx.save();
    ctx.translate(0, base);
    ctx.scale(1, -0.32);
    for (let i = 0; i < 13; i++) {
      const v = i / 13;
      ctx.globalAlpha = 0.24 * (1 - v);
      const slice = rock.naturalHeight / 13;
      ctx.drawImage(
        rock,
        0,
        rock.naturalHeight - (i + 1) * slice,
        rock.naturalWidth,
        slice * 0.75,
        (weathering(i * 0.7) - 0.5) * 12 * unit,
        (-(i + 1) * h) / 13,
        w,
        (h / 13) * 0.75,
      );
    }
    ctx.restore();
    ctx.drawImage(rock, 0, base - h, w, h);
    for (let i = 0; i < 42; i++) {
      const t = random();
      ctx.fillStyle = css(foam, 0.16 + random() * 0.36);
      ctx.beginPath();
      ctx.ellipse(
        w * t,
        base + (random() - 0.5) * h * 0.1,
        (1 + random() * 7) * unit,
        (0.4 + random() * 0.65) * unit,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  // Marram follows the dune ridge. The same clumps flower in spring and carry seed in autumn.
  const duneY = (t: number) => height - depth * (0.17 * (1 - t * t) + 0.03 * Math.cos(4 * t));
  const duneWidth = reach * 0.44;
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let i = 0; i <= 42; i++) ctx.lineTo((duneWidth * i) / 42, duneY(i / 42));
  ctx.lineTo(duneWidth, height);
  ctx.fillStyle = css(mix(sand, local(tones.turf), 0.5));
  ctx.fill();
  for (let i = 0; i < 108; i++) {
    const t = random();
    const x = duneWidth * t;
    const y = lerp(duneY(t), height, random());
    const h = depth * (0.017 + random() * 0.081) * (1.18 - t * 0.65);
    for (let j = 0; j < 5; j++) {
      const sway = (random() - 0.38) * h;
      const tip = y - h * (0.48 + random() * 0.55);
      ctx.fillStyle = css(mix(local(tones.turf), deepen(sand, 0.38), random() * 0.8));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + sway * 0.28, tip + h * 0.16, x + sway, tip);
      ctx.quadraticCurveTo(x + sway * 0.24 + h * 0.09, tip + h * 0.27, x + h * 0.06, y);
      ctx.fill();
      if (j === 0 && (season === 'spring' || season === 'autumn')) {
        ctx.fillStyle = css(local(season === 'spring' ? '#e3a6b3' : '#bd8a58'));
        ctx.beginPath();
        ctx.ellipse(x + sway, tip, h * 0.11, h * (season === 'spring' ? 0.11 : 0.22), 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
