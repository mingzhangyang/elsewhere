import type { AppProps } from '../App';
import { defaultWeatherValues, weatherKey } from '../domain/weather';
import { localDayBounds } from '../domain/time';
import { PRESETS } from '../lib/locations';

type Scenario = { time?: string; cloudCover: number; precipitation: number; code: number };

// Development-only entry point; never included in a production build.
export function scenarioProps(name: string | null): AppProps {
  const scenarios: Record<string, Scenario> = {
    day: { time: '2026-11-12T17:00:00Z', cloudCover: 15, precipitation: 0, code: 1 },
    night: { time: '2026-11-13T04:00:00Z', cloudCover: 0, precipitation: 0, code: 0 },
    // Stable nocturnal cloud fixtures for real WebGL name-label evidence.
    night30: { time: '2026-11-13T04:00:00Z', cloudCover: 30, precipitation: 0, code: 2 },
    night60: { time: '2026-11-13T04:00:00Z', cloudCover: 60, precipitation: 0, code: 2 },
    night85: { time: '2026-11-13T04:00:00Z', cloudCover: 85, precipitation: 0, code: 3 },
    rain: { time: '2026-11-12T17:00:00Z', cloudCover: 95, precipitation: 5, code: 63 },
    snow: { time: '2026-12-21T17:00:00Z', cloudCover: 100, precipitation: 3, code: 73 },
    overcast: { time: '2026-11-13T04:00:00Z', cloudCover: 100, precipitation: 0, code: 3 },
    windy: { time: '2026-11-12T17:00:00Z', cloudCover: 60, precipitation: 0, code: 2 },
    sunset: { time: '2026-11-12T21:35:00Z', cloudCover: 30, precipitation: 0, code: 2 },
    // Civil dusk in New York (Sun about 5° down) with a 12% waxing crescent low in the west.
    dusk: { time: '2026-11-12T22:08:00Z', cloudCover: 0, precipitation: 0, code: 0 },
    moon: { time: '2026-11-24T02:00:00Z', cloudCover: 0, precipitation: 0, code: 0 },
    // Weather only: let the shared hash initialize location, instant, camera and layers.
    'share-clear': { cloudCover: 0, precipitation: 0, code: 0 },
    south: { time: '2026-06-21T12:00:00Z', cloudCover: 0, precipitation: 0, code: 0 },
    polar: { time: '2026-12-21T12:00:00Z', cloudCover: 15, precipitation: 0, code: 1 },
    unavailable: { time: '2026-11-12T17:00:00Z', cloudCover: 0, precipitation: 0, code: 0 },
    // Evening Venus, near greatest eastern elongation, at civil dusk in New York.
    venus: { time: '2026-08-15T00:30:00Z', cloudCover: 0, precipitation: 0, code: 0 },
    // A moonless August evening in New York (new Moon), the Milky Way's core low in the south.
    milkyway: { time: '2026-08-12T02:30:00Z', cloudCover: 0, precipitation: 0, code: 0 },
    // Local midnight in New York at Jupiter's opposition, the planet high in the south.
    jupiter: { time: '2026-01-10T05:00:00Z', cloudCover: 0, precipitation: 0, code: 0 },
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
    initialTime: scene.time ? new Date(scene.time) : undefined,
    initialLocation: name === 'south' ? PRESETS[5] : name === 'polar' ? PRESETS[7] : undefined,
    weatherLoader: async (location, date) => {
      const base = { key: weatherKey(location, date), fetchedAt: Date.now() };
      if (name === 'unavailable')
        return {
          ...base,
          status: 'unavailable',
          issue: { code: 'text', text: 'Deterministic unavailable-weather scenario.' },
        };
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
