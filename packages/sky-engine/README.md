# Sky Engine — source extraction (milestone 1)

This directory is the single source of truth for the shared sky calculations and Canvas 2D illustration
pipeline. Elsewhere's existing `src/domain`, `src/moment`, `src/lib` and ridge entry points re-export
the relocated modules where needed. No copied implementations or second catalog state are introduced.

## Boundaries

- `src/index.ts`: source-only entry point; not a published npm API yet.
- `src/types.ts` and `src/contracts.ts`: astronomy, weather values, camera, layers and moment contracts.
- `src/domain/`: observer and time validation, ephemerides, star catalog/encoding, Galactic coordinates,
  visibility and clear-weather defaults.
- `src/moment/`: projection, framing (including the #45 automatic framing policy), illustration,
  Galactic pigment, cloud and landscape painting, ridge and paper finish.
- Elsewhere continues to own weather retrieval/interpolation, location selection, Vite asset URLs,
  localization, the postcard text panel, WebGL capture, sharing and persistence.

The engine does not import the host application, React or Three.js. Its astronomy routines depend on
Astronomy Engine and the lazy Temporal polyfill; the Canvas renderers currently require a browser DOM
for temporary canvases. There is no promise of Node/Worker rendering in this milestone.

Initialize civil time via `ensureTemporal()` and install decoded HYG rows via `loadStarCatalog()` before
calculating a full sky. Elsewhere's existing loader and data are deliberately unchanged. The catalog
and license remain in `src/data/stars.json` and `public/licenses/HYG.txt` (CC BY-SA 4.0); source code
remains MIT. The loader has one live catalog per module instance.

## Remaining milestones (separate, non-stacked changes)

1. **M1 (this change):** relocate implementation and contracts without changing rendering behavior;
   keep legacy imports and existing tests working. Check module boundary and single-instance exports.
2. **M2:** design and test a host-neutral scene/render facade, consistent crop/projection mapping,
   explicit composition and pattern overrides, asset injection, and bounded browser resource loading.
   Preserve current and automatic framing; allow the now-and-more signature asterism policy.
3. **M3:** publish a versioned build from the same sources: ESM (including a browser-consumable build),
   declarations, optional data/landscape assets, checksums and licenses. Validate package and app budgets
   and offline behavior; no remote latest-version runtime dependency.
4. **M4:** in now-and-more, consume the pinned artifact with local assets and cache-version updates,
   preserve estimated-location/clear-sky disclosure and card layout, replace copied sky calculations
   and rendering only after checking all callers, and remove unused duplicate catalog data.
5. **M5:** add shared fixtures and cross-consumer browser pixel/astronomy tests. Keep independent releases
   and regression gates; no forced simultaneous deploys.

Do not change the current sky science, pixels, share links or app behavior as part of M1. The existing
validation and browser suites remain the release gate. Run `npm run validate`, `npm run format:check`,
and `npm run test:browser` from the repository root.
