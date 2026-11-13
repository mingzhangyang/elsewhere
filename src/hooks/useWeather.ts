import { useEffect, useMemo, useState } from 'react';
import type { LocationInfo, WeatherResult } from '../types';
import { fetchWeatherForDate, selectWeather, weatherKey } from '../lib/weather';
import { civilDayStart, getZonedParts } from '../lib/time';

export function useWeather(location: LocationInfo, instant: Date, loader = fetchWeatherForDate) {
  const [result, setResult] = useState<WeatherResult | null>(null);
  const [revision, refresh] = useState(0);
  const [cache] = useState(() => new Map<string, WeatherResult>());
  const day = getZonedParts(instant, location.timezone).date;
  const queryDate = useMemo(() => civilDayStart(day, location.timezone), [day, location.timezone]);
  useEffect(() => {
    const controller = new AbortController();
    const key = weatherKey(location, queryDate);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < 15 * 60000) { setResult(cached); return; }
    setResult(null);
    loader(location, queryDate, { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      if (data.status === 'ready') { cache.set(key, data); if (cache.size > 32) cache.delete(cache.keys().next().value!); }
      setResult(data);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ key, fetchedAt: Date.now(), status: 'error', message: error instanceof Error ? error.message : 'Could not load weather.' });
    });
    return () => controller.abort();
  }, [location, queryDate, loader, revision, cache]);
  useEffect(() => {
    const timer = window.setInterval(() => refresh((n) => n + 1), 15 * 60000);
    return () => clearInterval(timer);
  }, []);
  const selection = useMemo(() => selectWeather(result, location, instant), [result, location, instant]);
  return {
    selection,
    refresh: () => { cache.delete(weatherKey(location, instant)); refresh((n) => n + 1); },
  };
}
