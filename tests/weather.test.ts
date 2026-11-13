import { expect, it, vi } from 'vitest';
import {
  customConditions,
  defaultWeatherValues,
  fetchWeatherForDate,
  renderingWeather,
  selectWeather,
  weatherKey,
} from '../src/lib/weather';
import { NEW_YORK } from './fixtures/locations';
import { weatherPayload } from './fixtures/weather';

it('normalizes current accumulation to the same rate as hourly precipitation', async () => {
  const payload = weatherPayload();
  const data = { ...payload, current: { ...payload.current, interval: 900, precipitation: 1 } };
  data.hourly.precipitation.fill(4);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
  const instant = new Date('2026-11-12T12:00Z');
  const result = await fetchWeatherForDate(NEW_YORK, instant, { now: instant });
  const current = selectWeather(result, NEW_YORK, instant);
  const forecast = selectWeather(result, NEW_YORK, new Date('2026-11-12T16:00Z'));
  expect(current.values?.precipitation).toBe(4);
  expect(forecast.values?.precipitation).toBe(4);
  expect(customConditions(renderingWeather(current)).precipitation).toBe(4);
});

it.each([undefined, null, 0, -900, '900'])(
  'preserves unknown precipitation when interval is %s',
  async (interval) => {
    const payload = weatherPayload();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...payload,
            current: { ...payload.current, interval, precipitation: 1 },
          }),
        ),
      ),
    );
    const instant = new Date('2026-11-12T12:00Z');
    const result = await fetchWeatherForDate(NEW_YORK, instant, { now: instant });
    expect(selectWeather(result, NEW_YORK, instant).values?.precipitation).toBeNull();
  },
);

it('does not combine conflicting forecast range parameters', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-12T12:00Z'));
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  await fetchWeatherForDate(NEW_YORK, new Date('2026-11-13T12:00Z'));
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.has('forecast_days') && url.searchParams.has('start_date')).toBe(false);
});

it('preserves missing fields and chooses current data and provenance together', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(weatherPayload()))));
  const instant = new Date('2026-11-12T12:00Z');
  const result = await fetchWeatherForDate(NEW_YORK, instant, { now: instant });
  const selected = selectWeather(result, NEW_YORK, instant);
  expect(selected).toMatchObject({
    status: 'partial',
    source: 'current',
    values: { temperature: 17, cloudCover: 85, visibilityKm: null, humidity: null },
  });
  expect(renderingWeather(selected).visibilityKm).toBe(30);
  expect(selected.values?.visibilityKm).toBeNull();
  expect(selectWeather(result, NEW_YORK, new Date('2026-11-12T16:00Z'))).toMatchObject({
    source: 'forecast',
    values: { temperature: 10 },
  });
});

it('interpolates wind across north, not through south', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(weatherPayload()))));
  const instant = new Date('2026-11-12T05:30Z');
  const result = await fetchWeatherForDate(NEW_YORK, instant, { now: instant });
  expect(selectWeather(result, NEW_YORK, instant).values?.windDirection).toBeCloseTo(0);
});

it('never reuses another location or day as current weather', async () => {
  const instant = new Date('2026-11-12T12:00Z');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(weatherPayload()))));
  const result = await fetchWeatherForDate(NEW_YORK, instant, { now: instant });
  expect(selectWeather(result, { ...NEW_YORK, latitude: 30 }, instant)).toMatchObject({
    status: 'loading',
    values: null,
  });
  expect(selectWeather(result, NEW_YORK, new Date('2026-11-13T12:00Z'))).toMatchObject({
    status: 'loading',
    values: null,
  });
});

it('reports the provider error and has no fabricated values', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ reason: 'Invalid range' }), { status: 400 })),
  );
  const instant = new Date('2026-11-12T12:00Z');
  const result = await fetchWeatherForDate(NEW_YORK, instant, { now: instant });
  expect(result).toMatchObject({ status: 'error', message: 'Weather service: Invalid range' });
  expect(selectWeather(result, NEW_YORK, instant).values).toBeNull();
});

it.each([-1, -5, -6])('routes day offset %s to the declared data source', async (days) => {
  const now = new Date('2026-11-12T12:00Z');
  const instant = new Date(now.getTime() + days * 86400000);
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(weatherPayload(instant.getTime() - 7 * 3600000))));
  vi.stubGlobal('fetch', fetcher);
  const result = await fetchWeatherForDate(NEW_YORK, instant, { now });
  expect(new URL(fetcher.mock.calls[0][0]).hostname).toBe(
    days < -5 ? 'archive-api.open-meteo.com' : 'api.open-meteo.com',
  );
  expect(result.status === 'ready' && result.source).toBe(days < -5 ? 'historical' : 'recent');
});

it('does not extend known samples beyond their coverage', () => {
  const instant = new Date('2026-11-12T12:00Z');
  const selected = selectWeather(
    {
      key: weatherKey(NEW_YORK, instant),
      fetchedAt: instant.getTime(),
      status: 'ready',
      source: 'forecast',
      start: instant.getTime() - 3600000,
      end: instant.getTime(),
      hourly: [],
    },
    NEW_YORK,
    instant,
  );
  expect(selected).toMatchObject({ status: 'unavailable', values: null });
});

it('derives custom precipitation type consistently', () => {
  const rainy = customConditions(defaultWeatherValues(), 'precipitation', 4);
  expect(rainy.weatherCode).toBe(63);
  expect(customConditions(rainy, 'temperature', -5).weatherCode).toBe(73);
});

it('does not request unsupported future weather', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-12T12:00Z'));
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const result = await fetchWeatherForDate(NEW_YORK, new Date('2027-01-01T12:00Z'));
  expect(result.status).toBe('unavailable');
  expect(fetcher).not.toHaveBeenCalled();
});

it('clips the final local forecast day to the provider UTC horizon', async () => {
  const now = new Date('2026-11-13T12:00Z');
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(weatherPayload(Date.parse('2026-11-28T00:00Z')))));
  vi.stubGlobal('fetch', fetcher);
  await fetchWeatherForDate(NEW_YORK, new Date('2026-11-28T20:00Z'), { now });
  const params = new URL(fetcher.mock.calls[0][0]).searchParams;
  expect(params.get('end_date')).toBe('2026-11-28');
});
