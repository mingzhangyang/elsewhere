# Sky Engine roadmap

Internal progress notes for `packages/sky-engine`. Released changes are listed in the package
[CHANGELOG](../../packages/sky-engine/CHANGELOG.md).

## Milestones (separate, non-stacked changes)

1. **M1 (completed, #46):** relocate implementation and contracts without changing rendering behavior;
   keep legacy imports and existing tests working. Check module boundary and single-instance exports.
2. **M2 (completed, #47):** design and test a host-neutral scene/render facade, consistent crop/projection
   mapping, explicit composition and pattern overrides, asset injection, and bounded browser resource
   loading. Preserve current and automatic framing; allow the now-and-more signature asterism policy.
3. **M3 (completed, #48, v0.1.0):** publish a versioned build from the same sources: ESM (including a
   browser-consumable build), declarations, optional data/landscape assets, checksums and licenses.
   Validate package and app budgets and offline behavior; no remote latest-version runtime dependency.
4. **M4:** in now-and-more, consume the pinned artifact with local assets and cache-version updates,
   preserve estimated-location/clear-sky disclosure and card layout, replace copied sky calculations
   and rendering only after checking all callers, and remove unused duplicate catalog data.
5. **M5:** add shared fixtures and cross-consumer browser pixel/astronomy tests. Keep independent releases
   and regression gates; no forced simultaneous deploys.

Outside the milestone list, v0.2.0 added the circular sky chart and minimal star map (#49) and the
realistic Moon portrait (#50).

## Improvement plan

- **Phase 0 (0.2.1, not released separately; shipped in v0.3.0):** backward-compatible hardening: a readable cross-origin Moon texture error,
  documented catalog loader behavior, a locked runtime export list, split usage/internal
  documentation with a changelog and API reference, and a recorded (non-gating) performance
  benchmark (`npm run sdk:bench`).
- **Phase 1 (v0.3.0):** the one planned incompatible release, to settle the public API before
  now-and-more adopts it: a stable root and an experimental `advanced` namespace in the same single
  module, read-only catalog accessors (`getStarCatalog`, `getPatterns`) instead of mutable exports,
  one coded `SkyEngineError` type, aligned option validation, and an export lock that covers the
  namespace. Later phases must stay backward compatible for the stable API.
- **Phase 2 (to do):** adoption by now-and-more on the stable API: consume a pinned release with
  local assets (milestone M4) and replace its copied sky calculations and rendering after checking
  all callers. Any API gaps found there become backward-compatible additions.
- **Phase 3 (completed, v0.4.0):** performance and runtime environments: rendering into
  `OffscreenCanvas` and from `ImageBitmap` so all four image types run in a Worker (with a
  Worker-versus-main-thread pixel test and a type-checked example), a lunar portrait about 2.5 times
  faster within 1 RGB level of 0.3.0, a lite module without the Temporal polyfill plus
  `installTemporal()`, and a size review of the engine's own code. Open follow-ups: the Moon targets
  of 500 ms at 4096 px and 120 ms at 2048 px were not reached (about 520 and 150 ms on the benchmark
  machine, from 1320 and 360 ms); the Worker pixel test runs in Chromium only.
- **Phase 4 (to do, v0.4.x, can run in parallel with phase 3):** internal structure and independent
  tests.
  1. Instanced star catalogs: `createStarCatalog(rows)` returns an immutable catalog object, and
     `createSkyScene` and related functions accept a `catalog` option; without one they keep using
     the global default catalog, so existing callers are unaffected.
  2. A separately testable package: move the SDK tests to `packages/sky-engine/test/` with an
     `npm run sdk:test` script, and add an architecture test that package code imports only package
     files and its two dependencies, `astronomy-engine` and `@js-temporal/polyfill`, never `src/`.
  3. Shared test data (milestone M5): a fixed set of reference astronomy results (JSON) and pixel
     references, used by one regression suite in both Elsewhere and now-and-more, while each keeps
     releasing independently.

The milestones preserve the current sky science, default rendering, share links and app behavior. The
existing validation and browser suites remain the release gate: run `npm run validate`,
`npm run format:check` and `npm run test:browser` from the repository root.
