import type {
  LocationInfo,
  WeatherMeasurements,
  WeatherPoint,
  WeatherResult,
  WeatherSelection,
  WeatherValues,
} from '../types';
import { getZonedParts, localDayBounds } from './time';
import { validateObserver } from '../domain/observer';

export const WEATHER_FIELDS = {
  temperature: 'temperature_2m',
  humidity: 'relative_humidity_2m',
  precipitation: 'precipitation',
  weatherCode: 'weather_code',
  cloudCover: 'cloud_cover',
  cloudLow: 'cloud_cover_low',
  cloudMid: 'cloud_cover_mid',
  cloudHigh: 'cloud_cover_high',
  visibilityKm: 'visibility',
  windSpeed: 'wind_speed_10m',
  windDirection: 'wind_direction_10m',
  pressure: 'pressure_msl',
} as const;
const EMPTY: WeatherMeasurements = Object.fromEntries(
  [...Object.keys(WEATHER_FIELDS), 'haze'].map((key) => [key, null]),
) as WeatherMeasurements;
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
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Weather service returned an invalid response.');
  return value as Record<string, unknown>;
}
function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function validValue(field: keyof typeof WEATHER_FIELDS, value: unknown): number | null {
  const n = number(value);
  if (n === null) return null;
  if (['cloudCover', 'cloudLow', 'cloudMid', 'cloudHigh', 'humidity'].includes(field) && (n < 0 || n > 100))
    return null;
  if (['visibilityKm', 'windSpeed', 'precipitation'].includes(field) && n < 0) return null;
  if (field === 'windDirection' && (n < 0 || n > 360)) return null;
  if (
    field === 'weatherCode' &&
    ![
      0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96,
      99,
    ].includes(n)
  )
    return null;
  return field === 'visibilityKm' ? n / 1000 : n;
}
function measurements(data: Record<string, unknown>, index?: number): WeatherMeasurements {
  const values = { ...EMPTY };
  for (const field of Object.keys(WEATHER_FIELDS) as (keyof typeof WEATHER_FIELDS)[]) {
    const raw = data[WEATHER_FIELDS[field]];
    values[field] = validValue(field, index === undefined ? raw : Array.isArray(raw) ? raw[index] : null);
  }
  values.haze =
    values.visibilityKm === null
      ? null
      : Math.max(0, Math.min(100, (1 - Math.min(60, values.visibilityKm) / 60) * 70));
  return values;
}

export interface WeatherRequestOptions {
  signal?: AbortSignal;
  now?: Date;
}
export async function fetchWeatherForDate(
  location: LocationInfo,
  requestedDate: Date,
  options: WeatherRequestOptions = {},
): Promise<WeatherResult> {
  validateObserver(location);
  const now = options.now ?? new Date();
  const requested = getZonedParts(requestedDate, location.timezone);
  const today = getZonedParts(now, location.timezone);
  const days = Math.round((Date.parse(requested.date) - Date.parse(today.date)) / 86400000);
  const key = weatherKey(location, requestedDate);
  const base = { key, fetchedAt: now.getTime() };
  if (days > 15 || requested.year < 1940)
    return {
      ...base,
      status: 'unavailable',
      message: 'Weather data does not cover this date. Choose custom weather to explore this sky.',
    };
  const archive = days < -5;
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    elevation: String(location.elevation),
    hourly: Object.values(WEATHER_FIELDS)
      .filter((field) => !archive || field !== 'visibility')
      .join(','),
    timezone: 'UTC',
    timeformat: 'unixtime',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  });
  // Request complete UTC days bracketing the civil day; DST boundaries are handled locally.
  const bounds = localDayBounds(requestedDate, location.timezone);
  const requestedStart = new Date(bounds.start.getTime() - 3600000).toISOString().slice(0, 10);
  const requestedEnd = bounds.end.toISOString().slice(0, 10);
  const lastForecastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 15))
    .toISOString()
    .slice(0, 10);
  const endDay = archive || requestedEnd < lastForecastDay ? requestedEnd : lastForecastDay;
  const startDay = requestedStart < '1940-01-01' ? '1940-01-01' : requestedStart;
  if (startDay > endDay)
    return {
      ...base,
      status: 'unavailable',
      message: 'This local day falls beyond the weather provider’s UTC coverage.',
    };
  params.set('start_date', startDay);
  params.set('end_date', endDay);
  if (!archive) params.set('current', Object.values(WEATHER_FIELDS).join(','));
  try {
    const timeout = AbortSignal.timeout(12000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const response = await fetch(
      `https://${archive ? 'archive-api' : 'api'}.open-meteo.com/v1/${archive ? 'archive' : 'forecast'}?${params}`,
      { signal },
    );
    const payload: unknown = await response.json();
    const data = record(payload);
    if (!response.ok) {
      const reason = typeof data.reason === 'string' ? data.reason : `HTTP ${response.status}`;
      throw new Error(
        response.status === 429
          ? 'Weather service is busy. Try refreshing in a moment.'
          : `Weather service: ${reason}`,
      );
    }
    const hourlyData = record(data.hourly);
    if (!Array.isArray(hourlyData.time)) throw new Error('Weather service returned no hourly timeline.');
    const hourly = hourlyData.time.map((value, i): WeatherPoint => {
      const seconds = number(value);
      if (seconds === null) throw new Error('Weather service returned an invalid timestamp.');
      return { time: seconds * 1000, values: measurements(hourlyData, i) };
    });
    if (!hourly.length)
      return { ...base, status: 'unavailable', message: 'No weather samples are available for this date.' };
    if (hourly.some((row, i) => i > 0 && row.time <= hourly[i - 1].time))
      throw new Error('Weather timeline is not ordered.');
    let current: WeatherPoint | undefined;
    if (data.current && typeof data.current === 'object') {
      const c = record(data.current);
      const time = number(c.time);
      if (time !== null) current = { time: time * 1000, values: measurements(c) };
    }
    return {
      ...base,
      status: 'ready',
      source: archive ? 'historical' : days < 0 ? 'recent' : 'forecast',
      start: Math.max(bounds.start.getTime(), hourly[0].time),
      end: Math.min(bounds.end.getTime(), hourly[hourly.length - 1].time + 3600000),
      hourly,
      current,
    };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return {
      ...base,
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not load weather. Try refreshing.',
    };
  }
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

export async function searchLocations(query: string, signal?: AbortSignal): Promise<LocationInfo[]> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: query, count: '8', language: 'en', format: 'json' }).toString();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Location search failed (${response.status}). Try again.`);
  const data = record(await response.json());
  if (!Array.isArray(data.results)) return [];
  return data.results.flatMap((raw): LocationInfo[] => {
    const item = record(raw);
    const latitude = number(item.latitude),
      longitude = number(item.longitude);
    if (latitude === null || longitude === null || typeof item.timezone !== 'string') return [];
    const location = {
      id: `${String(item.id)}-${latitude}-${longitude}`,
      name: String(item.name ?? 'Place'),
      country: [item.admin1, item.country].filter(Boolean).join(', '),
      latitude,
      longitude,
      elevation: number(item.elevation) ?? 0,
      timezone: item.timezone,
    };
    try {
      validateObserver(location);
      return [location];
    } catch {
      return [];
    }
  });
}
export function weatherDescription(code: number | null): string {
  if (code === null) return 'Condition unavailable';
  if (code === 0) return 'Clear sky';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorm';
}
export function weatherSourceLabel(selection: WeatherSelection): string {
  if (!selection.source) return selection.status === 'loading' ? 'Loading weather' : 'Weather unavailable';
  const prefix =
    selection.cacheState === 'stale'
      ? 'Stale cached · '
      : selection.cacheState === 'cached'
        ? 'Cached · '
        : '';
  return (
    prefix +
    {
      current: 'Current model estimate',
      forecast: 'Forecast',
      recent: 'Recent weather model',
      historical: 'Historical reanalysis',
    }[selection.source]
  );
}
