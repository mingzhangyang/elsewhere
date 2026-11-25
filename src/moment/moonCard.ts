import type { I18n } from '../i18n';
import { placeLabel } from '../i18n/names';
import { isDeviceLocation } from '../lib/locations';
import type { MomentSnapshot } from '../lib/moment';
import { labelFontReady } from '../renderer/labelFont';
import { PAPER } from '../../packages/sky-engine/src/moment/paintFinish';
import { sdkImageCopy } from './imageCopy';
import { drawMoonPortrait, type MoonPortraitSettings } from './moonPortrait';
import { FONT, wrap } from './postcard';

/** Text describes the frozen observer/time, never the live clock or exact device coordinates. */
export function moonCardText(
  snapshot: MomentSnapshot,
  settings: MoonPortraitSettings,
  i18n: I18n,
  site: string,
) {
  const { m } = i18n;
  const copy = sdkImageCopy[i18n.locale];
  const { location, instant, sky } = snapshot;
  const { moon } = sky;
  const place = isDeviceLocation(location)
    ? { name: m.moment.devicePlace, country: '' }
    : placeLabel(location, i18n);
  const zone = location.timezone;
  const when = m.moment.when({
    date: m.f.date(instant, zone),
    time: m.f.time(instant, zone),
    zone: m.f.zone(zone, instant),
  });
  return {
    title: place.name,
    when: [place.country, when].filter(Boolean).join(' · '),
    phase: m.moment.moon({
      phase: m.phases[moon.phase],
      illumination: moon.illumination * 100,
      up: moon.visible,
    }),
    facts:
      `${copy.distance} ≈ ${m.f.number(Math.round(moon.distanceKm / 100) * 100)} ${copy.km}` +
      ` · ${m.objects.altitude} ${m.f.number(moon.altitude, 1)}°`,
    credit: `${settings.orientation === 'observer' ? copy.observer : copy.northUp} · ${copy.credit}`,
    site,
  };
}

interface MoonCardInput {
  snapshot: MomentSnapshot;
  size: number;
  settings: MoonPortraitSettings;
  i18n: I18n;
  site: string;
  signal?: AbortSignal;
}

const WIDTH = 1200;
const PAD = 48;

/**
 * The share-only Moon card. Keep the existing square PNG sizes (including the 4096px
 * canvas limit), reserving space for a paper information panel instead of enlarging
 * the bitmap. The inspector thumbnail and SDK still render a bare Moon.
 */
export async function drawMoonCard({
  snapshot,
  size,
  settings,
  i18n,
  site,
  signal,
}: MoonCardInput): Promise<HTMLCanvasElement> {
  const text = moonCardText(snapshot, settings, i18n, site);
  await labelFontReady(Object.values(text).join(' '));
  if (signal?.aborted) throw new Error('Moon card cancelled.');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');

  const ink = '#1d2433',
    soft = '#4a5468',
    faint = '#6b7385';
  const lines = [
    { text: text.title, size: 48, weight: 700, colour: ink, gap: 8 },
    { text: text.when, size: 26, weight: 500, colour: soft, gap: 18 },
    { text: text.phase, size: 32, weight: 700, colour: ink, gap: 8 },
    { text: text.facts, size: 26, weight: 500, colour: ink, gap: 16 },
    { text: text.credit, size: 20, weight: 400, colour: faint, gap: 8 },
    { text: text.site, size: 18, weight: 600, colour: faint, gap: 0 },
  ].map((line) => {
    ctx.font = `${line.weight} ${line.size}px ${FONT}`;
    return { ...line, rows: wrap(ctx, line.text, WIDTH - PAD * 2) };
  });
  const panelHeight =
    PAD * 2 + lines.reduce((sum, line) => sum + line.rows.length * line.size * 1.3 + line.gap, 0);
  const scale = size / WIDTH;
  // Long localized place/time labels can wrap. Preserve at least 58% for the Moon
  // and fit the complete measured panel into the remaining space.
  const moonHeight = Math.max(Math.round(size * 0.58), size - Math.ceil(panelHeight * scale));
  const panelScale = Math.min(scale, (size - moonHeight) / panelHeight);
  const portrait = await drawMoonPortrait(snapshot, size, settings, signal, moonHeight);
  try {
    if (signal?.aborted) throw new Error('Moon card cancelled.');
    canvas.width = canvas.height = size;
    ctx.drawImage(portrait, 0, 0);
  } finally {
    // Release the temporary high-resolution lunar raster before PNG encoding.
    portrait.width = portrait.height = 1;
  }
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, moonHeight, size, size - moonHeight);
  ctx.translate((size - WIDTH * panelScale) / 2, moonHeight);
  ctx.scale(panelScale, panelScale);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = PAD;
  for (const line of lines) {
    ctx.font = `${line.weight} ${line.size}px ${FONT}`;
    ctx.fillStyle = line.colour;
    for (const row of line.rows) {
      ctx.fillText(row, PAD, y, WIDTH - PAD * 2);
      y += line.size * 1.3;
    }
    y += line.gap;
  }
  return canvas;
}
