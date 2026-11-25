# Sky Engine — browser sky illustrations, star diagrams and lunar portraits (v0.2.0)

This directory is the single source of truth for the shared sky calculations and Canvas 2D illustration
pipeline. Elsewhere's existing `src/domain`, `src/moment`, `src/lib` and ridge entry points re-export
the relocated modules where needed. No copied implementations or second catalog state are introduced.

## Boundaries

- `src/index.ts`: the common host-neutral source entry point for the app and distribution.
- `src/types.ts` and `src/contracts.ts`: astronomy, weather values, camera, layers and moment contracts.
- `src/domain/`: observer and time validation, ephemerides, star catalog/encoding, Galactic coordinates,
  visibility, all-sky position selection and azimuthal-equidistant projection, and clear-weather defaults.
- `src/moment/`: projection, framing (including the #45 automatic framing policy), illustration,
  Galactic pigment, cloud and landscape painting, ridge, paper finish, and chart painting.
- Elsewhere continues to own weather retrieval/interpolation, location selection, Vite asset URLs,
  localization, the postcard text panel, WebGL capture, sharing and persistence.

The engine does not import the host application, React or Three.js. Its astronomy routines depend on
Astronomy Engine and the lazy Temporal polyfill; the Canvas renderers currently require a browser DOM
for temporary canvases. There is no promise of Node/Worker rendering in this milestone.

The low-level functions need civil time via `ensureTemporal()` and decoded HYG rows via `loadStarCatalog()`.
The new `createSkyScene()` facade handles both. Elsewhere's existing loader and data are deliberately unchanged. The catalog
and license remain in `src/data/stars.json` and `public/licenses/HYG.txt` (CC BY-SA 4.0); source code
remains MIT. The loader has one live catalog per module instance.

## Browser API

Import the bundled ESM from a pinned release or the installed npm package. A plain browser consumer supplies
its observer and data; there is no geolocation prompt, live weather request, or site dependency.

```ts
import { createSkyScene, decodeStarColumns, renderIllustration } from './vendor/sky-engine/sky-engine.mjs';

const scene = await createSkyScene({
  latitude: 39.14,
  longitude: -77.2,
  timezone: 'America/New_York',
  instant: new Date(),
  weather: 'clear',
  loadCatalog: async (signal) => {
    const response = await fetch('/assets/stars.json', { signal });
    if (!response.ok) throw new Error('Star catalog unavailable');
    return decodeStarColumns(await response.json());
  },
});
const canvas = document.createElement('canvas');
canvas.width = 1200;
canvas.height = 1000;
const framed = await renderIllustration(canvas, scene, {
  composition: 'auto',
  landscape: 'ridge',
  layers: { labels: false },
  milkyWay: true,
  paintFinish: true,
});
```

- `createSkyScene` requires an explicit time zone and date. An omitted weather value uses the
  default rendering assumptions with provenance `none`; `'clear'` records a clear-sky assumption,
  not a measured weather report. Explicit weather values are copied and recorded as custom.
  The input date, view, weather and layers are copied. A catalog loader is required only when this
  module has neither an installed catalog nor an in-flight installation. Concurrent calls join that
  installation (`awaitStarCatalog`). Each caller's wait is bounded to 15 s, and a joiner timing out
  does not cancel another consumer's load, including a fetch the host already started. Failed
  installations are cleared so a later call can retry. Decoded rows are checked for shape, finite
  coordinates, ranges and unique HYG ids before they replace the shared catalog.
- `renderIllustration` owns the **whole** canvas (dimensions set by the caller, 1–4096 px each,
  aspect 0.1–10). It resets the drawing state after resources are ready and returns the actual
  composed snapshot. It does not generate app-specific text, compass, link, or a download.
- `composition: 'current'` preserves the supplied camera and source aspect with a centered cover
  crop; `'auto'` uses the real output aspect for smart framing and respects explicit object focus.
  At postcard aspects the automatic Sun, Moon, galaxy and bright-star bias stays 8°; narrower
  output aspects reduce that bias so the target remains inside the frame.
  Use `{ pattern: 'signature' }` and `patterns: [{ id: 'signature', lines: [[idA, idB]] }]` for a
  host-selected pattern. IDs are actual HYG IDs such as `hyg-32263`; no fabricated coordinates.
  The engine uses above-horizon edges and tries progressively wider views. If no usable pattern
  can be framed, it preserves the input view. Set `layers.lines: true` to draw those edges.
  Pattern labels sit on a visible endpoint of an edge that was actually drawn, and are omitted
  when every member is below the horizon or behind the camera. An empty patterns list suppresses
  the built-in patterns; an omitted list keeps them.
- `ridge` and `sea` are procedural. `city` and `mountains` require a decoded `landscapeArt` image
  or a host-provided `loadLandscape(request, signal)` (season and light are selected by the engine).
  There is no bundled Vite URL or implicit network request. The wait is bounded (10 s by default;
  1–30000 ms configurable), and cancellation or failure is reported before drawing. The catalog
  loader has a 15 s bound. Hosts should pass the signal into their I/O; uncooperative loaders
  cannot be forcibly stopped. Cancel an earlier render with an AbortController before starting
  a replacement on the same canvas.
- Existing apps can use `paintIllustrationPanel` synchronously on an already prepared snapshot and
  decoded artwork, to retain their own overlays and text layout. Elsewhere's postcard uses that
  entry point and the same `createCoverProjection` as the realistic capture. The legacy low-level
  API is still available. Rendering requires browser Canvas 2D and DOM; pure scene creation does not.

## Image types

The same `MomentSnapshot` can be rendered in four image types, without recalculating astronomy:

| Image              | Public API            | Meaning                                                            |
| ------------------ | --------------------- | ------------------------------------------------------------------ |
| Watercolor sky     | `renderIllustration`  | Weather and light-dependent perspective scene with landscape       |
| Circular sky chart | `renderSkyChart`      | Whole above-horizon hemisphere; north up, east left, zenith center |
| Minimal star map   | `renderMinimalSkyMap` | Perspective position diagram with optional custom star lines       |
| Realistic Moon     | `renderMoonPhase`     | Textured lunar portrait with observer or lunar-north orientation   |

All four use Canvas 2D and the same calculated astronomy. The
interactive WebGL/Three.js explorer and its realistic screenshot remain **outside the SDK**.
The diagram types require no optional assets; the Moon portrait alone uses the optional lunar texture.

```ts
import { renderSkyChart, renderMinimalSkyMap } from '@orangely/sky-engine';

// A whole-sky chart with a light paper theme, independent of the camera:
renderSkyChart(chartCanvas, scene, { theme: 'paper', limitingMagnitude: 6, locale: 'en' });

// A dark minimal chart around a caller-defined pattern of real HYG IDs:
renderMinimalSkyMap(mapCanvas, scene, {
  theme: 'midnight',
  limitingMagnitude: 4.5,
  composition: { pattern: 'signature' },
  patterns: [{ id: 'signature', lines: [[idA, idB]] }],
  layers: { stars: true, lines: true, labels: false },
});
```

Both diagram renderers are synchronous, use a caller-sized canvas (160–4096 px each dimension,
aspect 0.1–10; the minimal map also validates the remaining sky panel aspect after its footer),
and reset the drawing state only after validation. Use at least 600 px for legible exported text.
They include HYG attribution, a calculated-position disclaimer, and a solar safety reminder by day.
They require the full installed HYG catalog used by `createSkyScene`; no independent star data is
created. Blank location names/countries in SDK scenes are described as unspecified in chart
metadata, never inferred.

The circular chart shares the existing Elsewhere memorial artwork's selection, projection, palette,
object marker sizes and disc painting, but not its brand, fixed 4:5 layout or personalized text.
`renderSkyChart` returns its frozen `SkyChartSnapshot`; `buildSkyChartSnapshot` can produce the
same calculated chart data without a canvas. Marker sizes are symbols, not angular diameters.
Both `midnight` and `paper` themes preserve exact object positions. Daylight, clouds and light
pollution do not remove geometrically above-horizon bodies from either diagram.

The minimal map returns the composed scene. Its default `current` composition preserves the
input camera and uses the same centered cover crop as illustrations. `auto` uses the existing
visibility-aware composition policy, but diagram object selection itself is geometric.
A named pattern frames only selected above-horizon members, independent of daylight/weather;
missing or too-faint members cannot create artificial stars. Unusable patterns retain the current
view. Only selected HYG stars can be pattern endpoints; Sun, Moon and planet IDs are ignored.
The star-dot, pattern-line and label layers are independent: hiding dots does not hide lines or
eligible bright-star names. Sun, Moon and planet symbols remain visible when selected and in view.
An empty custom-pattern array disables built-ins.
No terrain, atmospheric painting or invented decorative stars are drawn.

## Build and release

From a clean repository checkout run `npm ci` and `npm run sdk:build`. The SDK build is isolated
from the Elsewhere app's `dist/` and Service Worker: output is in ignored `dist-sdk/release/`.
The standalone ESM contains Astronomy Engine, Temporal fallback and its dependencies, with no
additional JS chunks, app dependencies, runtime CDN or import map. Catalog and optional imagery
remain separate resources. The app's own lazy Temporal import is unchanged.

Release assets for version **0.2.0**:

| Asset                                        | Purpose                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| `sky-engine.mjs`                             | Self-contained browser ESM, served with a JavaScript MIME type |
| `stars.json`                                 | Exact HYG v4.1 columnar catalog used by Elsewhere              |
| `orangely-sky-engine-0.2.0.tgz`              | npm-installable ESM, declarations, catalog and notices         |
| `orangely-sky-engine-landscapes-0.2.0.tgz`   | Optional city/mountain artwork and license                     |
| `orangely-sky-engine-moon-texture-0.2.0.tgz` | Optional NASA lunar texture with provenance and license        |
| `moon-lroc.jpg`                              | Standalone optional lunar texture for browser hosts            |
| `sky-engine-NOTICES.txt`                     | MIT, runtime dependency notices and HYG attribution/license    |
| `manifest.json` / `SHA256SUMS`               | Version, source commit, file sizes and SHA-256 integrity       |

No npm registry publication is required. For npm applications, install the downloaded core tarball
(`npm install ./orangely-sky-engine-0.2.0.tgz`) and import from `@orangely/sky-engine`. Its package
export `@orangely/sky-engine/stars.json` is available to copy into the host's static assets.
All three archives are tested with an isolated offline installation, and the core package with a strict
NodeNext TypeScript consumer. The package's license expression covers the MIT code and the separately
CC BY-SA 4.0 catalog; the bundled runtime dependencies retain their own license notices.

For now-and-more, download the browser module, catalog and notices from the **exact** GitHub Release
tag, verify `SHA256SUMS`, and copy them into a local versioned vendor directory. Import the local
ESM and explicitly fetch its matching local catalog. Precache both in the host Service Worker and
bump its cache version when upgrading. No runtime fetch from Elsewhere is needed. A host can
omit the optional landscape archive for procedural ridge or sea scenes. For the other landscapes,
extract its `package/landscapes` directory into the host's static resources and resolve the SDK's
season/light request to the appropriate WebP (see `LANDSCAPES.md` in the source).

The core module has initial independent limits of 750,000 raw and 250,000 gzip bytes; catalog
gzip is capped at 120,000 bytes, the core npm archive at 400,000 bytes, and the optional artwork
archive at 5 MB. The separate lunar texture archive is capped at 600,000 bytes. Existing app limits are unchanged. CI checks the SDK on Node 24 on Linux and Windows,
and the Chromium distribution test serves the actual generated files on an independent host,
forces the bundled Temporal fallback, renders all four image types, checks diagram positions, custom line pixels, lunar phase area,
orientation and texture landmarks, then verifies identical offline reloads.

### Publishing after merge

The SDK version comes from `packages/sky-engine/package.json`. After the release PR is merged
and CI passes, push an annotated tag `sky-engine-v0.2.0` on the merged main commit. The release
workflow accepts only a tag matching the package version and reachable from main, validates the
app, rebuilds/tests the SDK, checks hashes and creates a GitHub Release without overwriting an
existing release. It does not publish to npm or deploy either app. Never move or reuse a version
tag: bump the package version for a new release. Use the CI candidate artifact for review before
tagging. Release assets remain unpublished until this explicit tag step.

## Remaining milestones (separate, non-stacked changes)

1. **M1 (completed):** relocate implementation and contracts without changing rendering behavior;
   keep legacy imports and existing tests working. Check module boundary and single-instance exports.
2. **M2 (completed):** design and test a host-neutral scene/render facade, consistent crop/projection mapping,
   explicit composition and pattern overrides, asset injection, and bounded browser resource loading.
   Preserve current and automatic framing; allow the now-and-more signature asterism policy.
3. **M3 (completed):** publish a versioned build from the same sources: ESM (including a browser-consumable build),
   declarations, optional data/landscape assets, checksums and licenses. Validate package and app budgets
   and offline behavior; no remote latest-version runtime dependency.
4. **M4:** in now-and-more, consume the pinned artifact with local assets and cache-version updates,
   preserve estimated-location/clear-sky disclosure and card layout, replace copied sky calculations
   and rendering only after checking all callers, and remove unused duplicate catalog data.
5. **M5:** add shared fixtures and cross-consumer browser pixel/astronomy tests. Keep independent releases
   and regression gates; no forced simultaneous deploys.

M1 and M2 preserve the current sky science, default rendering, share links and app behavior. The existing
validation and browser suites remain the release gate. Run `npm run validate`, `npm run format:check`,
and `npm run test:browser` from the repository root.

## Fourth image type: realistic Moon portrait

The standalone portrait does not render a sky or require WebGL. Install the optional
`@orangely/sky-engine-moon-texture` archive separately (or use the release's `moon-lroc.jpg`).
Host the asset at a local URL or precache it using your application's service worker.

```ts
import { installMoonTexture, loadMoonTexture, renderMoonPhase } from '@orangely/sky-engine';

installMoonTexture(await loadMoonTexture('/assets/moon-lroc.jpg'));

canvas.width = 2048;
canvas.height = 2048;
await renderMoonPhase(canvas, scene, {
  style: 'realistic',
  orientation: 'observer',
  background: 'transparent',
  earthshine: true,
});
```

- `scene` is the existing `MomentSnapshot` from `createSkyScene`; its geometric Sun and Moon
  positions, illuminated fraction and IAU body axes drive the portrait. The apparent bright-limb
  angle remains for sky icons. The Moon can be rendered even below the horizon.
- `orientation`: `'observer'` (zenith up) or `'north-up'` (lunar north up, not celestial north).
- `background`: `'transparent'`, `'dark'` or `'light'`. Only the exterior is transparent;
  the unilluminated lunar surface is opaque. Earthshine defaults to false.
- `texture`: decoded `ImageData`, `ImageBitmap` or `HTMLImageElement`, with a 2:1 equirectangular
  map. Treat injected pixels as immutable. Decoded images are cached by identity. Alternatively,
  pass a host-owned `loadTexture(signal)` callback, or call `installMoonTexture` once. Per-call
  resources take precedence; `installMoonTexture(null)` clears the default. No implicit requests.
- `assetTimeoutMs` and `signal` bound asynchronous resource loading. Pixel rendering itself is
  synchronous CPU work; the returned promise resolves after writing the caller's canvas.
- The output is the existing canvas size (1–4096 per dimension, aspect 0.1–10), centered with
  transparent or solid margins. A 4096px portrait upsamples the supplied 2048×1024 NASA map;
  it does not create new terrain detail. Use a higher-resolution compatible map if available.

The renderer uses orthographic projection and bilinear sampling, wraps longitude at the seam,
and rotates the body frame into the local viewing frame to preserve libration. Lighting follows
the topocentric illuminated fraction and the airless bright-limb direction of the geometric Sun
and Moon. Surface photometry and earthshine are approximate; topographic shadows, eclipses, atmospheric
distortion across the disc and watercolor portraits are not modeled.

The optional archive, raw image, and release SHA-256 manifest are produced by
`npm run sdk:build`. See [Moon texture provenance](MOON-TEXTURE.md) in the source tree.
