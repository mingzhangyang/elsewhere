import { ReadableError } from '../lib/networkErrors';

/** Narrowing helpers for untrusted provider JSON. */
export function record(value: unknown, what = 'Weather service'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ReadableError(`${what} returned an invalid response.`);
  return value as Record<string, unknown>;
}
export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
