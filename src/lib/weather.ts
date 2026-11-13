import type { LocationInfo, WeatherPoint, WeatherResult, WeatherValues } from '../types';
import { getZonedParts } from './time';

const EMPTY_WEATHER: WeatherValues = {
  cloudCover: 18, cloudLow: 8, cloudMid: 7, cloudHigh: 8,
  visibilityKm: 30, visibilityAvailable: false, haze: 18, humidity: 48, windSpeed: 8, windDirection: 240,
  precipitation: 0, temperature: 18, pressure: 1013, weatherCode: 0,
};

const HOURLY_FIELDS = [
  'temperature_2m', 'relative_humidity_2m', 'precipitation', 'weather_code',
  'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high',
  'visibility', 'wind_speed_10m', 'wind_direction_10m', 'pressure_msl',
].join(',');

export async function searchLocations(query: string): Promise<LocationInfo[]> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: query, count: '8', language: 'en', format: 'json' }).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Location search failed (${response.status})`);
  const data = await response.json() as { results?: Array<Record<string, unknown>> };
  return (data.results ?? []).map((item, index) => ({
    id: `${String(item.id ?? index)}-${String(item.latitude)}-${String(item.longitude)}`,
    name: String(item.name ?? 'Unknown place'),
    country: String(item.country ?? item.admin1 ?? ''),
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    elevation: Number(item.elevation ?? 0),
    timezone: String(item.timezone ?? 'UTC'),
  }));
}

function nullableNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function diffLocalDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

function readHourlyTimeline(data: any, visibilityAvailable: boolean): WeatherPoint[] {
  const times: number[] | undefined = data?.hourly?.time;
  if (!times?.length) return [];
  const field = (name: string, index: number, fallback: number) => nullableNumber(data.hourly[name]?.[index], fallback);
  return times.map((time, index) => ({
    time: Number(time) * 1000,
    values: {
      temperature: field('temperature_2m', index, EMPTY_WEATHER.temperature),
      humidity: field('relative_humidity_2m', index, EMPTY_WEATHER.humidity),
      precipitation: field('precipitation', index, 0),
      weatherCode: field('weather_code', index, 0),
      cloudCover: field('cloud_cover', index, EMPTY_WEATHER.cloudCover),
      cloudLow: field('cloud_cover_low', index, EMPTY_WEATHER.cloudLow),
      cloudMid: field('cloud_cover_mid', index, EMPTY_WEATHER.cloudMid),
      cloudHigh: field('cloud_cover_high', index, EMPTY_WEATHER.cloudHigh),
      visibilityKm: field('visibility', index, 30_000) / 1000,
      visibilityAvailable,
      haze: visibilityAvailable
        ? Math.round((1 - Math.min(60_000, field('visibility', index, 30_000)) / 60_000) * 70 + Math.max(0, field('relative_humidity_2m', index, 48) - 70) * 0.45)
        : Math.max(0, Math.round((field('relative_humidity_2m', index, 48) - 76) * 0.45)),
      windSpeed: field('wind_speed_10m', index, EMPTY_WEATHER.windSpeed),
      windDirection: field('wind_direction_10m', index, EMPTY_WEATHER.windDirection),
      pressure: field('pressure_msl', index, EMPTY_WEATHER.pressure),
    },
  }));
}

function nearestHourlySample(hourly: WeatherPoint[], requestedDate: Date): WeatherValues | null {
  if (!hourly.length) return null;
  const target = requestedDate.getTime();
  let selected: WeatherPoint | null = null;
  let bestDistance = Infinity;
  for (const point of hourly) {
    const distance = Math.abs(point.time - target);
    if (distance < bestDistance) {
      selected = point;
      bestDistance = distance;
    }
  }
  return bestDistance <= 90 * 60_000 ? selected?.values ?? null : null;
}

function readCurrentSample(data: any, fallback: WeatherValues): WeatherValues | null {
  const current = data?.current;
  if (!current) return null;
  const get = (field: string, fallback: number) => nullableNumber(current[field], fallback);
  return {
    temperature: get('temperature_2m', EMPTY_WEATHER.temperature),
    humidity: get('relative_humidity_2m', EMPTY_WEATHER.humidity),
    precipitation: get('precipitation', 0),
    weatherCode: get('weather_code', 0),
    cloudCover: get('cloud_cover', EMPTY_WEATHER.cloudCover),
    cloudLow: fallback.cloudLow,
    cloudMid: fallback.cloudMid,
    cloudHigh: fallback.cloudHigh,
    visibilityKm: fallback.visibilityKm,
    visibilityAvailable: fallback.visibilityAvailable,
    haze: fallback.haze,
    windSpeed: get('wind_speed_10m', EMPTY_WEATHER.windSpeed),
    windDirection: get('wind_direction_10m', EMPTY_WEATHER.windDirection),
    pressure: get('pressure_msl', EMPTY_WEATHER.pressure),
  };
}

export async function fetchWeatherForDate(
  location: LocationInfo,
  requestedDate: Date,
): Promise<WeatherResult> {
  const requested = getZonedParts(requestedDate, location.timezone);
  const now = new Date();
  const today = getZonedParts(now, location.timezone);
  const daysFromToday = diffLocalDays(requested.date, today.date);
  const base = {
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: HOURLY_FIELDS,
    timezone: 'auto',
    timeformat: 'unixtime',
    start_date: requested.date,
    end_date: requested.date,
  };

  if (daysFromToday > 15) {
    return { available: false, source: 'unavailable', values: { ...EMPTY_WEATHER }, message: 'The 16-day forecast window does not extend to this date.' };
  }

  const historical = daysFromToday < 0;
  const endpoint = historical
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast';
  // The archive endpoint does not expose hourly visibility; requesting it would
  // make the entire historical query fail with an invalid-variable response.
  const hourlyFields = historical ? HOURLY_FIELDS.split(',').filter((field) => field !== 'visibility').join(',') : HOURLY_FIELDS;
  const params = new URLSearchParams({ ...base, hourly: hourlyFields });
  if (!historical) {
    params.set('forecast_days', '16');
    params.set('current', 'temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m');
  }
  const response = await fetch(`${endpoint}?${params.toString()}`);
  if (!response.ok) {
    return { available: false, source: 'unavailable', values: { ...EMPTY_WEATHER }, message: `Weather service returned ${response.status}.` };
  }
  const data = await response.json();
  const hourly = readHourlyTimeline(data, !historical);
  const sample = nearestHourlySample(hourly, requestedDate);
  if (!sample) {
    return { available: false, source: 'unavailable', values: { ...EMPTY_WEATHER }, message: historical ? 'Historical weather is not available for this date.' : 'Weather data is not available for this hour.' };
  }

  const currentTime = Number(data.current?.time) * 1000;
  const isNearCurrent = !historical && requested.date === today.date && Number.isFinite(currentTime)
    && Math.abs(currentTime - requestedDate.getTime()) <= 60 * 60_000;
  const values = isNearCurrent ? (readCurrentSample(data, sample) ?? sample) : sample;
  return {
    available: true,
    source: historical ? 'historical' : isNearCurrent ? 'current' : 'forecast',
    values,
    hourly,
  };
}

export function weatherDescription(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 2) return 'Mostly clear';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Foggy';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Variable conditions';
}

export const defaultWeatherValues = (): WeatherValues => ({ ...EMPTY_WEATHER });
