import type { Temporal as PolyfillTemporal } from '@js-temporal/polyfill';
import { invalidInput, SkyEngineError } from '../errors';

type TemporalApi = typeof PolyfillTemporal;

/**
 * The Temporal API: one installed with `installTemporal()`, else the runtime's own where it ships
 * one (Chrome, Edge, Firefox), else the polyfill, which is loaded only then. Call
 * `ensureTemporal()` once before any civil-time work; this binding is live, so modules that
 * imported it see the polyfill after it loads.
 */
export let Temporal: TemporalApi = (globalThis as { Temporal?: TemporalApi }).Temporal!;

// Defined as true only by the lite build (scripts/build-sky-engine.mjs), which also replaces the
// polyfill with a stub; undefined everywhere else.
declare const __SKY_ENGINE_LITE__: boolean | undefined;
/** Whether ensureTemporal() can fall back to a bundled polyfill (false in the lite build). */
export const temporalPolyfillBundled = typeof __SKY_ENGINE_LITE__ === 'undefined' || !__SKY_ENGINE_LITE__;

const UNAVAILABLE =
  'Temporal is unavailable: this runtime has no native Temporal and none has been installed. ' +
  'Call installTemporal() with a Temporal implementation (for example the Temporal export of ' +
  '@js-temporal/polyfill), or use the full Sky Engine build (sky-engine.mjs, the package root), ' +
  'which bundles that polyfill. The lite build (sky-engine.lite.mjs) does not.';

/**
 * Load the Temporal polyfill if no Temporal is available yet. In the lite build the polyfill is a
 * stub without `Temporal`, so this rejects with UNSUPPORTED unless the host installed one.
 */
export async function ensureTemporal(): Promise<void> {
  if (Temporal) return;
  const loaded = (await import('@js-temporal/polyfill')).Temporal as TemporalApi | undefined;
  // installTemporal() may have run while the module loaded; the host's implementation wins.
  if (Temporal) return;
  if (!loaded) throw new SkyEngineError('UNSUPPORTED', UNAVAILABLE);
  Temporal = loaded;
}

/** The Temporal API for a synchronous calculation, or SkyEngineError UNSUPPORTED. */
export function requireTemporal(): TemporalApi {
  if (!Temporal) throw new SkyEngineError('UNSUPPORTED', UNAVAILABLE);
  return Temporal;
}

const isFunction = (value: unknown) => typeof value === 'function';

/** Validate and install a host Temporal implementation (the public `installTemporal`). */
export function installTemporalImplementation(temporal: unknown): void {
  const api = temporal as Partial<
    Record<'Instant' | 'ZonedDateTime' | 'PlainDate' | 'PlainDateTime', unknown>
  >;
  if (
    !api ||
    (typeof api !== 'object' && typeof api !== 'function') ||
    !isFunction((api.Instant as { fromEpochMilliseconds?: unknown } | undefined)?.fromEpochMilliseconds) ||
    !isFunction((api.ZonedDateTime as { from?: unknown } | undefined)?.from) ||
    !isFunction((api.PlainDate as { from?: unknown } | undefined)?.from) ||
    !isFunction((api.PlainDateTime as { from?: unknown } | undefined)?.from)
  ) {
    throw invalidInput(
      'installTemporal() needs a Temporal implementation with Instant, ZonedDateTime, PlainDate and PlainDateTime.',
    );
  }
  Temporal = temporal as TemporalApi;
}
