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
  `npm run sdk:build`, for both the full and the lite module).
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
polyfill.

## Canvases and Workers

The public renderers take a `RenderCanvas` (`HTMLCanvasElement | OffscreenCanvas`) and draw through
`RenderContext2D`; landscape artwork is a `RenderImage` (`HTMLImageElement | ImageBitmap`), sized by
`imageSize()` and checked by `isDecodedImage()` (`src/moment/scratchCanvas.ts`). Every private
working canvas (the Moon texture decoder, the paper grain and pigment tiles, the diffusion copy, the
Milky Way raster and the cloud field) comes from `createScratchCanvas()`: a DOM canvas whenever a
`document` exists, so main-thread pixels are unchanged and OffscreenCanvas differences between
browsers (Safari has no `ctx.filter` there) cannot matter, and an `OffscreenCanvas` only without a
document, as in a Worker. Nothing else in the engine touches the DOM. A Worker has its own module
instance; the host installs the catalog and Moon texture there and loads any label web font into
`self.fonts`. Node has no `OffscreenCanvas`, so rendering in Node remains unsupported.

`tests/browser/sky-engine-worker.spec.ts` renders the four image kinds in a Worker and requires
pixel equality with the main thread's `OffscreenCanvas` output. Against DOM canvases Chromium differs
slightly for shadows inside a clip, independent of the engine, so that comparison is bounded rather
than exact except for the Moon portrait and the minimal map.

## Moon portrait pixel loop

`shadeMoon()` in `src/moment/moonPhase.ts` evaluates every disc pixel exactly, with per-row and
per-column terms precomputed, interpolated tables for the photometric response (`t^0.45`), `atan`
(after octant reduction) and `asin` (`Math.asin` where the sine of the latitude exceeds 0.95),
32-bit texel reads, and whole-pixel writes for the backdrop and the shadow. The 0.3.0 loop is frozen in
`tests/fixtures/moonPhaseReference.ts`; `tests/moonPhasePixels.test.ts` requires every RGB channel
within 1 and identical alpha across phases, orientations, backgrounds, earthshine and sizes, with a
random-noise texture as the worst case. Interpolating texture coordinates between alternate pixels
kept that tolerance but was slower in V8 than the exact loop and was not adopted.

## Catalog and civil time

The low-level functions need civil time via `ensureTemporal()` and decoded HYG rows via
`loadStarCatalog()`. The `createSkyScene()` facade handles both. Civil-time code reads the Temporal
API through `requireTemporal()` (`src/domain/temporal.ts`), which throws `UNSUPPORTED` when there is
none; `installTemporal()` replaces the live `Temporal` binding with a host implementation.

The lite module is built from the same entry with `@js-temporal/polyfill` aliased to
`src/temporalUnavailable.ts` (no `Temporal`) and `__SKY_ENGINE_LITE__` defined as true, so
`createSkyScene()` can fail before starting a catalog load. Elsewhere and the tests never define it.
Each build is a separate module instance, so a host must use only one of them per page or Worker. Elsewhere's existing loader
(`src/services/starCatalog.ts`) and data are deliberately unchanged. The catalog and license remain in
`src/data/stars.json` and `public/licenses/HYG.txt` (CC BY-SA 4.0); source code remains MIT.

The loader has one catalog per module instance. Internally `STAR_CATALOG` and `CONSTELLATIONS` are
live bindings that the engine and Elsewhere import directly; they are frozen (arrays and elements)
when installed, and the public API exposes them only through `getStarCatalog()` and `getPatterns()`,
which return those same frozen arrays without copying. An in-flight or completed installation ignores later load functions; a failed one is cleared
so that a later call retries. Scene creation joins an in-flight installation with a per-caller bound
(`assetTimeoutMs`, 15 s by default) and `signal` that never cancel the installation itself.
