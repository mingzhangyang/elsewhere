# Changelog

All notable changes to `@orangely/sky-engine`. Versions follow [Semantic Versioning](https://semver.org/);
each version is distributed as a GitHub Release tagged `sky-engine-v<version>` (no npm registry).

## 0.2.1 — unreleased

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
