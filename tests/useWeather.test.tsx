import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useWeather } from '../src/hooks/useWeather';
import { weatherKey } from '../src/lib/weather';
import type { WeatherResult } from '../src/types';
import { NEW_YORK, SYDNEY } from './fixtures/locations';

it('cancels superseded requests and ignores late responses', async () => {
  const requests: { signal?: AbortSignal; resolve: (data: WeatherResult) => void; key: string }[] = [];
  const loader = vi.fn((location, date, options) => new Promise<WeatherResult>((resolve) => requests.push({ signal: options.signal, resolve, key: weatherKey(location, date) })));
  const instant = new Date('2026-11-12T12:00Z');
  const { result, rerender } = renderHook(({ location }) => useWeather(location, instant, loader), { initialProps: { location: NEW_YORK } });
  await waitFor(() => expect(requests).toHaveLength(1));
  rerender({ location: SYDNEY });
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[0].signal?.aborted).toBe(true);
  await act(async () => { requests[1].resolve({ key: requests[1].key, fetchedAt: Date.now(), status: 'unavailable', message: 'Sydney unavailable' }); });
  expect(result.current.selection.message).toBe('Sydney unavailable');
  await act(async () => { requests[0].resolve({ key: requests[0].key, fetchedAt: Date.now(), status: 'error', message: 'Old New York response' }); });
  expect(result.current.selection.message).toBe('Sydney unavailable');
});
