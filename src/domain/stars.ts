import * as Astronomy from 'astronomy-engine';
import type { Star } from '../types';

// HYG v4.1 derivative, David Nash / Astronexus, CC BY-SA 4.0.
// Rows: HYG ID, name, J2000 RA hours, Dec degrees, V magnitude, B-V, pmRA*cosDec and pmDec (mas/year).
// Provenance and reproducible import: public/credits.html and scripts/import-stars.mjs.
export interface CatalogStar {
  id: string;
  catalogId: number;
  name: string;
  ra: number;
  dec: number;
  magnitude: number;
  colorIndex: number | null;
  pmra: number;
  pmdec: number;
}
type CatalogRow = (string | number | null)[];

export interface Constellation {
  name: string;
  /** Pairs of catalog star IDs. */
  lines: string[][];
}

/**
 * The catalog is about 120 kB compressed, so it loads after the first screen rather than before it.
 * Until `loadStarCatalog()` resolves, these are empty and the sky shows the Sun and Moon only. They
 * are live bindings: importers see the catalog once it arrives.
 */
export let STAR_CATALOG: CatalogStar[] = [];
export let CONSTELLATIONS: Constellation[] = [];
let loading: Promise<void> | null = null;

export const starCatalogLoaded = () => STAR_CATALOG.length > 0;

/** Loads the catalog once; a failed attempt can be retried. */
export function loadStarCatalog(): Promise<void> {
  loading ??= import('../data/stars.json').then(
    (module) => installCatalog(module.default as CatalogRow[]),
    (error) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

function installCatalog(rows: CatalogRow[]) {
  const catalog = rows.map((r) => ({
    id: 'hyg-' + r[0],
    catalogId: Number(r[0]),
    name: String(r[1]),
    ra: Number(r[2]),
    dec: Number(r[3]),
    magnitude: Number(r[4]),
    colorIndex: r[5] === null ? null : Number(r[5]),
    pmra: Number(r[6]),
    pmdec: Number(r[7]),
  }));
  CONSTELLATIONS = PATTERNS.map((pattern) => ({
    ...pattern,
    lines: pattern.lines.map((pair) =>
      pair.map((name) => {
        const star = catalog.find((s) => s.name.toLowerCase() === name);
        if (!star) throw new Error(`Missing pattern star: ${name}`);
        return star.id;
      }),
    ),
  }));
  STAR_CATALOG = catalog;
}

// Original, deliberately simplified teaching patterns; these are not IAU boundaries.
const PATTERNS = [
  {
    name: 'Big Dipper · asterism',
    lines: [
      ['dubhe', 'merak'],
      ['merak', 'phecda'],
      ['phecda', 'megrez'],
      ['megrez', 'alioth'],
      ['alioth', 'mizar'],
      ['mizar', 'alkaid'],
      ['dubhe', 'megrez'],
    ],
  },
  {
    name: 'Orion',
    lines: [
      ['betelgeuse', 'bellatrix'],
      ['bellatrix', 'mintaka'],
      ['mintaka', 'alnilam'],
      ['alnilam', 'alnitak'],
      ['alnitak', 'betelgeuse'],
      ['rigel', 'mintaka'],
      ['alnitak', 'saiph'],
      ['saiph', 'rigel'],
    ],
  },
  {
    name: 'Crux',
    lines: [
      ['acrux', 'gacrux'],
      ['mimosa', 'imai'],
    ],
  },
  {
    name: 'Summer Triangle · asterism',
    lines: [
      ['deneb', 'vega'],
      ['deneb', 'altair'],
      ['vega', 'altair'],
    ],
  },
];

// Tangent-plane proper motion avoids singular RA corrections near the poles.
export function movedEquatorial(star: CatalogStar, years: number) {
  const a = (star.ra * Math.PI) / 12,
    d = (star.dec * Math.PI) / 180;
  const scale = (years * Math.PI) / (180 * 3600000);
  const x =
    Math.cos(d) * Math.cos(a) - scale * (star.pmra * Math.sin(a) + star.pmdec * Math.sin(d) * Math.cos(a));
  const y =
    Math.cos(d) * Math.sin(a) + scale * (star.pmra * Math.cos(a) - star.pmdec * Math.sin(d) * Math.sin(a));
  const z = Math.sin(d) + scale * star.pmdec * Math.cos(d);
  return {
    ra: ((Math.atan2(y, x) * 12) / Math.PI + 24) % 24,
    dec: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
  };
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
  const localSiderealDegrees = (((greenwichSiderealHours * 15 + longitude) % 360) + 360) % 360;
  let hourAngle = (localSiderealDegrees - raHours * 15) % 360;
  if (hourAngle > 180) hourAngle -= 360;
  if (hourAngle < -180) hourAngle += 360;
  const h = hourAngle * rad;
  const sinAltitude = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(h);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude))) / rad;
  const azimuth =
    (Math.atan2(
      -Math.cos(dec) * Math.sin(h),
      Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(h) * Math.sin(phi),
    ) /
      rad +
      360) %
    360;
  return { altitude, azimuth };
}

function precessJ2000(
  raHours: number,
  decDegrees: number,
  date: Date,
): { raHours: number; decDegrees: number } {
  const julianDay = date.getTime() / 86_400_000 + 2_440_587.5;
  const t = (julianDay - 2_451_545.0) / 36_525;
  const arcsecToRad = Math.PI / (180 * 3600);
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * arcsecToRad;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * arcsecToRad;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * arcsecToRad;
  const ra = (raHours * 15 * Math.PI) / 180;
  const dec = (decDegrees * Math.PI) / 180;
  const a = Math.cos(dec) * Math.sin(ra + zeta);
  const b = Math.cos(theta) * Math.cos(dec) * Math.cos(ra + zeta) - Math.sin(theta) * Math.sin(dec);
  const c = Math.sin(theta) * Math.cos(dec) * Math.cos(ra + zeta) + Math.cos(theta) * Math.sin(dec);
  const nextRa = (Math.atan2(a, b) + z + Math.PI * 2) % (Math.PI * 2);
  const nextDec = Math.asin(Math.max(-1, Math.min(1, c)));
  return { raHours: (nextRa * 12) / Math.PI, decDegrees: (nextDec * 180) / Math.PI };
}

/** Unit vectors of every catalog star in the true equator and equinox of a date (x: equinox, z: pole). */
export interface StarField {
  /** Interleaved x, y, z per catalog star, in STAR_CATALOG order. Shared and never mutated. */
  vectors: Float32Array;
  /**
   * Row-major 3×3 rotation from those vectors into the observer's scene frame (x east, y zenith,
   * z south). Every star shares it, so the sky turns as one rigid sphere.
   */
  rotation: number[];
}

const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
let vectorCache: { day: number; catalog: CatalogStar[]; vectors: Float32Array } | null = null;

/**
 * Proper motion and precession move a star by well under an arcsecond a day, so the catalog is
 * placed once per UTC day and reused for every instant in it.
 */
export function apparentStarVectors(date: Date): Float32Array {
  const day = Math.floor(date.getTime() / DAY_MS);
  if (vectorCache?.day === day && vectorCache.catalog === STAR_CATALOG) return vectorCache.vectors;
  const epoch = new Date((day + 0.5) * DAY_MS);
  const years = (epoch.getTime() - J2000_MS) / (365.25 * DAY_MS);
  const vectors = new Float32Array(STAR_CATALOG.length * 3);
  STAR_CATALOG.forEach((star, i) => {
    const moved = movedEquatorial(star, years);
    const { raHours, decDegrees } = precessJ2000(moved.ra, moved.dec, epoch);
    const ra = (raHours * Math.PI) / 12,
      dec = (decDegrees * Math.PI) / 180;
    vectors[i * 3] = Math.cos(dec) * Math.cos(ra);
    vectors[i * 3 + 1] = Math.cos(dec) * Math.sin(ra);
    vectors[i * 3 + 2] = Math.sin(dec);
  });
  vectorCache = { day, catalog: STAR_CATALOG, vectors };
  return vectors;
}

/** Rotation from equator-of-date vectors to the scene frame for an observer at local sidereal time. */
export function equatorialToScene(latitude: number, longitude: number, greenwichSiderealHours: number) {
  const theta = ((greenwichSiderealHours * 15 + longitude) * Math.PI) / 180;
  const phi = (latitude * Math.PI) / 180;
  const [st, ct, sp, cp] = [Math.sin(theta), Math.cos(theta), Math.sin(phi), Math.cos(phi)];
  // prettier-ignore
  return [
    -st, ct, 0,
    cp * ct, cp * st, sp,
    sp * ct, sp * st, -cp,
  ];
}

export function calculateStarField(
  latitude: number,
  longitude: number,
  date: Date,
  greenwichSiderealHours: number,
): StarField {
  return {
    vectors: apparentStarVectors(date),
    rotation: equatorialToScene(latitude, longitude, greenwichSiderealHours),
  };
}

export function calculateStarPositions(field: StarField): Star[] {
  const { vectors: v, rotation: m } = field;
  return STAR_CATALOG.map((star, i) => {
    const ex = v[i * 3],
      ey = v[i * 3 + 1],
      ez = v[i * 3 + 2];
    const x = m[0] * ex + m[1] * ey + m[2] * ez;
    const y = m[3] * ex + m[4] * ey + m[5] * ez;
    const z = m[6] * ex + m[7] * ey + m[8] * ez;
    const geometric = (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI;
    return {
      id: star.id,
      name: star.name,
      magnitude: star.magnitude,
      colorIndex: star.colorIndex,
      ra: star.ra,
      dec: star.dec,
      // The same standard-atmosphere refraction as the Sun and Moon, so low stars keep their places
      // beside them (up to about 0.5° at the horizon). The star shader applies the same formula.
      altitude: geometric + Astronomy.Refraction('normal', geometric),
      azimuth: ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360,
    };
  });
}
