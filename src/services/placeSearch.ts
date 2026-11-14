import type { LocationInfo } from '../types';
import { validateObserver } from '../domain/observer';
import { ReadableError } from '../lib/networkErrors';
import { finiteNumber as number, record } from './providerJson';

/** Open-Meteo geocoding (GeoNames) place search. */
export async function searchLocations(query: string, signal?: AbortSignal): Promise<LocationInfo[]> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: query, count: '8', language: 'en', format: 'json' }).toString();
  const timeout = AbortSignal.timeout(10000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new ReadableError(`Place search failed (${response.status}). Try again.`);
  const data = record(await response.json(), 'Place search');
  if (!Array.isArray(data.results)) return [];
  return data.results.flatMap((raw): LocationInfo[] => {
    const item = record(raw, 'Place search');
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
