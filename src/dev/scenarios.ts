import type { AppProps } from '../App';
import { defaultWeatherValues, weatherKey } from '../lib/weather';
import { localDayBounds } from '../lib/time';
import { PRESETS } from '../lib/locations';

// Development-only entry point; never included in a production build.
export function scenarioProps(name: string | null): AppProps {
  const scenarios: Record<string, { time: string; cloudCover: number; precipitation: number; code: number }> =
    {
      day: { time: '2026-11-12T17:00:00Z', cloudCover: 15, precipitation: 0, code: 1 },
      night: { time: '2026-11-13T04:00:00Z', cloudCover: 0, precipitation: 0, code: 0 },
      rain: { time: '2026-11-12T17:00:00Z', cloudCover: 95, precipitation: 5, code: 63 },
      snow: { time: '2026-12-21T17:00:00Z', cloudCover: 100, precipitation: 3, code: 73 },
      overcast: { time: '2026-11-13T04:00:00Z', cloudCover: 100, precipitation: 0, code: 3 },
      windy: { time: '2026-11-12T17:00:00Z', cloudCover: 60, precipitation: 0, code: 2 },
      sunset: { time: '2026-11-12T21:35:00Z', cloudCover: 30, precipitation: 0, code: 2 },
      moon: { time: '2026-11-24T02:00:00Z', cloudCover: 0, precipitation: 0, code: 0 },
      south: { time: '2026-06-21T12:00:00Z', cloudCover: 0, precipitation: 0, code: 0 },
      polar: { time: '2026-12-21T12:00:00Z', cloudCover: 15, precipitation: 0, code: 1 },
      unavailable: { time: '2026-11-12T17:00:00Z', cloudCover: 0, precipitation: 0, code: 0 },
    };
  const scene = name ? scenarios[name] : undefined;
  if (!scene) return {};
  const values = {
    ...defaultWeatherValues(),
    cloudCover: scene.cloudCover,
    precipitation: scene.precipitation,
    weatherCode: scene.code,
    temperature: name === 'snow' ? -4 : 15,
    windSpeed: name === 'rain' || name === 'snow' ? 20 : name === 'windy' ? 15 : 0,
  };
  return {
    initialTime: new Date(scene.time),
    initialLocation: name === 'south' ? PRESETS[5] : name === 'polar' ? PRESETS[7] : undefined,
    weatherLoader: async (location, date) => {
      const base = { key: weatherKey(location, date), fetchedAt: Date.now() };
      if (name === 'unavailable')
        return { ...base, status: 'unavailable', message: 'Deterministic unavailable-weather scenario.' };
      const { start, end } = localDayBounds(date, location.timezone);
      return {
        ...base,
        status: 'ready',
        source: 'forecast',
        start: start.getTime(),
        end: end.getTime(),
        hourly: Array.from(
          { length: Math.ceil((end.getTime() - start.getTime()) / 3600000) + 1 },
          (_, i) => ({ time: start.getTime() + i * 3600000, values }),
        ),
      };
    },
  };
}
