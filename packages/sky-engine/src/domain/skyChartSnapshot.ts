import type { LocationInfo, MoonPhaseKey, PlanetId, SkyState } from '../types';
import { validateObserver } from './observer';
import { projectSkyChart, type SkyChartPoint } from './skyChartProjection';
import {
  DEFAULT_SKY_CHART_LIMITING_MAGNITUDE,
  SKY_CHART_MAGNITUDE_RANGE,
  SkyChartCatalogNotReadyError,
  selectSkyChartObjects,
  type SkyChartSelectedObject,
} from './skyChartSelection';
import { STAR_CATALOG, starCatalogLoaded, type CatalogStar } from './stars';
import { validateInstant } from './time';
import { invalidInput } from '../errors';

/** Pure domain input: a canonical UTC instant plus one explicit observer. */
export interface SkyChartSnapshotInput {
  readonly time: { readonly kind: 'utc'; readonly utc: string };
  readonly location: LocationInfo;
  readonly limitingMagnitude?: number;
}

export interface PreparedSkyChartSnapshotInput {
  readonly utc: string;
  readonly time: Readonly<{
    kind: 'utc' | 'exact' | 'reference';
    referenceSource?: 'default' | 'user';
    disambiguation: 'earlier' | 'later' | null;
    offset?: string;
  }>;
  readonly location: Readonly<LocationInfo>;
  readonly limitingMagnitude: number;
}

type ChartPosition = SkyChartPoint & { readonly altitude: number; readonly azimuth: number };
export type SkyChartSnapshotObject =
  | (Extract<SkyChartSelectedObject, { kind: 'sun' }> & ChartPosition & { readonly distanceKm: number })
  | (Extract<SkyChartSelectedObject, { kind: 'moon' }> &
      ChartPosition & {
        readonly phase: MoonPhaseKey;
        readonly phaseAngle: number;
        readonly illumination: number;
        readonly waxing: boolean;
        readonly distanceKm: number;
      })
  | (Extract<SkyChartSelectedObject, { kind: 'planet' }> &
      ChartPosition & {
        readonly name: string;
        readonly magnitude: number;
        readonly illumination: number;
        readonly phaseAngle: number;
        readonly distanceKm: number;
        readonly radiusKm: number;
        readonly elongation: number;
        readonly apparition: 'morning' | 'evening';
      })
  | (Extract<SkyChartSelectedObject, { kind: 'star' }> & ChartPosition);

export interface SkyChartSnapshot {
  /** Snapshot schema, not a scientific precision or ephemeris release claim. */
  readonly formatVersion: 1;
  readonly utc: string;
  readonly time: PreparedSkyChartSnapshotInput['time'];
  readonly location: Readonly<LocationInfo>;
  readonly options: Readonly<{ limitingMagnitude: number }>;
  readonly provenance: Readonly<{
    catalog: 'HYG v4.1 derivative';
    catalogStarCount: number;
    calculation: 'calculateSky / astronomy-engine';
    refraction: 'normal';
    projection: 'azimuthal-equidistant';
    selection: 'SM2-B';
    /** No trustworthy content hash is exposed by the existing lazy loader. */
    catalogHash: null;
  }>;
  readonly objects: readonly SkyChartSnapshotObject[];
}

/** Current generated HYG v4.1 derivative (see scripts/import-stars.mjs and SCIENCE.md). */
export const EXPECTED_HYG_DERIVATIVE_STAR_COUNT = 5070;

const PLANET_IDS: readonly PlanetId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
const PHASES: readonly MoonPhaseKey[] = [
  'new',
  'waxing-crescent',
  'first-quarter',
  'waxing-gibbous',
  'full',
  'waning-gibbous',
  'last-quarter',
  'waning-crescent',
];

function requireRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidInput(`${name} must be an object.`);
  }
}

function finite(value: unknown, label: string, min = -Infinity, max = Infinity): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw invalidInput(`${label} must be finite and in its valid range.`);
  }
}

function nonempty(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidInput(`${label} must be a nonempty string.`);
  }
}

function copyLocation(location: LocationInfo): Readonly<LocationInfo> {
  requireRecord(location, 'Snapshot location');
  nonempty(location.timezone, 'Location timezone');
  validateObserver(location);
  for (const key of ['id', 'name', 'country'] as const) nonempty(location[key], `Location ${key}`);
  if (location.source !== undefined && location.source !== 'device') {
    throw invalidInput('Unknown location source.');
  }
  return Object.freeze({
    id: location.id,
    name: location.name,
    country: location.country,
    latitude: location.latitude,
    longitude: location.longitude,
    elevation: location.elevation,
    timezone: location.timezone,
    ...(location.source === 'device' ? { source: 'device' as const } : {}),
  });
}

/** Captures and validates every input before any asynchronous resource wait. */
export function prepareSkyChartSnapshotInput(input: SkyChartSnapshotInput): PreparedSkyChartSnapshotInput {
  requireRecord(input, 'Snapshot input');
  requireRecord(input.time, 'Snapshot time');
  const time = input.time;
  if (time.kind !== 'utc') {
    throw invalidInput('Expected a canonical UTC instant; resolved SM1 times must use the service adapter.');
  }
  const utc = time.utc;
  const timeMetadata: PreparedSkyChartSnapshotInput['time'] = { kind: 'utc', disambiguation: null };
  if (typeof utc !== 'string') throw invalidInput('UTC must be a canonical ISO string.');
  const date = new Date(utc);
  validateInstant(date);
  if (utc !== date.toISOString()) throw invalidInput('UTC must be a canonical millisecond ISO instant.');
  const magnitude = input.limitingMagnitude ?? DEFAULT_SKY_CHART_LIMITING_MAGNITUDE;
  finite(magnitude, 'Limiting magnitude', SKY_CHART_MAGNITUDE_RANGE.min, SKY_CHART_MAGNITUDE_RANGE.max);
  return Object.freeze({
    utc,
    time: Object.freeze(timeMetadata),
    location: copyLocation(input.location),
    limitingMagnitude: magnitude,
  });
}

/** Verifies actual nonempty HYG resource data, not a caller-supplied boolean. */
export function assertSkyChartCatalog(catalog: readonly CatalogStar[]): void {
  if (!Array.isArray(catalog) || catalog.length === 0) throw new SkyChartCatalogNotReadyError();
  const ids = new Set<string>();
  for (const star of catalog) {
    requireRecord(star, 'Catalog star');
    nonempty(star.id, 'Catalog star ID');
    if (typeof star.name !== 'string') throw invalidInput(`Catalog star ${star.id} name must be a string.`);
    finite(star.catalogId, `Catalog star ${star.id} catalog ID`, 0);
    if (!Number.isSafeInteger(star.catalogId) || star.id !== `hyg-${star.catalogId}`) {
      throw invalidInput('Invalid HYG catalog star identifier.');
    }
    if (ids.has(star.id)) throw invalidInput(`Duplicate catalog star: ${star.id}`);
    ids.add(star.id);
    finite(star.ra, `Catalog star ${star.id} RA`, 0, 24);
    finite(star.dec, `Catalog star ${star.id} declination`, -90, 90);
    finite(star.magnitude, `Catalog star ${star.id} magnitude`);
    if (star.colorIndex !== null) finite(star.colorIndex, `Catalog star ${star.id} color`);
    finite(star.pmra, `Catalog star ${star.id} pmRA`);
    finite(star.pmdec, `Catalog star ${star.id} pmDec`);
  }
}

function assertSkyComplete(sky: SkyState, catalog: readonly CatalogStar[]): void {
  requireRecord(sky, 'Calculated sky');
  requireRecord(sky.sun, 'Calculated Sun');
  requireRecord(sky.moon, 'Calculated Moon');
  finite(sky.sun.distanceKm, 'Sun distance', Number.MIN_VALUE);
  finite(sky.moon.distanceKm, 'Moon distance', Number.MIN_VALUE);
  finite(sky.moon.illumination, 'Moon illumination', 0, 1);
  finite(sky.moon.phaseAngle, 'Moon phase angle', 0, 360);
  if (!PHASES.includes(sky.moon.phase) || typeof sky.moon.waxing !== 'boolean') {
    throw invalidInput('Incomplete Moon phase information.');
  }
  if (!Array.isArray(sky.planets) || sky.planets.length !== PLANET_IDS.length) {
    throw invalidInput('A complete five-planet calculation is required.');
  }
  const seenPlanets = new Set<PlanetId>();
  for (const planet of sky.planets) {
    requireRecord(planet, 'Calculated planet');
    if (!PLANET_IDS.includes(planet.id) || seenPlanets.has(planet.id)) {
      throw invalidInput('Unknown or duplicate calculated planet.');
    }
    seenPlanets.add(planet.id);
    nonempty(planet.name, `Planet ${planet.id} name`);
    finite(planet.magnitude, `Planet ${planet.id} magnitude`);
    finite(planet.illumination, `Planet ${planet.id} illumination`, 0, 1);
    finite(planet.phaseAngle, `Planet ${planet.id} phase angle`, 0, 180);
    finite(planet.elongation, `Planet ${planet.id} elongation`, 0, 180);
    finite(planet.distanceKm, `Planet ${planet.id} distance`, Number.MIN_VALUE);
    finite(planet.radiusKm, `Planet ${planet.id} radius`, Number.MIN_VALUE);
    if (planet.apparition !== 'morning' && planet.apparition !== 'evening') {
      throw invalidInput(`Planet ${planet.id} apparition is missing.`);
    }
  }
  if (!Array.isArray(sky.stars) || sky.stars.length !== catalog.length) {
    throw invalidInput('Calculated star positions do not match the loaded catalog.');
  }
  const byId = new Map(catalog.map((star) => [star.id, star]));
  const seenStars = new Set<string>();
  for (const star of sky.stars) {
    requireRecord(star, 'Calculated star');
    const catalogStar = byId.get(star.id);
    if (!catalogStar || seenStars.has(star.id)) throw invalidInput('Missing or duplicate calculated star.');
    seenStars.add(star.id);
    if (
      star.name !== catalogStar.name ||
      star.magnitude !== catalogStar.magnitude ||
      (star.colorIndex ?? null) !== catalogStar.colorIndex ||
      star.ra !== catalogStar.ra ||
      star.dec !== catalogStar.dec
    ) {
      throw invalidInput(`Calculated star ${star.id} does not match loaded catalog.`);
    }
  }
  // The original field is not copied into the snapshot, but its integrity must be checked.
  requireRecord(sky.starField, 'Calculated star field');
  if (
    !(sky.starField.vectors instanceof Float32Array) ||
    sky.starField.vectors.length !== catalog.length * 3 ||
    !Array.isArray(sky.starField.rotation) ||
    sky.starField.rotation.length !== 9 ||
    !Array.isArray(sky.starField.precession) ||
    sky.starField.precession.length !== 9 ||
    !sky.starField.rotation.every(Number.isFinite) ||
    !sky.starField.precession.every(Number.isFinite) ||
    !sky.starField.vectors.every(Number.isFinite)
  ) {
    throw invalidInput('Incomplete calculated star field.');
  }
}

/** Pure and synchronous; never fetches resources or reads device/explorer/weather state. */
export function buildSkyChartSnapshot(
  input: SkyChartSnapshotInput,
  sky: SkyState,
  catalog: readonly CatalogStar[] = STAR_CATALOG,
): SkyChartSnapshot {
  return buildPreparedSkyChartSnapshot(prepareSkyChartSnapshotInput(input), sky, catalog);
}

/** For coordinators only: uses the input captured before awaiting resources. */
export function buildPreparedSkyChartSnapshot(
  input: PreparedSkyChartSnapshotInput,
  sky: SkyState,
  catalog: readonly CatalogStar[] = STAR_CATALOG,
): SkyChartSnapshot {
  if (catalog === STAR_CATALOG && !starCatalogLoaded()) throw new SkyChartCatalogNotReadyError();
  assertSkyChartCatalog(catalog);
  if (catalog === STAR_CATALOG && catalog.length !== EXPECTED_HYG_DERIVATIVE_STAR_COUNT) {
    throw invalidInput('Incomplete bundled HYG derivative catalog.');
  }
  assertSkyComplete(sky, catalog);
  const selected = selectSkyChartObjects(
    { sun: sky.sun, moon: sky.moon, planets: sky.planets, stars: sky.stars, starCatalogReady: true },
    { limitingMagnitude: input.limitingMagnitude },
  );
  const planets = new Map(sky.planets.map((planet) => [planet.id, planet]));
  const objects: SkyChartSnapshotObject[] = selected.objects.map((object) => {
    const point = projectSkyChart(object.altitude, object.azimuth);
    if (
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      Math.hypot(point.x, point.y) > 1 + 1e-12
    ) {
      throw invalidInput(`Invalid projected sky chart object: ${object.id}`);
    }
    const pointCoordinates = { x: point.x, y: point.y };
    switch (object.kind) {
      case 'sun':
        return Object.freeze({ ...object, ...pointCoordinates, distanceKm: sky.sun.distanceKm });
      case 'moon':
        return Object.freeze({
          ...object,
          ...pointCoordinates,
          phase: sky.moon.phase,
          phaseAngle: sky.moon.phaseAngle,
          illumination: sky.moon.illumination,
          waxing: sky.moon.waxing,
          distanceKm: sky.moon.distanceKm,
        });
      case 'planet': {
        const planet = planets.get(object.id);
        if (!planet) throw invalidInput(`Calculated planet missing: ${object.id}`);
        return Object.freeze({
          ...object,
          ...pointCoordinates,
          name: planet.name,
          magnitude: planet.magnitude,
          illumination: planet.illumination,
          phaseAngle: planet.phaseAngle,
          distanceKm: planet.distanceKm,
          radiusKm: planet.radiusKm,
          elongation: planet.elongation,
          apparition: planet.apparition,
        });
      }
      case 'star':
        return Object.freeze({ ...object, ...pointCoordinates });
    }
  });
  return Object.freeze({
    formatVersion: 1,
    utc: input.utc,
    time: Object.freeze({ ...input.time }),
    location: Object.freeze({ ...input.location }),
    options: Object.freeze({ limitingMagnitude: selected.limitingMagnitude }),
    provenance: Object.freeze({
      catalog: 'HYG v4.1 derivative',
      catalogStarCount: catalog.length,
      calculation: 'calculateSky / astronomy-engine',
      refraction: 'normal',
      projection: 'azimuthal-equidistant',
      selection: 'SM2-B',
      catalogHash: null,
    }),
    objects: Object.freeze(objects),
  });
}
