import type { WeatherSource, WeatherValues } from '../packages/sky-engine/src/types';

export * from '../packages/sky-engine/src/types';

export type WeatherMeasurements = {
  [K in Exclude<keyof WeatherValues, 'visibilityAvailable'>]: number | null;
};
export interface WeatherPoint {
  time: number;
  values: WeatherMeasurements;
}

/**
 * A failed request, classified so the interface can word it in the active language. `http` is a
 * response with an error status the provider gave no reason for; `invalid`, a response of the wrong
 * shape; `unreadable`, one that was not JSON at all.
 */
export type NetworkFailure =
  | { kind: 'timeout' | 'offline' | 'unreachable' | 'unreadable' | 'invalid' | 'failed' }
  | { kind: 'http'; status: number };

/** Why weather is missing, partial or out of date. Codes, not sentences: the interface words them. */
export type WeatherIssue =
  | {
      code:
        | 'loading'
        | 'no-coverage'
        | 'no-sample'
        | 'date-unsupported'
        | 'beyond-coverage'
        | 'no-samples'
        | 'busy'
        | 'no-timeline'
        | 'bad-timestamp'
        | 'unordered'
        | 'refresh-failed';
    }
  /** The provider's own reason, in its own words (Open-Meteo answers in English). */
  | { code: 'provider'; reason: string }
  | { code: 'network'; failure: NetworkFailure }
  /** Literal text, for development scenarios only. */
  | { code: 'text'; text: string };

export type WeatherResult = {
  key: string;
  fetchedAt: number;
  cacheState?: 'cached' | 'stale';
  /** A cached result shown because a refresh failed. */
  issue?: WeatherIssue;
} & (
  | {
      status: 'ready';
      source: Exclude<WeatherSource, 'current'>;
      start: number;
      end: number;
      hourly: WeatherPoint[];
      current?: WeatherPoint;
    }
  | { status: 'unavailable' | 'error'; issue: WeatherIssue }
);

export interface WeatherSelection {
  status: 'loading' | 'ready' | 'partial' | 'unavailable' | 'error';
  values: WeatherMeasurements | null;
  source?: WeatherSource;
  sampledAt?: number;
  fetchedAt?: number;
  issue?: WeatherIssue;
  cacheState?: 'cached' | 'stale';
}

/** A transient message over the sky. Codes, so a language switch rewords one already showing. */
export type AppNotice = {
  code:
    | 'stars-unavailable'
    | 'offline-unavailable'
    | 'preferences-not-saved'
    | 'preferences-unreadable'
    | 'invalid-link'
    | 'no-rise'
    | 'rise-failed'
    | 'copy-manually'
    | 'moon-map-unavailable'
    | 'language-unavailable';
} | null;
