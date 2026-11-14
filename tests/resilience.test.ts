import { expect, it, vi } from 'vitest';
import { createFrameLoop } from '../src/renderer/frameLoop';
import { adaptiveRatio } from '../src/renderer/performance';
import { WeatherRepository } from '../src/services/weatherRepository';
import { NEW_YORK } from './fixtures/locations';
import { defaultWeatherValues, selectWeather, weatherKey } from '../src/domain/weather';
import { weatherSourceLabel } from '../src/lib/weatherText';
import type { WeatherResult } from '../src/types';

it('coalesces static renders, suspends hidden frames, and cancels all work on disposal', () => {
  let callback: FrameRequestCallback | undefined;
  const request = vi.fn((fn: FrameRequestCallback) => {
    callback = fn;
    return 1;
  });
  const cancel = vi.fn(() => {
    callback = undefined;
  });
  const draw = vi.fn();
  const loop = createFrameLoop(draw, { request, cancel });
  loop.invalidate();
  loop.invalidate();
  expect(request).toHaveBeenCalledTimes(1);
  callback!(16);
  expect(draw).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(1);
  loop.setAnimated(true);
  callback!(32);
  expect(request).toHaveBeenCalledTimes(3);
  loop.setSuspended(true);
  expect(callback).toBeUndefined();
  loop.invalidate();
  expect(request).toHaveBeenCalledTimes(3);
  loop.setSuspended(false);
  callback!(60000);
  expect(draw.mock.calls.at(-1)?.[1]).toBe(0);
  loop.dispose();
  loop.invalidate();
  expect(callback).toBeUndefined();
});
it('bounds adaptive resolution independently of simulation state', () => {
  expect(adaptiveRatio(0.75, 80, 2)).toBe(0.75);
  expect(adaptiveRatio(1.5, 40, 2)).toBe(1.25);
  expect(adaptiveRatio(2, 16, 2)).toBe(2);
});
it('deduplicates weather leases and retains explicitly stale data on failed refresh', async () => {
  const date = new Date('2026-11-12T12:00Z');
  let now = +date;
  const data: WeatherResult = {
    key: weatherKey(NEW_YORK, date),
    fetchedAt: now,
    status: 'ready',
    source: 'forecast',
    start: +date,
    end: +date + 3600000,
    hourly: [{ time: +date, values: defaultWeatherValues() }],
  };
  const loader = vi
    .fn()
    .mockResolvedValueOnce(data)
    .mockResolvedValue({ key: data.key, fetchedAt: now, status: 'error', message: 'Offline' });
  const repository = new WeatherRepository(loader, () => now);
  const first = repository.acquire(NEW_YORK, date),
    second = repository.acquire(NEW_YORK, date);
  expect(first.promise).toBe(second.promise);
  expect(loader).toHaveBeenCalledTimes(1);
  first.release();
  await Promise.resolve();
  expect((await second.promise).status).toBe('ready');
  second.release();
  now += 20 * 60000;
  const retry = repository.acquire(NEW_YORK, date);
  const result = await retry.promise;
  retry.release();
  expect(result.cacheState).toBe('stale');
  expect(result.fetchedAt).toBe(+date);
  expect(weatherSourceLabel(selectWeather(result, NEW_YORK, date))).toBe('Stale cached · Forecast');
});
