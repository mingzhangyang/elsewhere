import * as Astronomy from 'astronomy-engine';
import type { Star } from '../types';
import { invalidInput, SkyEngineError } from '../errors';
import { assetFailed, validateTimeout } from '../resources';

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
/** One decoded HYG row; the shipped JSON stores exactly the same values column-wise. */
export type CatalogRow = (string | number | null)[];

/** The line patterns drawn on the sky; the interface names them in its language. */
export type PatternId = 'big-dipper' | 'orion' | 'crux' | 'summer-triangle';

export interface Constellation {
  id: PatternId;
  /** Pairs of catalog star IDs. */
  lines: string[][];
}

/**
 * The catalog is about 96 kB compressed, so it loads after the first screen rather than before it.
 * Until `loadStarCatalog()` resolves, these are empty and the sky shows the Sun and Moon only. They
 * are live bindings: importers see the catalog once it arrives.
 */
export let STAR_CATALOG: CatalogStar[] = [];
export let CONSTELLATIONS: Constellation[] = [];
let loading: Promise<void> | null = null;
let loadingWith: (() => Promise<CatalogRow[]>) | null = null;
let warnedIgnoredLoader = false;

export const starCatalogLoaded = () => STAR_CATALOG.length > 0;

/** In-flight or completed installation for this module. Null only before the first attempt
 * and after a failed one, so another caller can join instead of starting a second load. */
export function starCatalogInstallation(): Promise<void> | null {
  return loading;
}

/**
 * Wait for the installation another caller already started. The timeout rejects only this
 * waiter: it does not clear `loading` or abort the consumer that started the work.
 */
export function awaitStarCatalog(timeoutMs = 15000): Promise<void> {
  validateTimeout(timeoutMs);
  if (!loading) {
    return starCatalogLoaded()
      ? Promise.resolve()
      : Promise.reject(new SkyEngineError('MISSING_ASSET', 'Star catalog is not loading.'));
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SkyEngineError('TIMEOUT', 'Star catalog timed out.')), timeoutMs);
  });
  return Promise.race([loading, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Installs the catalog once from `load` (services/starCatalog.ts in the app, the file system in
 * tests and scripts). Any failure, in loading or in installing, clears the attempt so a later call
 * starts over.
 *
 * There is one installation per module instance. While an installation is in flight, or after one
 * has succeeded, the `load` argument is ignored and **not called**: the call returns the existing
 * promise, whichever function started it. Only a failed attempt lets a later `load` run. Passing a
 * different function while one is in flight logs a single `console.warn` per module instance; the
 * return value is the same either way.
 *
 * Failures of the returned promise reject it with a `SkyEngineError`: `ASSET_FAILED` (with the
 * original error as `cause`) for a rejected `load`, `INVALID_INPUT` for rows that cannot be
 * installed. A `load` that throws synchronously instead of returning a promise throws synchronously
 * from this call, as an `ASSET_FAILED` `SkyEngineError` with the same `cause`; nothing is installed
 * or retained, and a later call can start over.
 */
export function loadStarCatalog(load: () => Promise<CatalogRow[]>): Promise<void> {
  if (loading) {
    if (!starCatalogLoaded() && load !== loadingWith && !warnedIgnoredLoader) {
      warnedIgnoredLoader = true;
      console.warn(
        'Sky Engine: a star catalog installation is already in progress; the new load function is ignored.',
      );
    }
    return loading;
  }
  // A synchronous throw from `load` propagates to the caller as before, with nothing retained.
  let rows: Promise<CatalogRow[]>;
  try {
    rows = load();
  } catch (error) {
    throw assetFailed('Star catalog', error);
  }
  // Kept only while in flight, to recognise a different function; released once settled so the
  // host's loader and its closure are not retained for the module's lifetime.
  loadingWith = load;
  loading = rows
    .then(installCatalog, (error: unknown) => {
      throw assetFailed('Star catalog', error);
    })
    .then(
      () => {
        loadingWith = null;
      },
      (error: unknown) => {
        loading = null;
        loadingWith = null;
        throw error;
      },
    );
  return loading;
}

function installCatalog(rows: CatalogRow[]) {
  if (!Array.isArray(rows) || rows.length === 0) throw invalidInput('Invalid star catalog.');
  const seen = new Set<number>();
  const catalog = rows.map((row) => {
    const star = catalogStar(row);
    if (seen.has(star.catalogId)) throw invalidInput(`Duplicate star catalog id: ${star.catalogId}`);
    seen.add(star.catalogId);
    return star;
  });
  const constellations = PATTERNS.map((pattern) => ({
    ...pattern,
    lines: pattern.lines.map((pair) =>
      pair.map((name) => {
        const star = catalog.find((s) => s.name.toLowerCase() === name);
        if (!star) throw invalidInput(`Missing pattern star: ${name}`);
        return star.id;
      }),
    ),
  }));
  CONSTELLATIONS = constellations;
  STAR_CATALOG = catalog;
}

function catalogId(value: unknown): number {
  const id =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw invalidInput('Invalid star catalog identifier.');
  return id;
}

function finiteField(value: unknown, label: string): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) throw invalidInput(`Invalid star catalog ${label}.`);
  return n;
}

/** Reject rows that would corrupt the shared catalog before that catalog is published. */
function catalogStar(row: CatalogRow): CatalogStar {
  if (!Array.isArray(row) || row.length !== 8) throw invalidInput('Invalid star catalog row.');
  const id = catalogId(row[0]);
  if (typeof row[1] !== 'string') throw invalidInput('Invalid star catalog name.');
  const ra = finiteField(row[2], 'right ascension');
  const dec = finiteField(row[3], 'declination');
  if (ra < 0 || ra > 24) throw invalidInput('Invalid star catalog right ascension.');
  if (dec < -90 || dec > 90) throw invalidInput('Invalid star catalog declination.');
  const magnitude = finiteField(row[4], 'magnitude');
  if (magnitude < -5 || magnitude > 15) throw invalidInput('Invalid star catalog magnitude.');
  let colorIndex: number | null = null;
  if (row[5] !== null) {
    colorIndex = finiteField(row[5], 'color index');
    if (colorIndex < -2 || colorIndex > 6) throw invalidInput('Invalid star catalog color index.');
  }
  const pmra = finiteField(row[6], 'proper motion');
  const pmdec = finiteField(row[7], 'proper motion');
  if (Math.abs(pmra) > 20000 || Math.abs(pmdec) > 20000)
    throw invalidInput('Invalid star catalog proper motion.');
  return { id: 'hyg-' + id, catalogId: id, name: row[1], ra, dec, magnitude, colorIndex, pmra, pmdec };
}

// Original, deliberately simplified teaching patterns; these are not IAU boundaries.
const PATTERNS: Constellation[] = [
  {
    id: 'big-dipper',
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
    id: 'orion',
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
    id: 'crux',
    lines: [
      ['acrux', 'gacrux'],
      ['mimosa', 'imai'],
    ],
  },
  {
    id: 'summer-triangle',
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

function precessionAngles(date: Date) {
  const julianDay = date.getTime() / 86_400_000 + 2_440_587.5;
  const t = (julianDay - 2_451_545.0) / 36_525;
  const arcsecToRad = Math.PI / (180 * 3600);
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * arcsecToRad;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * arcsecToRad;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * arcsecToRad;
  return { zeta, z, theta };
}

/** Row-major rotation from J2000 equatorial directions to the equator/equinox of the date. */
export function precessionMatrixJ2000ToDate(date: Date): number[] {
  const { zeta, z, theta } = precessionAngles(date);
  const [cz, sz, ct, st, cze, sze] = [
    Math.cos(z),
    Math.sin(z),
    Math.cos(theta),
    Math.sin(theta),
    Math.cos(zeta),
    Math.sin(zeta),
  ];
  // The same Rz(z) * Ry(-theta) * Rz(zeta) used by precessJ2000 below.
  // prettier-ignore
  return [
    cz * ct * cze - sz * sze, -cz * ct * sze - sz * cze, -cz * st,
    sz * ct * cze + cz * sze, -sz * ct * sze + cz * cze, -sz * st,
    st * cze, -st * sze, ct,
  ];
}

function precessJ2000(
  raHours: number,
  decDegrees: number,
  date: Date,
): { raHours: number; decDegrees: number } {
  const { zeta, z, theta } = precessionAngles(date);
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
  /** Row-major J2000-to-date precession; the procedural galaxy uses this to follow the stars. */
  precession: number[];
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
  // apparentStarVectors samples its epoch at UTC noon and reuses it for the entire UTC day.
  const catalogDay = Math.floor(date.getTime() / DAY_MS);
  return {
    vectors: apparentStarVectors(date),
    rotation: equatorialToScene(latitude, longitude, greenwichSiderealHours),
    precession: precessionMatrixJ2000ToDate(new Date((catalogDay + 0.5) * DAY_MS)),
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
