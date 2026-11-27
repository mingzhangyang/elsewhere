// Declarations for verify.mjs (shared Sky Engine regression fixtures).
export interface SkyEngineFixtures {
  readonly formatVersion: 1;
  readonly [key: string]: unknown;
}
export declare const FIXTURE_STAR_NAMES: readonly string[];
/** Check a Sky Engine module namespace (either build) against the fixtures. */
export declare function verifySkyEngineFixtures(
  sdk: unknown,
  fixtures: SkyEngineFixtures,
  options: { catalogRows: unknown[] },
): Promise<{ checked: number; failures: string[] }>;
