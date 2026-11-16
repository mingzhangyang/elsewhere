import { type Palette, type Rgb, TAU, clamp01, css, deepen, glowAt, lerp, mark, mix } from './paint';

/**
 * Clouds painted like gouache: heaped masses with many small billows, each billow catching the
 * light on the side that faces it and falling into shadow behind, a shaded base, and a bright rim
 * when the light stands behind the cloud. How many there are follows the cloud cover; their shapes
 * and places are illustrative.
 */

/** Where the light is, as seen from a cloud: a unit vector in canvas pixels, and how far behind it. */
export interface CloudLight {
  x: number;
  y: number;
  /** 0: lit from the front or above; 1: the light is right behind the cloud. */
  backlit: number;
  /** Light from below, 0 to 1: a low Sun on the cloud's belly, or a town's lights at night. */
  under: number;
  underColour: Rgb;
}

interface Billow {
  x: number;
  y: number;
  rx: number;
  ry: number;
  turn: number;
}

/**
 * A cumulus cloud standing on a flat base at `y`, about `size` tall per tier.
 * `tiers` 1 is a fair-weather puff, 3 a towering summer cloud.
 */
export function cumulus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  palette: Palette,
  light: CloudLight,
  random: () => number,
  alpha: number,
  tiers = 1,
) {
  const masses: Billow[] = [];
  const add = (bx: number, by: number, r: number) =>
    masses.push({
      x: bx,
      y: by,
      rx: r * (1.1 + random() * 0.3),
      ry: r * (0.84 + random() * 0.14),
      turn: (random() - 0.5) * 0.4,
    });
  const half = size * (1.25 + random() * 0.55 + tiers * 0.14);
  const lean = (random() - 0.5) * 1.2;
  // One long low slab for the base (part of the outline, not lit as a billow), and a row of rounder
  // masses standing in it, fullest in the middle; the base line cuts through them all, so the
  // cloud sits on one flat bottom.
  const slab: Billow = { x, y: y - size * 0.1, rx: half * 0.9, ry: size * 0.22, turn: 0 };
  const count = 3 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;
    const middle = 1 - Math.abs(t - 0.5) * 2;
    const r = Math.max(size * (0.24 + 0.2 * middle + random() * 0.1), (half * 0.62) / count);
    add(x + (t - 0.5) * 2 * half * 0.7 + (random() - 0.5) * size * 0.12, y - r * 0.4, r);
  }
  // Heaped tiers, each narrower, leaning to one side.
  for (let tier = 1; tier <= tiers; tier++) {
    const n = Math.max(1, 4 - tier - (random() < 0.4 ? 1 : 0));
    const centre = x + lean * half * 0.3 * tier;
    const spread = half * (0.62 - 0.16 * tier);
    for (let k = 0; k < n; k++) {
      const r = size * (0.42 - 0.05 * tier + random() * 0.14);
      add(
        centre + (n > 1 ? (k / (n - 1) - 0.5) * 2 * spread : 0) + (random() - 0.5) * size * 0.2,
        y - size * (0.42 + 0.42 * (tier - 1) + random() * 0.16) - r * 0.2,
        r,
      );
    }
  }
  // Billows budding from the upper edge of every mass, and smaller ones from those: the
  // cauliflower outline, never two the same size.
  const billows: Billow[] = [...masses];
  const bud = (m: Billow, share: number) => {
    const a = -Math.PI / 2 + (random() - 0.5) * 2.5;
    const r = m.rx * share * (0.7 + random() * 0.6);
    const b = {
      x: m.x + Math.cos(a) * m.rx * 0.82,
      y: m.y + Math.sin(a) * m.ry * 0.82,
      rx: r * (1.05 + random() * 0.3),
      ry: r * 0.88,
      turn: (random() - 0.5) * 0.8,
    };
    billows.push(b);
    return b;
  };
  for (const m of masses) {
    const buds = 2 + Math.floor(random() * 3);
    for (let k = 0; k < buds; k++) {
      const b = bud(m, 0.42);
      if (random() < 0.6) bud(b, 0.5);
    }
  }
  const base = y;
  const top = Math.min(...billows.map((b) => b.y - b.ry));
  const outline = (grow: number) => {
    ctx.beginPath();
    for (const b of [slab, ...billows]) {
      ctx.moveTo(b.x + (b.rx + grow) * Math.cos(b.turn), b.y + (b.rx + grow) * Math.sin(b.turn));
      ctx.ellipse(b.x, b.y, b.rx + grow, b.ry + grow, b.turn, 0, TAU);
    }
  };
  const lit = mix(palette.cloudLight, palette.glow, 0.35 * light.backlit);
  const shade = mix(palette.cloudBody, palette.cloudShadow, 0.6);
  ctx.save();
  ctx.globalAlpha = alpha;
  // A flat base, as cumulus has, with a slight bow.
  ctx.beginPath();
  ctx.moveTo(x - half * 2.2, top - size);
  ctx.lineTo(x + half * 2.2, top - size);
  ctx.lineTo(x + half * 2.2, base - size * 0.02);
  ctx.quadraticCurveTo(x, base + size * 0.04, x - half * 2.2, base - size * 0.02);
  ctx.closePath();
  ctx.clip();
  // With the light behind it, the cloud's edge burns bright all round.
  if (light.backlit > 0.12) {
    ctx.fillStyle = css(lit, light.backlit);
    ctx.shadowColor = css(lit, 0.8 * light.backlit);
    ctx.shadowBlur = size * 0.22 * light.backlit;
    outline(size * 0.035 * light.backlit);
    ctx.fill();
  }
  // The body: light above, shaded toward the base, with a softened painted edge.
  const body = ctx.createLinearGradient(0, top, 0, base);
  const crown = mix(palette.cloudBody, palette.cloudLight, 0.6 * (1 - light.backlit));
  body.addColorStop(0, css(mix(crown, palette.cloudShadow, 0.45 * light.backlit)));
  body.addColorStop(0.55, css(mix(palette.cloudBody, palette.cloudShadow, 0.15 + 0.5 * light.backlit)));
  body.addColorStop(1, css(mix(palette.cloudShadow, deepen(palette.cloudShadow, 0.2), light.backlit)));
  ctx.shadowColor = css(mix(palette.cloudBody, lit, 0.5), 0.4);
  ctx.shadowBlur = size * 0.03;
  ctx.fillStyle = body;
  outline(0);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0,0,0,0)';
  outline(0);
  ctx.clip();
  // Each billow, from the side nearest the light to the farthest: soft shade gathers behind it, and
  // its lit face is a crisp edge that melts away across it, so the next billow reads against it.
  const order = [...billows].sort((a, b) => b.x * light.x + b.y * light.y - (a.x * light.x + a.y * light.y));
  const strength = lerp(0.95, 0.2, light.backlit);
  const largest = Math.max(...billows.map((b) => b.rx));
  for (const b of order) {
    const r = Math.max(b.rx, b.ry);
    // Small buds shape the outline; the big masses carry the light.
    const weight = strength * (0.55 + 0.45 * Math.min(1, (b.rx / largest) * 1.6));
    glowAt(ctx, b.x - light.x * r * 0.75, b.y - light.y * r * 0.75, r * 1.05, shade, 0.3);
    const g = ctx.createLinearGradient(
      b.x + light.x * r,
      b.y + light.y * r,
      b.x - light.x * r * 0.25,
      b.y - light.y * r * 0.25,
    );
    g.addColorStop(0, css(lit, weight));
    g.addColorStop(0.35, css(lit, weight * 0.7));
    g.addColorStop(1, css(lit, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, b.rx, b.ry, b.turn, 0, TAU);
    ctx.fill();
  }
  // The underside: in shade by day, glowing when a low Sun (or a town at night) lights it from below.
  const under = ctx.createLinearGradient(0, base - size * 0.4, 0, base);
  under.addColorStop(0, css(palette.cloudShadow, 0));
  under.addColorStop(1, css(palette.cloudShadow, 0.75));
  ctx.fillStyle = under;
  ctx.fillRect(x - half * 2.2, base - size * 0.4, half * 4.4, size * 0.5);
  if (light.under > 0.02) {
    const warm = ctx.createLinearGradient(0, base - size * 0.34, 0, base);
    warm.addColorStop(0, css(light.underColour, 0));
    warm.addColorStop(1, css(light.underColour, 0.75 * light.under));
    ctx.fillStyle = warm;
    ctx.fillRect(x - half * 2.2, base - size * 0.34, half * 4.4, size * 0.4);
  }
  ctx.restore();
  // Loose brush marks trailing from the base and a shred or two drifting off: a painted edge.
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = css(
    light.under > 0.02 ? mix(palette.cloudShadow, light.underColour, 0.5 * light.under) : shade,
    0.55,
  );
  ctx.beginPath();
  for (let i = 0; i < 5; i++)
    mark(
      ctx,
      x + (random() - 0.5) * half * 1.7,
      base + size * (random() * 0.03),
      half * (0.5 + random() * 0.9),
      size * (0.025 + random() * 0.03),
      0,
      0,
    );
  ctx.fill();
  ctx.fillStyle = css(mix(palette.cloudBody, lit, 0.6), 0.4);
  ctx.shadowColor = css(mix(palette.cloudBody, lit, 0.6), 0.5);
  ctx.shadowBlur = size * 0.06;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const side = random() < 0.5 ? -1 : 1;
    mark(
      ctx,
      x + side * half * (1.0 + random() * 0.35),
      y - size * (0.08 + random() * 0.45),
      size * (0.25 + random() * 0.3),
      size * (0.03 + random() * 0.04),
      (random() - 0.5) * 0.3,
      -size * 0.02,
    );
  }
  ctx.fill();
  ctx.restore();
}

/** Low stratus: long tapered bars near the horizon, stacked, edged with light on the lit side. */
export function stratus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  palette: Palette,
  light: CloudLight,
  random: () => number,
  unit: number,
) {
  const bars = 2 + Math.floor(random() * 3);
  for (let i = 0; i < bars; i++) {
    const bx = x + (random() - 0.5) * length * 0.5,
      by = y + (i - bars / 2) * (9 + random() * 7) * unit,
      l = length * (0.45 + random() * 0.6),
      t = (6 + random() * 9) * unit;
    const bar = mix(palette.cloudBody, palette.cloudShadow, 0.3 + 0.3 * light.backlit);
    ctx.shadowColor = css(bar, 0.6);
    ctx.shadowBlur = t * 1.4;
    ctx.fillStyle = css(bar, 0.6);
    ctx.beginPath();
    mark(ctx, bx, by, l, t, 0, 0);
    mark(ctx, bx + l * 0.2, by + t * 0.5, l * 0.5, t * 0.6, 0, 0);
    ctx.fill();
    // The edge that faces the light: below when the Sun is low, above otherwise.
    ctx.fillStyle = css(mix(palette.cloudLight, palette.glow, 0.5 * light.backlit), 0.7);
    ctx.beginPath();
    const side = light.y > 0.15 ? 1 : -1;
    mark(ctx, bx + light.x * l * 0.06, by + side * t * 0.4, l * 0.84, t * 0.34, 0, side * t * 0.12);
    ctx.shadowBlur = t * 0.5;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0,0,0,0)';
}

/** Altocumulus: a rippled field of small puffs in loose rows, each lit on the side of the light. */
export function altocumulus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  palette: Palette,
  light: CloudLight,
  random: () => number,
) {
  const rows = 3 + Math.floor(random() * 2);
  const slant = (random() - 0.5) * 0.5;
  const shade: Rgb = mix(palette.cloudBody, palette.cloudShadow, 0.3 + 0.4 * light.backlit);
  const lit: Rgb = mix(palette.cloudLight, palette.glow, 0.4 * light.backlit);
  for (let row = 0; row < rows; row++) {
    const n = 4 + Math.floor(random() * 4);
    for (let i = 0; i < n; i++) {
      const u = (i - n / 2) * size * 1.25 + (random() - 0.5) * size * 0.5,
        px = x + u + row * size * 0.4,
        py = y + (row - rows / 2) * size * 0.72 + u * slant * 0.3 + (random() - 0.5) * size * 0.2,
        r = size * (0.3 + random() * 0.26);
      ctx.fillStyle = css(shade, 0.7);
      ctx.beginPath();
      ctx.ellipse(px, py, r * 1.5, r * 0.8, slant * 0.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = css(lit, 0.85);
      ctx.beginPath();
      ctx.ellipse(px + light.x * r * 0.3, py + light.y * r * 0.28, r * 1.2, r * 0.52, slant * 0.3, 0, TAU);
      ctx.fill();
    }
  }
}

/** Cirrus: a sheaf of long feathered strokes swept one way, hooked at the windward end. */
export function cirrus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  palette: Palette,
  light: CloudLight,
  random: () => number,
) {
  const tilt = (random() - 0.5) * 0.45;
  const colour = mix(palette.cloudLight, palette.glow, 0.5 * light.backlit);
  for (let i = 0; i < 9; i++) {
    const l = length * (0.4 + random() * 0.7),
      ox = (random() - 0.5) * length * 0.4,
      oy = (random() - 0.5) * length * 0.14;
    ctx.fillStyle = css(colour, 0.16 + random() * 0.26);
    ctx.beginPath();
    mark(
      ctx,
      x + ox,
      y + oy + ox * Math.sin(tilt),
      l,
      length * (0.006 + random() * 0.012),
      tilt,
      -l * (0.03 + random() * 0.05),
    );
    ctx.fill();
  }
  glowAt(ctx, x, y, length * 0.3, colour, 0.06);
}

/** A sheet of cloud for a mostly overcast sky: broad soft bands that leave gaps of sky between. */
export function cloudSheet(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  bottom: number,
  palette: Palette,
  light: CloudLight,
  random: () => number,
  amount: number,
) {
  const bands = Math.round(5 + amount * 9);
  for (let i = 0; i < bands; i++) {
    const t = random();
    const y = lerp(top, bottom, t * t);
    const l = width * (0.5 + random() * 0.7);
    const thick = (bottom - top) * (0.035 + 0.05 * (1 - t) + random() * 0.02);
    const x = random() * width;
    ctx.fillStyle = css(mix(palette.cloudBody, palette.cloudShadow, 0.25 + random() * 0.4), 0.3 * amount);
    ctx.beginPath();
    mark(ctx, x, y, l, thick, (random() - 0.5) * 0.06, 0);
    ctx.fill();
    ctx.fillStyle = css(palette.cloudLight, clamp01(0.16 * amount * (1 - light.backlit * 0.5)));
    ctx.beginPath();
    mark(ctx, x + light.x * l * 0.05, y - thick * 0.45, l * 0.8, thick * 0.4, 0, -thick * 0.1);
    ctx.fill();
  }
}
