import type { SkyState, Star, WeatherValues } from '../types';

/** Illustrative light-pollution setting chosen by the visitor. */
export type SkyBrightness = 'dark' | 'suburban' | 'city';

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
  skyBrightness: SkyBrightness,
  moon: Pick<SkyState['moon'], 'altitude' | 'illumination'>,
): number {
  const base = skyBrightness === 'city' ? 3 : skyBrightness === 'suburban' ? 4.5 : 6;
  return base - Math.max(0, sinDeg(moon.altitude)) * moon.illumination * 1.6;
}

/**
 * Model constants. The star shader is generated from these same values (renderer/starMaterial.ts),
 * so the GPU and this reference implementation stay in step.
 */
export const STAR_MODEL = {
  /** Extinction at the zenith, in magnitudes per air mass. */
  extinction: 0.2,
  /** Air mass is capped where sin(altitude) falls below this. */
  minSinAltitude: 0.08,
  /** Stars fade from fully visible at `limit + fadeStart` to hidden at `limit + fadeEnd`. */
  fadeStart: -1,
  fadeEnd: 0.3,
  /** Display intensity is 10^(intensitySlope · magnitude), clamped to [minIntensity, 1]. */
  intensitySlope: -0.16,
  minIntensity: 0.15,
} as const;

/** Magnitudes lost to the longer air path near the horizon; 0 at the zenith. */
export function atmosphericExtinction(altitude: number): number {
  const { extinction, minSinAltitude } = STAR_MODEL;
  return extinction / Math.max(minSinAltitude, sinDeg(altitude)) - extinction;
}

/** 0–1: how much a star of this magnitude and altitude survives the limiting magnitude. */
export function magnitudeVisibility(star: Pick<Star, 'altitude' | 'magnitude'>, limit: number): number {
  if (star.altitude <= 0) return 0;
  const apparent = star.magnitude + atmosphericExtinction(star.altitude);
  return 1 - smoothstep(apparent, limit + STAR_MODEL.fadeStart, limit + STAR_MODEL.fadeEnd);
}

/** Display intensity by catalog brightness; dims faint stars without hiding them. */
export function starIntensity(magnitude: number): number {
  return clamp(10 ** (STAR_MODEL.intensitySlope * magnitude), STAR_MODEL.minIntensity, 1);
}

/** On-screen point size, in CSS pixels, by catalog brightness. */
export function starPointSize(magnitude: number): number {
  return Math.max(1.35, 4.1 - magnitude * 0.5);
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
  skyBrightness: SkyBrightness,
): StarVisibilityFactors {
  const twilight = twilightVisibility(sky.sunAltitude);
  const magnitude = magnitudeVisibility(star, limitingMagnitude(skyBrightness, sky.moon));
  const contrast = weatherVisibility(weather);
  return { twilight, magnitude, weather: contrast, combined: twilight * magnitude * contrast };
}
