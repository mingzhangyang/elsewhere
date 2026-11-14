import type { WeatherSelection } from '../types';

/** Display wording for weather conditions and their provenance. */
export function weatherDescription(code: number | null): string {
  if (code === null) return 'Condition unavailable';
  if (code === 0) return 'Clear sky';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorm';
}
export function weatherSourceLabel(selection: WeatherSelection): string {
  if (!selection.source) return selection.status === 'loading' ? 'Loading weather' : 'Weather unavailable';
  const prefix =
    selection.cacheState === 'stale'
      ? 'Stale cached · '
      : selection.cacheState === 'cached'
        ? 'Cached · '
        : '';
  return (
    prefix +
    {
      current: 'Current model estimate',
      forecast: 'Forecast',
      recent: 'Recent weather model',
      historical: 'Historical reanalysis',
    }[selection.source]
  );
}
