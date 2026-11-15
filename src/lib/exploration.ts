import type { HorizontalPosition, Planet, SkyState, Star, WeatherValues } from '../types';
import { MIN_FOV, type CameraView, type Preferences } from './persistence';
import {
  planetVisibilityFactors,
  STAR_VISIBLE_THRESHOLD,
  starVisibilityFactors,
  twilightVisibility,
} from '../domain/starVisibility';

export type SkyObject =
  | (SkyState['sun'] & { id: 'sun'; name: string; kind: 'sun' })
  | (SkyState['moon'] & { id: 'moon'; name: string; kind: 'moon' })
  | (Planet & { kind: 'planet' })
  | (Star & { kind: 'star' });

/** The Sun, the Moon, the planets (innermost first), then the catalog's stars, brightest first. */
export function skyObjects(sky: SkyState): SkyObject[] {
  return [
    { ...sky.sun, id: 'sun', name: 'Sun', kind: 'sun' },
    { ...sky.moon, id: 'moon', name: 'Moon', kind: 'moon' },
    ...sky.planets.map((planet) => ({ ...planet, kind: 'planet' as const })),
    ...sky.stars.map((star) => ({
      ...star,
      name: star.name || star.id.toUpperCase(),
      kind: 'star' as const,
    })),
  ];
}
export function aboveHorizon(object: SkyObject): boolean {
  return object.kind === 'star' ? object.altitude > 0 : object.visible;
}
export function findSkyObject(sky: SkyState, id: string | null): SkyObject | undefined {
  if (!id) return undefined;
  if (id === 'sun') return { ...sky.sun, id: 'sun', name: 'Sun', kind: 'sun' };
  if (id === 'moon') return { ...sky.moon, id: 'moon', name: 'Moon', kind: 'moon' };
  const planet = sky.planets.find((p) => p.id === id);
  if (planet) return { ...planet, kind: 'planet' };
  const star = sky.stars.find((s) => s.id === id);
  return star && { ...star, name: star.name || star.id.toUpperCase(), kind: 'star' };
}

/** Physical radius in km, for apparent size. */
const RADIUS_KM = { sun: 695_700, moon: 1737.4 };

/** Apparent (equatorial) angular diameter of the Sun, Moon or a planet, in degrees; 0 for stars. */
export function angularDiameter(object: SkyObject): number {
  if (object.kind === 'star') return 0;
  const radius = object.kind === 'planet' ? object.radiusKm : RADIUS_KM[object.kind];
  return (2 * Math.asin(radius / object.distanceKm) * 180) / Math.PI;
}

/**
 * Field of view that frames an object when it is centered: the Sun or Moon fills about a quarter
 * of the view height so its surface is visible. Stars and planets, which are points at any zoom the
 * view allows, and bodies below the horizon keep the current zoom (undefined).
 */
export function framingFov(object: SkyObject): number | undefined {
  if (object.kind === 'star' || object.kind === 'planet' || !aboveHorizon(object)) return undefined;
  return Math.max(MIN_FOV, angularDiameter(object) * 4);
}

/** An object within this share of the field of view from the view's center counts as centered. */
export const CENTERED_FRACTION = 0.05;

/**
 * Whether the camera still faces an object: after panning, or as time moves it across the sky, a
 * once-centered object no longer is, and a shared link must not claim it.
 */
export function isCentered(object: HorizontalPosition, view: CameraView): boolean {
  const rad = Math.PI / 180;
  const cos =
    Math.sin(object.altitude * rad) * Math.sin(view.altitude * rad) +
    Math.cos(object.altitude * rad) *
      Math.cos(view.altitude * rad) *
      Math.cos((object.azimuth - view.heading) * rad);
  const separation = Math.acos(Math.min(1, Math.max(-1, cos))) / rad;
  return separation <= view.fov * CENTERED_FRACTION;
}

/** Sirius, the brightest star in the night sky. */
const BRIGHTEST_STAR_MAGNITUDE = -1.46;
/**
 * Within this many degrees of the Sun, a planet carries an eye-safety warning while the Sun is up,
 * and one hidden by daylight is described as lost in its glare.
 */
export const SUN_GLARE_ELONGATION = 15;

/**
 * Why an object can or cannot be seen, with the values a sentence about it needs. The interface turns
 * it into a label and an explanation in the active language (src/i18n).
 */
export type Visibility =
  | {
      reason: 'horizon' | 'layer' | 'ridge' | 'haze' | 'faint' | 'phase' | 'daylight-moon' | 'partial-cloud';
    }
  /** A planet beside a risen Sun: an eye-safety warning. */
  | { reason: 'near-sun'; elongation: number }
  /** Hidden by daylight; `glare` when a planet is also close to the Sun. */
  | { reason: 'daylight'; subject: 'star' | 'planet'; glare: boolean; elongation: number }
  | { reason: 'cloud'; cloudCover: number }
  | { reason: 'twilight'; subject: 'star' | 'planet' }
  | { reason: 'clear'; subject: 'star' | 'planet' | 'sun' | 'moon'; brighterThanAnyStar: boolean };
export type VisibilityReason = Visibility['reason'];

/** A visibility explanation, not a claim to know the real cloud mask along a sightline. */
export function objectVisibility(
  object: SkyObject,
  sky: SkyState,
  weather: WeatherValues,
  preferences: Preferences,
): Visibility {
  if (!aboveHorizon(object)) return { reason: 'horizon' };
  // Safety first: whatever else limits the view, never send anyone searching beside a risen Sun.
  if (object.kind === 'planet' && sky.sun.visible && object.elongation < SUN_GLARE_ELONGATION)
    return { reason: 'near-sun', elongation: object.elongation };
  if (object.kind === 'star' && !preferences.layers.stars) return { reason: 'layer' };
  if (preferences.horizon === 'ridge' && object.altitude < 1.5) return { reason: 'ridge' };
  const factors =
    object.kind === 'star'
      ? starVisibilityFactors(object, sky, weather, preferences.skyBrightness)
      : object.kind === 'planet'
        ? planetVisibilityFactors(object, sky, weather, preferences.skyBrightness)
        : undefined;
  if (object.kind === 'star' && twilightVisibility(sky.sunAltitude) === 0)
    return { reason: 'daylight', subject: 'star', glare: false, elongation: 0 };
  if (object.kind === 'planet' && factors?.twilight === 0)
    return {
      reason: 'daylight',
      subject: 'planet',
      glare: object.elongation < SUN_GLARE_ELONGATION,
      elongation: object.elongation,
    };
  if (weather.cloudCover >= 85) return { reason: 'cloud', cloudCover: weather.cloudCover };
  if (weather.haze >= 65 || weather.visibilityKm < 5) return { reason: 'haze' };
  if (factors && factors.combined < STAR_VISIBLE_THRESHOLD) {
    // Name whichever factor dims the drawn point most, so the reason matches what the picture shows.
    const weakest = Math.min(factors.twilight, factors.magnitude, factors.weather);
    if (factors.twilight === weakest)
      return { reason: 'twilight', subject: object.kind === 'planet' ? 'planet' : 'star' };
    if (factors.weather === weakest) return { reason: 'haze' };
    return { reason: 'faint' };
  }
  if (object.kind === 'moon' && sky.moon.illumination < 0.06) return { reason: 'phase' };
  if (object.kind === 'moon' && sky.sunAltitude > 0) return { reason: 'daylight-moon' };
  if (weather.cloudCover > 20) return { reason: 'partial-cloud' };
  return {
    reason: 'clear',
    subject: object.kind,
    brighterThanAnyStar: object.kind === 'planet' && object.magnitude < BRIGHTEST_STAR_MAGNITUDE,
  };
}
