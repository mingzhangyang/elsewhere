import type { SkyState, Star, WeatherValues } from '../types';
import type { Preferences } from './persistence';

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
  if (object.kind === 'star' && sky.sunAltitude > -3)
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
  if (weather.haze >= 65 || weather.visibilityKm < 5)
    return {
      reason: 'haze',
      label: 'Poor atmospheric visibility',
      detail: 'Haze reduces contrast in this view. The marker shows the calculated position.',
    };
  if (object.kind === 'star') {
    const limit =
      (preferences.skyBrightness === 'city' ? 3 : preferences.skyBrightness === 'suburban' ? 4.5 : 6) -
      Math.max(0, Math.sin((sky.moon.altitude * Math.PI) / 180)) * sky.moon.illumination * 1.6;
    const extinction = 0.2 / Math.max(0.08, Math.sin((object.altitude * Math.PI) / 180)) - 0.2;
    if (object.magnitude + extinction > limit - 0.5)
      return {
        reason: 'faint',
        label: 'Faint in this sky',
        detail:
          'Its brightness, elevation, moonlight, and the selected light pollution reduce its visibility.',
      };
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
    detail: 'Look inside the position marker. Object sizes are true to scale; zoom for a closer view.',
  };
}
