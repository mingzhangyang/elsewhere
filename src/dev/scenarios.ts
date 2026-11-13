import type { AppProps } from '../App';
import { defaultWeatherValues, weatherKey } from '../lib/weather';
import { localDayBounds } from '../lib/time';

// Development-only entry point; never included in a production build.
export function scenarioProps(name: string | null): AppProps {
  const scenarios: Record<string, { time: string; cloudCover: number; precipitation: number; code: number }> = {
    day: { time: '2026-11-12T17:00:00Z', cloudCover: 15, precipitation: 0, code: 1 },
    night: { time: '2026-11-13T04:00:00Z', cloudCover: 0, precipitation: 0, code: 0 },
    rain: { time: '2026-11-12T17:00:00Z', cloudCover: 95, precipitation: 5, code: 63 },
    unavailable: { time: '2026-11-12T17:00:00Z', cloudCover: 0, precipitation: 0, code: 0 },
  };
  const scene = name ? scenarios[name] : undefined;
  if (!scene) return {};
  const values = { ...defaultWeatherValues(), cloudCover: scene.cloudCover, precipitation: scene.precipitation, weatherCode: scene.code };
  return {
    initialTime: new Date(scene.time),
    weatherLoader: async (location, date) => {
      const base = { key: weatherKey(location, date), fetchedAt: Date.now() };
      if (name === 'unavailable') return { ...base, status: 'unavailable', message: 'Deterministic unavailable-weather scenario.' };
      const { start, end } = localDayBounds(date, location.timezone);
      return { ...base, status: 'ready', source: 'forecast', start: start.getTime(), end: end.getTime(),
        hourly: Array.from({ length: Math.ceil((end.getTime() - start.getTime()) / 3600000) + 1 }, (_, i) => ({ time: start.getTime() + i * 3600000, values })) };
    },
  };
}
