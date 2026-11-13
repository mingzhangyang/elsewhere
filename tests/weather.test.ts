import { expect, it, vi } from 'vitest';
import { fetchWeatherForDate } from '../src/lib/weather';
import { NEW_YORK } from './fixtures/locations';

it.fails('does not combine conflicting forecast range parameters (phase 1 regression)', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-12T12:00Z'));
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  await fetchWeatherForDate(NEW_YORK, new Date('2026-11-13T12:00Z'));
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.has('forecast_days') && url.searchParams.has('start_date')).toBe(false);
});

it('does not request unsupported future weather', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-12T12:00Z'));
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const result = await fetchWeatherForDate(NEW_YORK, new Date('2027-01-01T12:00Z'));
  expect(result.available).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
