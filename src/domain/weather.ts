import type {
  LocationInfo,
  WeatherMeasurements,
  WeatherPoint,
  WeatherResult,
  WeatherSelection,
  WeatherValues,
} from '../types';
import { getZonedParts } from './time';

/**
 * Weather as the simulation uses it: which sample applies at an instant, how samples interpolate,
 * and what the renderer assumes where a measurement is missing. Fetching lives in services/.
 */

export const defaultWeatherValues = (): WeatherValues => ({
  cloudCover: 0,
  cloudLow: 0,
  cloudMid: 0,
  cloudHigh: 0,
  visibilityKm: 30,
  visibilityAvailable: false,
  haze: 0,
  humidity: 50,
  windSpeed: 0,
  windDirection: 0,
  precipitation: 0,
  temperature: 15,
  pressure: 1013,
  weatherCode: 0,
});

export function weatherKey(location: LocationInfo, date: Date): string {
  return `${location.latitude},${location.longitude},${location.elevation},${location.timezone},${getZonedParts(date, location.timezone).date}`;
}
export function selectWeather(
  result: WeatherResult | null,
  location: LocationInfo,
  instant: Date,
): WeatherSelection {
  if (!result || result.key !== weatherKey(location, instant))
    return { status: 'loading', values: null, message: 'Loading weather for this place and day…' };
  if (result.status !== 'ready') return { status: result.status, values: null, message: result.message };
  const target = instant.getTime();
  if (target < result.start || target >= result.end)
    return { status: 'unavailable', values: null, message: 'No weather coverage for this instant.' };
  const current =
    result.current && Math.abs(target - result.current.time) <= 15 * 60000 ? result.current : undefined;
  let values: WeatherMeasurements;
  let sampledAt: number;
  if (current) {
    values = current.values;
    sampledAt = current.time;
  } else {
    let before: WeatherPoint | undefined;
    for (const row of result.hourly) {
      if (row.time > target) break;
      before = row;
    }
    const after = result.hourly.find((row) => row.time > target);
    const nearest = before ?? after;
    if (!nearest || Math.abs(nearest.time - target) > 3600000)
      return { status: 'unavailable', values: null, message: 'No weather sample close to this instant.' };
    sampledAt = nearest.time;
    values = { ...nearest.values };
    // Hourly precipitation (and the weather code derived from it) covers the hour ending at its timestamp.
    const period = result.hourly.find((row) => row.time >= target);
    if (period && period.time - target < 3600000) {
      values.precipitation = period.values.precipitation;
      values.weatherCode = period.values.weatherCode;
    }
    if (before && after && after.time - before.time <= 3600000) {
      const t = (target - before.time) / (after.time - before.time);
      for (const key of Object.keys(values) as (keyof WeatherMeasurements)[]) {
        const a = before.values[key],
          b = after.values[key];
        if (key === 'weatherCode' || key === 'precipitation') continue;
        if (a === null || b === null) {
          values[key] = null;
          continue;
        }
        values[key] =
          key === 'windDirection' ? (a + (((b - a + 540) % 360) - 180) * t + 360) % 360 : a + (b - a) * t;
      }
    }
  }
  return {
    status: Object.values(values).some((value) => value === null) ? 'partial' : 'ready',
    values,
    source: current ? 'current' : result.source,
    sampledAt,
    fetchedAt: result.fetchedAt,
    cacheState: result.cacheState,
    message: result.notice,
  };
}

/** Presentation assumptions are confined to the renderer, never to source readouts. */
export function renderingWeather(selection: WeatherSelection): WeatherValues {
  const defaults = defaultWeatherValues();
  if (!selection.values) return defaults;
  for (const key of Object.keys(selection.values) as (keyof WeatherMeasurements)[]) {
    const value = selection.values[key];
    if (value !== null) defaults[key] = value;
  }
  defaults.visibilityAvailable = selection.values.visibilityKm !== null;
  return defaults;
}
export function customConditions(
  weather: WeatherValues,
  field?: keyof WeatherValues,
  value?: number,
): WeatherValues {
  const next = { ...weather, ...(field ? { [field]: value } : {}), visibilityAvailable: true };
  if (field !== 'weatherCode')
    next.weatherCode =
      next.precipitation > 0
        ? next.temperature < 0
          ? 73
          : 63
        : next.cloudCover > 80
          ? 3
          : next.cloudCover > 20
            ? 2
            : 0;
  return next;
}
