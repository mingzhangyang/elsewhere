import type { PlanetId, SkyState, Star } from '../types';
import { invalidInput, SkyEngineError } from '../errors';

/** Independent diagram policy, not the explorer's environment-dependent visibility limit. */
export const DEFAULT_SKY_CHART_LIMITING_MAGNITUDE = 6.0;
export const SKY_CHART_MAGNITUDE_RANGE = { min: -5, max: 20 } as const;

const PLANET_ORDER: readonly PlanetId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

type Position = Readonly<{ altitude: number; azimuth: number }>;
type StarCandidate = Pick<Star, 'id' | 'name' | 'altitude' | 'azimuth' | 'magnitude' | 'colorIndex'>;

/** Already calculated positions; no catalog loader, weather, browser or UI state is consulted. */
export interface SkyChartCandidates {
  readonly sun: Pick<SkyState['sun'], 'altitude' | 'azimuth'>;
  readonly moon: Pick<SkyState['moon'], 'altitude' | 'azimuth'>;
  readonly planets: readonly (Position & { readonly id: PlanetId })[];
  readonly stars: readonly StarCandidate[];
  /** Required: false is not equivalent to a loaded catalog with zero selected stars. */
  readonly starCatalogReady: boolean;
}

export interface SkyChartSelectionOptions {
  /** Inclusive, finite magnitude in [-5, 20]; defaults to 6.0. Applies only to stars. */
  readonly limitingMagnitude?: number;
}

export type SkyChartSelectedObject =
  | (Position & { readonly kind: 'sun'; readonly id: 'sun' })
  | (Position & { readonly kind: 'moon'; readonly id: 'moon' })
  | (Position & { readonly kind: 'planet'; readonly id: PlanetId })
  | (Position & {
      readonly kind: 'star';
      readonly id: string;
      readonly name: string;
      readonly magnitude: number;
      readonly colorIndex: number | null;
    });

export interface SkyChartSelection {
  readonly limitingMagnitude: number;
  /** Sun, Moon, planets in solar-system order, then stars ordered by exact ID. */
  readonly objects: readonly SkyChartSelectedObject[];
}

/** SM2-C must wait for starCatalogLoaded() before supplying complete candidates. */
/** A `MISSING_ASSET` SkyEngineError; the subclass exists only so the app can recognise it. */
export class SkyChartCatalogNotReadyError extends SkyEngineError {
  constructor() {
    super('MISSING_ASSET', 'Sky chart star catalog is not ready.');
  }
}

function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidInput(`${label} must be an object.`);
  }
}

function requirePosition<T>(value: T, label: string): asserts value is T & Position {
  requireRecord(value, label);
  const { altitude, azimuth } = value;
  // The same input contract as projectSkyChart; validate even excluded objects.
  if (typeof altitude !== 'number' || !Number.isFinite(altitude) || altitude < -90 || altitude > 90) {
    throw invalidInput(`${label} apparent center altitude must be finite and within [-90, 90].`);
  }
  if (typeof azimuth !== 'number' || !Number.isFinite(azimuth)) {
    throw invalidInput(`${label} azimuth must be finite.`);
  }
}

/**
 * Select the geometrically above-horizon objects for a memorial sky diagram.
 * All inputs are standard-refracted *center* altitudes and north-clockwise azimuths in degrees.
 * This is deliberately unrelated to real-world visual visibility or body.visible.
 *
 * Rejects damaged/missing candidates, duplicate IDs, invalid positions/magnitudes/options,
 * and an explicitly unready catalog. Empty planet/star arrays are allowed when ready; SM2-C
 * owns catalog/body completeness and resource loading. Does not mutate or retain inputs.
 */
export function selectSkyChartObjects(
  candidates: SkyChartCandidates,
  options?: SkyChartSelectionOptions,
): SkyChartSelection {
  requireRecord(candidates, 'Sky chart candidates');
  if (options !== undefined) requireRecord(options, 'Sky chart options');
  const limit =
    options?.limitingMagnitude === undefined
      ? DEFAULT_SKY_CHART_LIMITING_MAGNITUDE
      : options.limitingMagnitude;
  if (
    typeof limit !== 'number' ||
    !Number.isFinite(limit) ||
    limit < SKY_CHART_MAGNITUDE_RANGE.min ||
    limit > SKY_CHART_MAGNITUDE_RANGE.max
  ) {
    throw invalidInput('Sky chart limiting magnitude must be finite and within [-5, 20].');
  }
  if (typeof candidates.starCatalogReady !== 'boolean') {
    throw invalidInput('starCatalogReady must be a boolean.');
  }
  if (!Array.isArray(candidates.planets) || !Array.isArray(candidates.stars)) {
    throw invalidInput('Sky chart planets and stars must be arrays.');
  }
  if (!candidates.starCatalogReady) throw new SkyChartCatalogNotReadyError();

  const ids = new Set<string>();
  const registerId = (id: unknown, label: string) => {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw invalidInput(`${label} ID must be a nonempty string.`);
    }
    if (ids.has(id)) throw invalidInput(`Duplicate sky chart object ID: ${id}`);
    ids.add(id);
  };
  const objects: SkyChartSelectedObject[] = [];
  for (const [kind, body] of [
    ['sun', candidates.sun],
    ['moon', candidates.moon],
  ] as const) {
    requirePosition(body, kind);
    registerId(kind, kind);
    if (body.altitude >= 0) {
      if (kind === 'sun') {
        objects.push({ kind: 'sun', id: 'sun', altitude: body.altitude, azimuth: body.azimuth });
      } else {
        objects.push({ kind: 'moon', id: 'moon', altitude: body.altitude, azimuth: body.azimuth });
      }
    }
  }

  const planets: Extract<SkyChartSelectedObject, { kind: 'planet' }>[] = [];
  for (const planet of candidates.planets) {
    requirePosition(planet, 'planet');
    if (!PLANET_ORDER.includes(planet.id)) throw invalidInput(`Unknown sky chart planet: ${planet.id}`);
    registerId(planet.id, 'planet');
    if (planet.altitude >= 0) {
      planets.push({
        kind: 'planet',
        id: planet.id,
        altitude: planet.altitude,
        azimuth: planet.azimuth,
      });
    }
  }
  planets.sort((a, b) => PLANET_ORDER.indexOf(a.id) - PLANET_ORDER.indexOf(b.id));
  objects.push(...planets);

  const stars: Extract<SkyChartSelectedObject, { kind: 'star' }>[] = [];
  for (const star of candidates.stars) {
    requirePosition(star, 'star');
    registerId(star.id, 'star');
    if (typeof star.name !== 'string') throw invalidInput(`Star ${star.id} name must be a string.`);
    if (typeof star.magnitude !== 'number' || !Number.isFinite(star.magnitude)) {
      throw invalidInput(`Star ${star.id} magnitude must be finite.`);
    }
    if (
      star.colorIndex != null &&
      (typeof star.colorIndex !== 'number' || !Number.isFinite(star.colorIndex))
    ) {
      throw invalidInput(`Star ${star.id} color index must be finite or null.`);
    }
    if (star.altitude >= 0 && star.magnitude <= limit) {
      stars.push({
        kind: 'star',
        id: star.id,
        name: star.name,
        altitude: star.altitude,
        azimuth: star.azimuth,
        magnitude: star.magnitude,
        colorIndex: star.colorIndex ?? null,
      });
    }
  }
  // Codepoint comparison avoids device locale / Intl state affecting snapshot order.
  stars.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  objects.push(...stars);
  return { limitingMagnitude: limit, objects };
}
