import type { SkyState, Star, WeatherValues } from '../types';
import { MIN_FOV, type Preferences } from './persistence';
import { STAR_VISIBLE_THRESHOLD, starVisibilityFactors, twilightVisibility } from './starVisibility';

export type SkyObject =
  | (SkyState['sun'] & { id: 'sun'; name: string; kind: 'sun' })
  | (SkyState['moon'] & { id: 'moon'; name: string; kind: 'moon' })
  | (Star & { kind: 'star' });

export function skyObjects(sky: SkyState): SkyObject[] {
  return [
    { ...sky.sun, id: 'sun', name: 'Sun', kind: 'sun' },
    { ...sky.moon, id: 'moon', name: 'Moon', kind: 'moon' },
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
  const star = sky.stars.find((s) => s.id === id);
  return star && { ...star, name: star.name || star.id.toUpperCase(), kind: 'star' };
}

/** Physical radius in km, for apparent size. */
const RADIUS_KM = { sun: 695_700, moon: 1737.4 };

/** Apparent angular diameter of the Sun or Moon, in degrees; 0 for stars. */
export function angularDiameter(object: SkyObject): number {
  if (object.kind === 'star') return 0;
  return (2 * Math.asin(RADIUS_KM[object.kind] / object.distanceKm) * 180) / Math.PI;
}

/**
 * Field of view that frames an object when it is centered: the Sun or Moon fills about a quarter
 * of the view height so its surface is visible. Stars, and bodies below the horizon, keep the
 * current zoom (undefined).
 */
export function framingFov(object: SkyObject): number | undefined {
  if (object.kind === 'star' || !aboveHorizon(object)) return undefined;
  return Math.max(MIN_FOV, angularDiameter(object) * 4);
}

const HAZE = {
  reason: 'haze',
  label: 'Poor atmospheric visibility',
  detail: 'Haze reduces contrast in this view. The marker shows the calculated position.',
};

/** A visibility explanation, not a claim to know the real cloud mask along a sightline. */
export function objectVisibility(
  object: SkyObject,
  sky: SkyState,
  weather: WeatherValues,
  preferences: Preferences,
) {
  if (!aboveHorizon(object))
    return {
      reason: 'horizon',
      label: 'Below the horizon',
      detail: 'Earth blocks this direction. Choose another time to bring it into view.',
    };
  if (object.kind === 'star' && !preferences.layers.stars)
    return {
      reason: 'layer',
      label: 'Stars are switched off',
      detail: 'Enable the stars layer to see this object.',
    };
  if (preferences.horizon === 'ridge' && object.altitude < 1.5)
    return {
      reason: 'ridge',
      label: 'Near the illustrated ridge',
      detail:
        'The ridge may cover this low position. Choose an unobstructed horizon in Layers for a clear view.',
    };
  if (object.kind === 'star' && twilightVisibility(sky.sunAltitude) === 0)
    return {
      reason: 'daylight',
      label: 'Hidden by daylight',
      detail: 'The position is above the horizon, but the bright sky hides this star.',
    };
  if (weather.cloudCover >= 85)
    return {
      reason: 'cloud',
      label: 'Heavy cloud cover',
      detail: `${Math.round(weather.cloudCover)}% cloud cover may obscure this object. The marker shows its calculated position.`,
    };
  if (weather.haze >= 65 || weather.visibilityKm < 5) return HAZE;
  if (object.kind === 'star') {
    const factors = starVisibilityFactors(object, sky, weather, preferences.skyBrightness);
    if (factors.combined < STAR_VISIBLE_THRESHOLD) {
      // Name whichever factor dims the drawn star most, so the reason matches what the picture shows.
      const weakest = Math.min(factors.twilight, factors.magnitude, factors.weather);
      if (factors.twilight === weakest)
        return {
          reason: 'twilight',
          label: 'Washed out by twilight',
          detail: 'Twilight still brightens the sky too much for this star. It appears as the sky darkens.',
        };
      if (factors.weather === weakest) return HAZE;
      return {
        reason: 'faint',
        label: 'Faint in this sky',
        detail:
          'Its brightness, elevation, moonlight, and the selected light pollution reduce its visibility.',
      };
    }
  }
  if (object.kind === 'moon' && sky.moon.illumination < 0.06)
    return {
      reason: 'phase',
      label: 'A very thin crescent',
      detail:
        'Very little of the Moon is illuminated. Look near the position marker; daylight can make it difficult to distinguish.',
    };
  if (object.kind === 'moon' && sky.sunAltitude > 0)
    return {
      reason: 'daylight-moon',
      label: 'A pale daytime Moon',
      detail: 'The Moon has low contrast against the daytime sky. Its apparent size is true to scale.',
    };
  if (weather.cloudCover > 20)
    return {
      reason: 'partial-cloud',
      label: 'Clouds may cross this view',
      detail:
        'The position is above the horizon. The cloud pattern is illustrative, not a measured local sky.',
    };
  return {
    reason: 'clear',
    label: 'Above the horizon',
    detail:
      object.kind === 'star'
        ? 'Look inside the position marker. Stars are drawn as points of light, brighter for brighter stars.'
        : `Centering frames the ${object.name} at true scale; zoom out to see it among the sky.`,
  };
}
