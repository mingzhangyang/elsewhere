import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWeatherForDate } from '../src/services/openMeteo';
import { searchLocations } from '../src/services/placeSearch';
import { describeNetworkFailure } from '../src/lib/networkErrors';
import type { LocationInfo } from '../src/types';
import { NEW_YORK } from './fixtures/locations';

const instant = new Date('2026-11-13T12:00Z');
const weatherMessage = async (response: () => Promise<Response>) => {
  vi.stubGlobal('fetch', vi.fn(response));
  const result = await fetchWeatherForDate(NEW_YORK, instant, { now: instant });
  return result.status === 'error' ? result.message : `unexpected ${result.status}`;
};
afterEach(() => vi.unstubAllGlobals());

describe('readable network failures', () => {
  it('replaces browser fetch errors in the weather panel', async () => {
    expect(await weatherMessage(() => Promise.reject(new TypeError('Failed to fetch')))).toBe(
      'Couldn’t reach the weather service. Check your connection. Try refreshing.',
    );
    expect(
      await weatherMessage(() => Promise.reject(new DOMException('signal timed out', 'TimeoutError'))),
    ).toBe('The weather service took too long to respond. Try refreshing.');
    expect(await weatherMessage(async () => new Response('<html>bad gateway</html>'))).toBe(
      'The weather service sent a response that couldn’t be read. Try refreshing.',
    );
  });

  it('keeps messages the app already wrote', async () => {
    expect(await weatherMessage(async () => new Response('{}', { status: 429 }))).toBe(
      'Weather service is busy. Try refreshing in a moment.',
    );
  });

  it('says when the device is offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(describeNetworkFailure(new TypeError('Load failed'), 'search')).toBe(
      'You appear to be offline. Reconnect, then try again.',
    );
  });

  it('replaces browser fetch errors in place search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.')),
    );
    const failure = await searchLocations('Paris').catch((error: unknown) => error);
    expect(describeNetworkFailure(failure, 'search')).toBe(
      'Couldn’t reach place search. Check your connection. Try again.',
    );
  });
});

describe('weather request coordinates', () => {
  const requested = async (location: LocationInfo) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    await fetchWeatherForDate(location, instant, { now: instant });
    const url = new URL(fetcher.mock.calls[0]![0] as string);
    return [url.searchParams.get('latitude'), url.searchParams.get('longitude')];
  };
  it('rounds device positions to about 1 km', async () => {
    const device = {
      ...NEW_YORK,
      id: 'device-location',
      source: 'device' as const,
      latitude: 40.712776,
      longitude: -74.005974,
    };
    expect(await requested(device)).toEqual(['40.71', '-74.01']);
  });
  it('keeps chosen places exact', async () => {
    expect(await requested(NEW_YORK)).toEqual(['40.7128', '-74.006']);
  });
});
