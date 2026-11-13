import type { Star } from '../types';
import rows from '../data/stars.json';

// HYG v4.1 derivative, David Nash / Astronexus, CC BY-SA 4.0.
// Rows: HYG ID, name, J2000 RA hours, Dec degrees, V magnitude, B-V, pmRA*cosDec and pmDec (mas/year).
// Provenance and reproducible import: public/credits.html and scripts/import-stars.mjs.
export interface CatalogStar { id: string; catalogId: number; name: string; ra: number; dec: number; magnitude: number; colorIndex: number | null; pmra: number; pmdec: number }
export const STAR_CATALOG: CatalogStar[] = rows.map((r) => ({
  id: 'hyg-' + r[0], catalogId: Number(r[0]), name: String(r[1]),
  ra: Number(r[2]), dec: Number(r[3]), magnitude: Number(r[4]), colorIndex: r[5] === null ? null : Number(r[5]), pmra: Number(r[6]), pmdec: Number(r[7]),
}));

// Original, deliberately simplified teaching patterns; these are not IAU boundaries.
export const CONSTELLATIONS = [
  { name: 'Big Dipper · asterism', lines: [['dubhe', 'merak'], ['merak', 'phecda'], ['phecda', 'megrez'], ['megrez', 'alioth'], ['alioth', 'mizar'], ['mizar', 'alkaid'], ['dubhe', 'megrez']] },
  { name: 'Orion', lines: [['betelgeuse', 'bellatrix'], ['bellatrix', 'mintaka'], ['mintaka', 'alnilam'], ['alnilam', 'alnitak'], ['alnitak', 'betelgeuse'], ['rigel', 'mintaka'], ['alnitak', 'saiph'], ['saiph', 'rigel']] },
  { name: 'Crux', lines: [['acrux', 'gacrux'], ['mimosa', 'imai']] },
  { name: 'Summer Triangle · asterism', lines: [['deneb', 'vega'], ['deneb', 'altair'], ['vega', 'altair']] },
].map((pattern) => ({ ...pattern, lines: pattern.lines.map((pair) => pair.map((name) => {
  const star = STAR_CATALOG.find((s) => s.name.toLowerCase() === name);
  if (!star) throw new Error(`Missing pattern star: ${name}`);
  return star.id;
})) }));

// Tangent-plane proper motion avoids singular RA corrections near the poles.
export function movedEquatorial(star: CatalogStar, years: number) {
  const a = star.ra * Math.PI / 12, d = star.dec * Math.PI / 180;
  const scale = years * Math.PI / (180 * 3600000);
  const x = Math.cos(d) * Math.cos(a) - scale * (star.pmra * Math.sin(a) + star.pmdec * Math.sin(d) * Math.cos(a));
  const y = Math.cos(d) * Math.sin(a) + scale * (star.pmra * Math.cos(a) - star.pmdec * Math.sin(d) * Math.sin(a));
  const z = Math.sin(d) + scale * star.pmdec * Math.cos(d);
  return { ra: ((Math.atan2(y, x) * 12 / Math.PI) + 24) % 24, dec: Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI };
}

export function horizontalFromEquatorial(
  raHours: number,
  decDegrees: number,
  latitude: number,
  longitude: number,
  greenwichSiderealHours: number,
): { altitude: number; azimuth: number } {
  const rad = Math.PI / 180;
  const phi = latitude * rad;
  const dec = decDegrees * rad;
  const localSiderealDegrees = ((greenwichSiderealHours * 15 + longitude) % 360 + 360) % 360;
  let hourAngle = (localSiderealDegrees - raHours * 15) % 360;
  if (hourAngle > 180) hourAngle -= 360;
  if (hourAngle < -180) hourAngle += 360;
  const h = hourAngle * rad;
  const sinAltitude = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(h);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude))) / rad;
  const azimuth = (Math.atan2(
    -Math.cos(dec) * Math.sin(h),
    Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(h) * Math.sin(phi),
  ) / rad + 360) % 360;
  return { altitude, azimuth };
}

function precessJ2000(raHours: number, decDegrees: number, date: Date): { raHours: number; decDegrees: number } {
  const julianDay = date.getTime() / 86_400_000 + 2_440_587.5;
  const t = (julianDay - 2_451_545.0) / 36_525;
  const arcsecToRad = Math.PI / (180 * 3600);
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * arcsecToRad;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * arcsecToRad;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * arcsecToRad;
  const ra = raHours * 15 * Math.PI / 180;
  const dec = decDegrees * Math.PI / 180;
  const a = Math.cos(dec) * Math.sin(ra + zeta);
  const b = Math.cos(theta) * Math.cos(dec) * Math.cos(ra + zeta) - Math.sin(theta) * Math.sin(dec);
  const c = Math.sin(theta) * Math.cos(dec) * Math.cos(ra + zeta) + Math.cos(theta) * Math.sin(dec);
  const nextRa = (Math.atan2(a, b) + z + Math.PI * 2) % (Math.PI * 2);
  const nextDec = Math.asin(Math.max(-1, Math.min(1, c)));
  return { raHours: nextRa * 12 / Math.PI, decDegrees: nextDec * 180 / Math.PI };
}

export function calculateStarPositions(
  latitude: number,
  longitude: number,
  date: Date,
  greenwichSiderealHours: number,
): Star[] {
  return STAR_CATALOG.map((star) => {
    const moved = movedEquatorial(star, (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (365.25 * 86400000));
    const apparentEquator = precessJ2000(moved.ra, moved.dec, date);
    return {
      id: star.id,
      name: star.name,
      magnitude: star.magnitude,
      colorIndex: star.colorIndex,
      ra: star.ra,
      dec: star.dec,
      ...horizontalFromEquatorial(apparentEquator.raHours, apparentEquator.decDegrees, latitude, longitude, greenwichSiderealHours),
    };
  });
}
