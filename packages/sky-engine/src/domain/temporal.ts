import type { Temporal as PolyfillTemporal } from '@js-temporal/polyfill';

type TemporalApi = typeof PolyfillTemporal;

/**
 * The Temporal API: the browser's own where it ships one (Chrome, Edge, Firefox), otherwise the
 * polyfill, which is fetched only then. Call `ensureTemporal()` once before any civil-time work;
 * this binding is live, so modules that imported it see the polyfill after it loads.
 */
export let Temporal: TemporalApi = (globalThis as { Temporal?: TemporalApi }).Temporal!;

export async function ensureTemporal(): Promise<void> {
  if (Temporal) return;
  Temporal = (await import('@js-temporal/polyfill')).Temporal;
}
