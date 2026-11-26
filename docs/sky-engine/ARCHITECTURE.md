# Sky Engine architecture

Internal notes for maintainers of `packages/sky-engine`. Usage documentation for consumers is in the
package [README](../../packages/sky-engine/README.md) and [API reference](../../packages/sky-engine/API.md).

## Single source of truth

`packages/sky-engine/src` is the single source of truth for the shared sky calculations and the Canvas
2D illustration pipeline. Elsewhere's existing `src/domain`, `src/moment`, `src/lib` and ridge entry
points re-export the relocated modules where needed. No copied implementations or second catalog state
are introduced. The application imports the source modules directly, not through `src/index.ts`; the
SDK distribution bundles `src/index.ts`.

## Boundaries

- `src/index.ts`: the common host-neutral source entry point for the distribution; its direct exports
  are the stable API. `src/advanced.ts` is re-exported from it as the `advanced` namespace
  (`export * as advanced`) of experimental building blocks. It is deliberately not a separate subpath
  file: the release must stay one self-contained `sky-engine.mjs`, and a second entry would need
  either a shared chunk or a second module instance with its own catalog. Root names and
  `advanced.<name>` members are locked by `packages/sky-engine/api-exports.json` (checked by
  `npm run sdk:build`).
- `src/errors.ts`: `SkyEngineError` and its codes. Every throw in the engine uses it; host loader
  failures are wrapped as `ASSET_FAILED` in `src/resources.ts` (and by `loadStarCatalog`).
- `src/types.ts` and `src/contracts.ts`: astronomy, weather values, camera, layers and moment contracts.
- `src/domain/`: observer and time validation, ephemerides, star catalog/encoding, Galactic coordinates,
  visibility, all-sky position selection and azimuthal-equidistant projection, and clear-weather defaults.
- `src/moment/`: projection, framing (including the #45 automatic framing policy), illustration,
  Galactic pigment, cloud and landscape painting, ridge, paper finish, chart painting and the Moon
  portrait.
- `src/scene.ts`, `src/render.ts`, `src/resources.ts`, `src/validation.ts`: the host-neutral facade
  (scene creation, whole-canvas rendering, bounded injected resource loading, input validation).
- Elsewhere continues to own weather retrieval/interpolation, location selection, Vite asset URLs,
  localization, the postcard text panel, WebGL capture, sharing and persistence.

The engine does not import the host application, React or Three.js (enforced by
`tests/skyEngine.test.ts`). Its astronomy routines depend on Astronomy Engine and the lazy Temporal
polyfill; the Canvas renderers require a browser DOM for temporary canvases. There is no promise of
Node/Worker rendering yet.

## Catalog and civil time

The low-level functions need civil time via `ensureTemporal()` and decoded HYG rows via
`loadStarCatalog()`. The `createSkyScene()` facade handles both. Elsewhere's existing loader
(`src/services/starCatalog.ts`) and data are deliberately unchanged. The catalog and license remain in
`src/data/stars.json` and `public/licenses/HYG.txt` (CC BY-SA 4.0); source code remains MIT.

The loader has one catalog per module instance. Internally `STAR_CATALOG` and `CONSTELLATIONS` are
live bindings that the engine and Elsewhere import directly; they are frozen (arrays and elements)
when installed, and the public API exposes them only through `getStarCatalog()` and `getPatterns()`,
which return those same frozen arrays without copying. An in-flight or completed installation ignores later load functions; a failed one is cleared
so that a later call retries. Scene creation joins an in-flight installation with a per-caller bound
(`assetTimeoutMs`, 15 s by default) and `signal` that never cancel the installation itself.
