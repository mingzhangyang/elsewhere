import type { SkyState, Star, WeatherValues } from '../types';
import type { Preferences } from './persistence';

/**
 * One star-visibility model shared by the renderer (what is drawn) and the exploration text (what
 * is said about it), so the description can never contradict the picture.
 */

/** Sun altitudes, in degrees, between which stars fade in: fully dark below, fully hidden above. */
export const TWILIGHT_DARK_ALTITUDE = -18;
export const TWILIGHT_BRIGHT_ALTITUDE = -3;

/** Combined visibility at or above which the text treats a star as visible. */
export const STAR_VISIBLE_THRESHOLD = 0.5;

function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const t = (x - min) / (max - min);
  return t * t * (3 - 2 * t);
}
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
const sinDeg = (deg: number) => Math.sin((deg * Math.PI) / 180);

/** 1 in a fully dark sky, 0 in daylight, eased through twilight. Applies to every star alike. */
export function twilightVisibility(sunAltitude: number): number {
  return 1 - smoothstep(sunAltitude, TWILIGHT_DARK_ALTITUDE, TWILIGHT_BRIGHT_ALTITUDE);
}

/** Faintest magnitude visible overhead for the chosen light pollution, reduced by a high bright Moon. */
export function limitingMagnitude(
  skyBrightness: Preferences['skyBrightness'],
  moon: Pick<SkyState['moon'], 'altitude' | 'illumination'>,
): number {
  const base = skyBrightness === 'city' ? 3 : skyBrightness === 'suburban' ? 4.5 : 6;
  return base - Math.max(0, sinDeg(moon.altitude)) * moon.illumination * 1.6;
}

/** Magnitudes lost to the longer air path near the horizon; 0 at the zenith. */
export function atmosphericExtinction(altitude: number): number {
  return 0.2 / Math.max(0.08, sinDeg(altitude)) - 0.2;
}

/** 0–1: how much a star of this magnitude and altitude survives the limiting magnitude. */
export function magnitudeVisibility(star: Pick<Star, 'altitude' | 'magnitude'>, limit: number): number {
  if (star.altitude <= 0) return 0;
  const apparent = star.magnitude + atmosphericExtinction(star.altitude);
  return 1 - smoothstep(apparent, limit - 1, limit + 0.3);
}

/** Display intensity by catalog brightness; dims faint stars without hiding them. */
export function starIntensity(magnitude: number): number {
  return clamp(10 ** (-0.16 * magnitude), 0.15, 1);
}

/** 0.1–1: overall contrast lost to reported haze and poor visibility. */
export function weatherVisibility(weather: Pick<WeatherValues, 'visibilityKm' | 'haze'>): number {
  return clamp(weather.visibilityKm / 28, 0.1, 1) * (1 - clamp(weather.haze / 125, 0, 0.85));
}

export interface StarVisibilityFactors {
  twilight: number;
  magnitude: number;
  weather: number;
  /** Product of the three factors: the share of the star's normal display the renderer keeps. */
  combined: number;
}

export function starVisibilityFactors(
  star: Pick<Star, 'altitude' | 'magnitude'>,
  sky: Pick<SkyState, 'sunAltitude' | 'moon'>,
  weather: Pick<WeatherValues, 'visibilityKm' | 'haze'>,
  skyBrightness: Preferences['skyBrightness'],
): StarVisibilityFactors {
  const twilight = twilightVisibility(sky.sunAltitude);
  const magnitude = magnitudeVisibility(star, limitingMagnitude(skyBrightness, sky.moon));
  const contrast = weatherVisibility(weather);
  return { twilight, magnitude, weather: contrast, combined: twilight * magnitude * contrast };
}
