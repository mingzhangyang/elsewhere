import type { WeatherValues } from '../types';

/** Average precipitation rate, in mm/h, above which falling particles are drawn. */
export const PRECIPITATION_VISIBLE = 0.08;
/**
 * Overhead, the cloud deck drifts about 0.037° per second for each km/h of wind; below these levels
 * the motion is too slight or the deck too sparse to notice, so the scene stays static.
 */
export const CLOUD_DRIFT_MIN_COVER = 10;
export const CLOUD_DRIFT_MIN_WIND = 5;
/** Slow cloud drift reads as smooth at this rate; full-rate frames are kept for falling particles. */
export const CLOUD_DRIFT_FPS = 30;

export type WeatherMotion = 'none' | 'drift' | 'precipitation';

export function weatherMotion(
  weather: Pick<WeatherValues, 'cloudCover' | 'windSpeed' | 'precipitation'>,
  reducedMotion: boolean,
): WeatherMotion {
  if (reducedMotion) return 'none';
  if (weather.precipitation > PRECIPITATION_VISIBLE) return 'precipitation';
  if (weather.cloudCover >= CLOUD_DRIFT_MIN_COVER && weather.windSpeed >= CLOUD_DRIFT_MIN_WIND)
    return 'drift';
  return 'none';
}
