import type { NetworkFailure, WeatherIssue } from '../types';

/**
 * Classifies low-level request failures so the interface can say what happened in the reader's
 * language. Browsers report these as "Failed to fetch", "Load failed", "signal timed out" or a JSON
 * parse error; failures the app recognized itself carry their own issue and pass through.
 */
export type NetworkService = 'weather' | 'search';

/** A failure the app has already identified, such as an unusable provider response. */
export class ReadableError extends Error {
  constructor(readonly issue: WeatherIssue | { code: 'network'; failure: NetworkFailure }) {
    super(issue.code);
  }
}

export function classifyNetworkFailure(error: unknown): NetworkFailure {
  if (error instanceof ReadableError && error.issue.code === 'network') return error.issue.failure;
  const kind = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (kind === 'TimeoutError') return { kind: 'timeout' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { kind: 'offline' };
  // fetch rejects with a TypeError when the request never reaches the server.
  if (kind === 'TypeError') return { kind: 'unreachable' };
  if (kind === 'SyntaxError') return { kind: 'unreadable' };
  return { kind: 'failed' };
}

/** The weather issue for a failed weather request. */
export function weatherFailure(error: unknown): WeatherIssue {
  if (error instanceof ReadableError) return error.issue;
  return { code: 'network', failure: classifyNetworkFailure(error) };
}
