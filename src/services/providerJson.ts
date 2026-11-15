import { ReadableError } from '../lib/networkErrors';

/** Narrowing helpers for untrusted provider JSON. An unusable shape is an invalid response. */
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ReadableError({ code: 'network', failure: { kind: 'invalid' } });
  return value as Record<string, unknown>;
}
export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
