import type { LocationInfo, WeatherMeasurements, WeatherPoint, WeatherResult } from '../types';
import { getZonedParts, localDayBounds } from '../domain/time';
import { validateObserver } from '../domain/observer';
import { weatherKey } from '../domain/weather';
import { isDeviceLocation } from '../lib/locations';
import { describeNetworkFailure, ReadableError } from '../lib/networkErrors';
import { finiteNumber as number, record } from './providerJson';

/** Open-Meteo forecast and archive client: request shape, response validation, provenance. */

const roundTo = (value: number, digits: number) => Number(value.toFixed(digits));

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
    // Device positions are rounded to about 1 km: plenty for weather, and no more precise than needed.
    latitude: String(isDeviceLocation(location) ? roundTo(location.latitude, 2) : location.latitude),
    longitude: String(isDeviceLocation(location) ? roundTo(location.longitude, 2) : location.longitude),
    // Device locations carry a placeholder sea-level elevation; let Open-Meteo use its terrain model.
    ...(isDeviceLocation(location) ? {} : { elevation: String(location.elevation) }),
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
      throw new ReadableError(
        response.status === 429
          ? 'Weather service is busy. Try refreshing in a moment.'
          : `Weather service: ${reason}`,
      );
    }
    const hourlyData = record(data.hourly);
    if (!Array.isArray(hourlyData.time))
      throw new ReadableError('Weather service returned no hourly timeline.');
    const hourly = hourlyData.time.map((value, i): WeatherPoint => {
      const seconds = number(value);
      if (seconds === null) throw new ReadableError('Weather service returned an invalid timestamp.');
      return { time: seconds * 1000, values: measurements(hourlyData, i) };
    });
    if (!hourly.length)
      return { ...base, status: 'unavailable', message: 'No weather samples are available for this date.' };
    if (hourly.some((row, i) => i > 0 && row.time <= hourly[i - 1].time))
      throw new ReadableError('Weather timeline is not ordered.');
    let current: WeatherPoint | undefined;
    if (data.current && typeof data.current === 'object') {
      const c = record(data.current);
      const time = number(c.time);
      if (time !== null) {
        const values = measurements(c);
        const interval = number(c.interval);
        // Current sums cover the provider's interval; hourly sums already represent mm/h.
        values.precipitation =
          values.precipitation !== null && interval !== null && interval > 0
            ? number((values.precipitation * 3600) / interval)
            : null;
        current = { time: time * 1000, values };
      }
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
      message: describeNetworkFailure(error, 'weather'),
    };
  }
}
