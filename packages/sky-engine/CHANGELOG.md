# Changelog

All notable changes to `@orangely/sky-engine`. Versions follow [Semantic Versioning](https://semver.org/);
each version is distributed as a GitHub Release tagged `sky-engine-v<version>` (no npm registry).

## 0.4.0 — unreleased

Performance and runtime environments. Backward compatible: the stable API only gains exports and
accepts wider parameter types. Main-thread rendering output is unchanged, except that the Moon
portrait may differ by at most 1 in an RGB channel (alpha is identical).

### Added

- **Rendering in a Worker.** `renderIllustration`, `renderSkyChart`, `renderMinimalSkyMap` and
  `renderMoonPhase` accept an `OffscreenCanvas` as well as an `HTMLCanvasElement`, and
  `paintIllustrationPanel` an `OffscreenCanvasRenderingContext2D` as well. Landscape artwork
  (`landscapeArt`, `loadLandscape`) may be an `ImageBitmap` as well as a decoded `<img>`. Inside a
  Worker the engine's working canvases are `OffscreenCanvas`; wherever a `document` exists they are
  still DOM canvases, so main-thread pixels do not change. See the README for fonts in a Worker and
  `examples/worker-render.ts` (source repository) for a complete example.
- **Lite build.** `sky-engine.lite.mjs` (`@orangely/sky-engine/lite`): the same exports without the
  bundled Temporal polyfill, about 209 KB instead of 411 KB. It is in the release assets and the
  core npm archive. Use one build per page or Worker; each has its own catalog and Moon texture.
- `installTemporal(temporal)`: supply the host's Temporal implementation (both builds). Without a
  native or installed Temporal, the lite build's civil-time functions report `UNSUPPORTED`.
- Type exports `RenderCanvas`, `RenderContext2D` and `RenderImage`, and `DomCanvas`, `DomContext2D`
  and `DomImage`. The declarations compile in a Worker-only TypeScript project without the DOM
  library; `sdk:build` checks this with a strict `WebWorker` consumer.

### Changed

- The Moon portrait renders about 2.4 to 2.5 times faster (`npm run sdk:bench`, medians of three
  runs on the same machine: 1319 → 519 ms at 4096 px, 358 → 149 ms at 2048 px): per-row and
  per-column terms are computed once, and `Math.pow`, `Math.atan2` and `Math.asin` in the pixel loop
  are replaced by interpolated tables. A frozen copy of the 0.3.0 pixel loop is the test reference:
  RGB channels stay within 1, alpha is identical.
- A civil-time function called before any Temporal is available (for example an `advanced` function
  before `advanced.ensureTemporal()` on a runtime without a native Temporal) now throws an
  `UNSUPPORTED` `SkyEngineError` instead of a `TypeError`.

### Build and documentation

- `npm run sdk:build` builds both modules, checks that only the full one bundles the polyfill, gives
  the lite module its own budgets (275,000 raw and 100,000 gzip bytes), and checks that both have the
  same runtime export names as `api-exports.json`. The offline Node smoke test and a browser
  distribution test cover the lite build; a new browser test compares Worker and main-thread pixels.
- The Worker example is type-checked against the shipped declarations.

## 0.3.0 — unreleased

The one planned incompatible release: it settles the public API before now-and-more adopts the
engine. Rendering output is unchanged (the existing pixel tests pass with the same tolerances).
Read [Migrating from 0.2.x](#migrating-from-02x) before upgrading.

### Changed (breaking)

- **Two API layers.** The package root is now the stable API. Lower-level building blocks moved to
  the `advanced` namespace (`import { advanced } from '@orangely/sky-engine'`), marked
  `@experimental`: they may change in a minor version. `advanced` is a namespace of the same single
  `sky-engine.mjs`, so there is still one module instance, one star catalog and one default Moon
  texture.
- **No mutable global exports.** `STAR_CATALOG` and `CONSTELLATIONS` are removed; use
  `getStarCatalog()` and `getPatterns()`. The installed catalog and patterns are frozen.
  `HORIZON_VARIANTS` (now `readonly HorizonVariant[]`) and `advanced.MILKY_WAY_SHAPE` are frozen.
- **One error type.** Every failure is a `SkyEngineError` with a `code` (`INVALID_INPUT`, `TIMEOUT`,
  `CANCELLED`, `MISSING_ASSET`, `ASSET_FAILED`, `UNSUPPORTED`) instead of a `RangeError`,
  `TypeError` or plain `Error`. Messages are unchanged, except:
  - a timeout and a cancellation are now distinguished: `'<Resource> timed out.'` (`TIMEOUT`) and
    `'<Resource> cancelled.'` (`CANCELLED`) replace the shared `'<Resource> cancelled or timed out.'`
    (for `Star catalog`, `Landscape art` and `Moon texture`);
  - `renderMinimalSkyMap` reports a malformed composition as `'Invalid illustration composition.'`
    (was `'Invalid pattern composition.'`), like `renderIllustration`.
- **Host loader failures are wrapped.** A rejecting or throwing `loadCatalog`, `loadLandscape`,
  `loadTexture` or `loadStarCatalog` function, and a failing `fetch` in `loadMoonTexture`, now
  surface as `ASSET_FAILED` with the loader's message and the original error as `cause` (they used
  to propagate unchanged). `loadStarCatalog` still throws synchronously for a synchronously throwing
  load function, now as `ASSET_FAILED`. Every other Moon texture pixel-read failure is also
  `ASSET_FAILED` (it used to be rethrown unchanged); the cross-origin explanation is kept.
- **Stricter option validation.** `assetTimeoutMs` is validated (1–30000 ms) whenever it is passed
  to `renderIllustration` or `renderMoonPhase`, even if no loader runs (it used to be checked only
  when a loader was called). `paintIllustrationPanel` rejects an unknown `landscape`.

### Added

- `SkyEngineError` and the `SkyEngineErrorCode` type.
- `getStarCatalog()` and `getPatterns()`: the installed catalog and built-in patterns, frozen once at
  installation (each call returns the same arrays; no copying). Empty until installation.
- `createSkyScene` accepts `assetTimeoutMs` (default 15000, the previous fixed bound) and `signal`,
  like the renderers that load resources.
- Type exports for `IllustrationDetails`, `IllustrationText` and `LandscapeSeason` at the root (they
  are part of the stable option types).

### Build and documentation

- `api-exports.json` records the root exports and the `advanced.<name>` members; any change fails
  `npm run sdk:build`. The NodeNext consumer and the Node smoke test cover the namespace, the
  read-only accessors and every error code.
- `API.md` is split into the stable API and the advanced API.

### Migrating from 0.2.x

Upgrading from 0.2.0 also brings in the changes of
[0.2.1](#021--not-released-separately-shipped-in-030), which was not released separately: the readable
cross-origin Moon texture error, the documented `loadStarCatalog` behavior (one warning for an ignored
load function, which is released once its installation settles), the runtime export lock, the README /
API reference / changelog split and the `npm run sdk:bench` benchmark. Those changes are compatible;
the rest of this section lists what 0.3.0 itself changes.

Moved to `advanced` (same signatures; use `advanced.<name>`, and `advanced.<Type>` for types):

| 0.2.x                                                                                                                                                                          | 0.3.0                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `calculateSky`, `calculateDailyEvents`, `getPhase`, `nextBodyRise`, `ensureTemporal`                                                                                           | `advanced.calculateSky`, …           |
| `galacticFromEquatorial`, `createSceneToGalactic`, `MILKY_WAY_SHAPE`                                                                                                           | `advanced.galacticFromEquatorial`, … |
| `createProjection`, `createCoverProjection`, `createSkyRay`                                                                                                                    | `advanced.createProjection`, …       |
| `drawIllustration`, `lettering`, `frameMoment`, `paintFinish`                                                                                                                  | `advanced.drawIllustration`, …       |
| `horizonAltitude`, `landscapeLight`, `landscapeSeason`                                                                                                                         | `advanced.horizonAltitude`, …        |
| `projectSkyChart`, `selectSkyChartObjects`                                                                                                                                     | `advanced.projectSkyChart`, …        |
| `starCatalogInstallation`                                                                                                                                                      | `advanced.starCatalogInstallation`   |
| Types `Projected`, `Projection`, `ToCanvas`, `MomentFraming`, `SkyChartPoint`, `SkyChartCandidates`, `SkyChartSelectedObject`, `SkyChartSelection`, `SkyChartSelectionOptions` | `advanced.Projected`, …              |

```ts
// 0.2.x
import { createCoverProjection, calculateSky } from '@orangely/sky-engine';
const { toCanvas } = createCoverProjection(scene.view, scene.aspect, width, height);
// 0.3.0
import { advanced } from '@orangely/sky-engine';
const { toCanvas } = advanced.createCoverProjection(scene.view, scene.aspect, width, height);
```

`createSkyScene` already calls `ensureTemporal`, and a scene's `sky` is `calculateSky`'s result, so
most hosts need neither. `starCatalogLoaded()` and `awaitStarCatalog()` remain stable.

Removed:

| 0.2.x            | 0.3.0                                                 |
| ---------------- | ----------------------------------------------------- |
| `STAR_CATALOG`   | `getStarCatalog()` (call it again after installation) |
| `CONSTELLATIONS` | `getPatterns()`                                       |

The old exports were live bindings; the functions return the current frozen arrays. Code that
mutated them, or `HORIZON_VARIANTS`, must copy first (`[...getStarCatalog()]`).

Changed errors:

| 0.2.x check                                                                                                                                                                   | 0.3.0                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `error instanceof RangeError` / `TypeError` (invalid input)                                                                                                                   | `error instanceof SkyEngineError && error.code === 'INVALID_INPUT'` |
| `/cancelled or timed out/.test(error.message)`                                                                                                                                | `error.code === 'TIMEOUT'` or `error.code === 'CANCELLED'`          |
| `/cancelled/.test(error.message)`                                                                                                                                             | `error.code === 'CANCELLED'` (or `error.name === 'AbortError'`)     |
| `'Supply a star catalog loader…'`, `'This landscape requires decoded artwork.'`, `'Supply a Moon texture…'`, `'Star catalog is not loading.'`, `SkyChartCatalogNotReadyError` | `error.code === 'MISSING_ASSET'`                                    |
| The host loader's own error, propagated unchanged                                                                                                                             | `error.code === 'ASSET_FAILED'`; the original is `error.cause`      |
| `'Canvas 2D is unavailable.'`                                                                                                                                                 | `error.code === 'UNSUPPORTED'`                                      |
| The cross-origin Moon texture `Error` (`cause`: `SecurityError`)                                                                                                              | Same message and `cause`, now `ASSET_FAILED`                        |
| `'Invalid pattern composition.'` from `renderMinimalSkyMap`                                                                                                                   | `'Invalid illustration composition.'` (`INVALID_INPUT`)             |

Options: pass `assetTimeoutMs` only with a valid value (1–30000) to `renderIllustration` and
`renderMoonPhase`. `createSkyScene` can now take `assetTimeoutMs` and `signal`. The other option
names and defaults are unchanged; see the shared-options table in `API.md`.

## 0.2.1 — not released separately (shipped in 0.3.0)

There is no `sky-engine-v0.2.1` tag or GitHub Release; the changes below are included in 0.3.0.

Backward-compatible maintenance release. No exports are added, removed or renamed, and rendering
output is unchanged.

### Fixed

- `renderMoonPhase` and `installMoonTexture`: when reading the pixels of an
  `HTMLImageElement` or `ImageBitmap` fails because a cross-origin image tainted the canvas, the
  engine now throws an `Error` that explains the same-origin / CORS (`crossOrigin`) requirement,
  with the original `SecurityError` as its `cause`. Other errors are rethrown unchanged.

### Changed

- `loadStarCatalog`: behavior is unchanged (a load function passed while an installation is in
  flight or complete is ignored and not called), but it is now documented and covered by tests. A
  different function passed while an installation is in flight logs one `console.warn`.

### Build and documentation

- `npm run sdk:build` checks the installed package's runtime export names against the committed
  `api-exports.json` and fails on any difference (`SKY_ENGINE_UPDATE_API=1` updates it).
- The README now covers usage only; new `API.md` reference and this changelog ship in the core
  archive. Internal architecture and roadmap notes moved to `docs/sky-engine/` in the repository.
- New `npm run sdk:bench` records Chromium rendering timings of the built module (not a CI gate).

## 0.2.0 — 2026-11-24

### Added

- Circular sky chart and minimal star map (#49): `renderSkyChart`, `renderMinimalSkyMap`, the
  canvas-free `buildSkyChartSnapshot`, and the `projectSkyChart` / `selectSkyChartObjects` building
  blocks, with `midnight` and `paper` themes and `en` / `zh-Hans` labels.
- Realistic Moon portrait (#50): `renderMoonPhase`, `loadMoonTexture` and `installMoonTexture`, using
  the observer-frame ephemeris and IAU body axes, with `observer` or `north-up` orientation, optional
  earthshine, and transparent, dark or light backgrounds up to 4096 px.
- Optional `@orangely/sky-engine-moon-texture` archive and standalone `moon-lroc.jpg` (NASA
  public-domain LROC map, checksum-verified at build time). The core archive never contains it.

## 0.1.0 — 2026-11-24

First versioned distribution (#48, M3), built from the same sources as the Elsewhere app.

### Added

- Self-contained browser ESM `sky-engine.mjs` (Astronomy Engine and the Temporal fallback bundled, no
  extra chunks), NodeNext-compatible declarations, the HYG v4.1 `stars.json` catalog, notices, and an
  optional city/mountain landscape archive, with `manifest.json` and `SHA256SUMS`.
- Release workflow that publishes immutable GitHub Release assets for a tag matching the package version.

### Included from earlier, unversioned milestones

- **M1 (#46):** the shared astronomy, star catalog, framing and Canvas 2D illustration code extracted
  into `packages/sky-engine` without rendering changes; Elsewhere's modules re-export it.
- **M2 (#47):** host-neutral facade: `createSkyScene`, `renderIllustration`,
  `prepareIllustrationScene`, `paintIllustrationPanel`, `createCoverProjection`, explicit composition
  and custom patterns, injected landscape loaders, bounded resource loading, and joining an in-flight
  catalog installation (`awaitStarCatalog`, `starCatalogInstallation`).
