import type { WeatherIssue, WeatherSelection } from '../types';
import type { Messages } from '../i18n';

/** Display wording for weather conditions and their provenance, in the catalog's language. */
export function weatherDescription(code: number | null, m: Messages): string {
  const c = m.weather.condition;
  if (code === null) return c.unavailable;
  if (code === 0) return c.clear;
  if (code <= 2) return c.partlyCloudy;
  if (code === 3) return c.overcast;
  if (code <= 48) return c.fog;
  if (code <= 57) return c.drizzle;
  if (code <= 67) return c.rain;
  if (code <= 77) return c.snow;
  if (code <= 82) return c.rainShowers;
  if (code <= 86) return c.snowShowers;
  return c.thunderstorm;
}
export function weatherSourceLabel(selection: WeatherSelection, m: Messages): string {
  if (!selection.source) return selection.status === 'loading' ? m.weather.loading : m.weather.unavailable;
  return m.weather.source({ source: selection.source, cache: selection.cacheState });
}
export function weatherIssueText(issue: WeatherIssue, m: Messages): string {
  switch (issue.code) {
    case 'provider':
      return m.weather.issue.provider({ reason: issue.reason });
    case 'network':
      return m.network(issue.failure, 'weather');
    case 'text':
      return issue.text;
    default:
      return m.weather.issue[issue.code];
  }
}
