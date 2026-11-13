import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocationInfo, WeatherResult } from '../types';
import { fetchWeatherForDate, selectWeather, weatherKey } from '../lib/weather';
import { civilDayStart, getZonedParts } from '../lib/time';
import { WeatherRepository } from '../services/weatherRepository';

export function useWeather(location: LocationInfo, instant: Date, loader = fetchWeatherForDate) {
  const [result, setResult] = useState<WeatherResult | null>(null);
  const [revision, refresh] = useState(0);
  const appliedRevision = useRef(0);
  const repository = useMemo(() => new WeatherRepository(loader), [loader]);
  const day = getZonedParts(instant, location.timezone).date;
  const queryDate = useMemo(() => civilDayStart(day, location.timezone), [day, location.timezone]);
  useEffect(() => {
    let active = true;
    const key = weatherKey(location, queryDate);
    setResult(repository.peek(key));
    const force = revision !== appliedRevision.current;
    appliedRevision.current = revision;
    const lease = repository.acquire(location, queryDate, force);
    lease.promise.then((data) => {
      if (active) setResult(data);
    });
    return () => {
      active = false;
      lease.release();
    };
  }, [location, queryDate, repository, revision]);
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    const timer = window.setInterval(() => {
      if (!document.hidden) update();
    }, 15 * 60000);
    window.addEventListener('online', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', update);
    };
  }, []);
  const selection = useMemo(() => selectWeather(result, location, instant), [result, location, instant]);
  return { selection, refresh: () => refresh((n) => n + 1) };
}
