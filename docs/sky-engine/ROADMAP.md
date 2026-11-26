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

The milestones preserve the current sky science, default rendering, share links and app behavior. The
existing validation and browser suites remain the release gate: run `npm run validate`,
`npm run format:check` and `npm run test:browser` from the repository root.
