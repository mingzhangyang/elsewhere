import { installTemporalImplementation } from './domain/temporal';

/**
 * Use the host's Temporal implementation for all civil-time work, in place of the runtime's own
 * and of the bundled polyfill; for example `installTemporal(Temporal)` with `Temporal` from
 * `@js-temporal/polyfill`. It is meant for the lite build (`sky-engine.lite.mjs`), which bundles no
 * polyfill; it works in the full build as well. The implementation needs `Instant`,
 * `ZonedDateTime`, `PlainDate` and `PlainDateTime`; anything else throws an `INVALID_INPUT`
 * SkyEngineError. Call it before `createSkyScene()`.
 */
export function installTemporal(temporal: unknown): void {
  // Keep the public declaration independent of the polyfill's internal Temporal type.
  installTemporalImplementation(temporal);
}
