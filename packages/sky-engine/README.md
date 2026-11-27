# Sky Engine (v0.4.0)

Browser sky illustrations, star diagrams and lunar portraits from one calculated sky, for Canvas 2D.
`@orangely/sky-engine` is distributed through versioned GitHub Releases, not the npm registry.

- [API reference](API.md): every public export with its parameters and errors.
- [Changelog](CHANGELOG.md), including [migrating from 0.2.x](CHANGELOG.md#migrating-from-02x).
- [Worker example](examples/worker-render.ts) with its [page side](examples/worker-main.ts) (source
  repository only).
- Internal design: [architecture](../../docs/sky-engine/ARCHITECTURE.md) and
  [roadmap](../../docs/sky-engine/ROADMAP.md) (source repository only).

## Installation and release files

Download the assets of an **exact** GitHub Release tag (`sky-engine-v<version>`) and verify them with
`sha256sum --check SHA256SUMS`. Never depend on a "latest" URL at runtime.

Release assets for version **0.4.0**:

| Asset                                        | Purpose                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `sky-engine.mjs`                             | Self-contained browser ESM, served with a JavaScript MIME type                     |
| `sky-engine.lite.mjs`                        | The same API without the bundled Temporal polyfill (see [Lite build](#lite-build)) |
| `stars.json`                                 | Exact HYG v4.1 columnar catalog used by Elsewhere                                  |
| `orangely-sky-engine-0.4.0.tgz`              | npm-installable ESM (both builds), declarations, catalog and notices               |
| `orangely-sky-engine-landscapes-0.4.0.tgz`   | Optional city/mountain artwork and license                                         |
| `orangely-sky-engine-moon-texture-0.4.0.tgz` | Optional NASA lunar texture with provenance and license                            |
| `moon-lroc.jpg`                              | Standalone optional lunar texture for browser hosts                                |
| `sky-engine-NOTICES.txt`                     | MIT, runtime dependency notices and HYG attribution/license                        |
| `manifest.json` / `SHA256SUMS`               | Version, source commit, file sizes and SHA-256 integrity                           |

No npm registry publication is required. For npm applications, install the downloaded core tarball
(`npm install ./orangely-sky-engine-0.4.0.tgz`) and import from `@orangely/sky-engine` (or
`@orangely/sky-engine/lite`). Its package export `@orangely/sky-engine/stars.json` is available to
copy into the host's static assets.
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

## Browser API

Import the bundled ESM from a pinned release or the installed npm package. A plain browser consumer supplies
its observer and data; there is no geolocation prompt, live weather request, or site dependency.

The package root is the **stable API**. Lower-level building blocks (astronomy, projection, framing,
painting and chart selection) are grouped in the `advanced` namespace of the same module
(`advanced.createProjection`, …). They are **experimental** and may change in a minor version; see
the [API reference](API.md#advanced-api-advanced-experimental).

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
  installation (`awaitStarCatalog`). Each caller's wait is bounded by `assetTimeoutMs` (15 s by
  default) and can be cancelled with `signal`; a joiner timing out or being cancelled does not cancel
  another consumer's load, including a fetch the host already started. Failed
  installations are cleared so a later call can retry. Decoded rows are checked for shape, finite
  coordinates, ranges and unique HYG ids before they replace the shared catalog.
- `createSkyScene` prepares civil time and the catalog. The experimental low-level functions in
  `advanced` instead need `advanced.ensureTemporal()` before civil-time work and an installed catalog
  from `loadStarCatalog()`.
- `getStarCatalog()` and `getPatterns()` return the installed catalog and built-in line patterns as
  frozen, read-only arrays (empty until installation). They are frozen once when installed, so the
  calls are cheap.
- The low-level `loadStarCatalog(load)` installs one catalog per module instance. While an
  installation is in flight, or after it has succeeded, a new `load` function is **ignored and not
  called**; the existing promise is returned. Only a failed attempt lets a later `load` run. Passing
  a different function while one is in flight logs one `console.warn`. Use `starCatalogLoaded()`
  (or the experimental `advanced.starCatalogInstallation()`) to check for an existing installation
  first.
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
  wait has a 15 s default bound. Hosts should pass the signal into their I/O; uncooperative loaders
  cannot be forcibly stopped. Cancel an earlier render with an AbortController before starting
  a replacement on the same canvas.
- Existing apps can use `paintIllustrationPanel` synchronously on an already prepared snapshot and
  decoded artwork, to retain their own overlays and text layout. Elsewhere's postcard uses that
  entry point and the same cover projection (`advanced.createCoverProjection`) as the realistic
  capture. Rendering requires Canvas 2D: a DOM canvas, or an `OffscreenCanvas` (also inside a
  Worker, see [Rendering in a Worker](#rendering-in-a-worker)); pure scene creation needs neither.

### Errors

Every failure is a `SkyEngineError` with a `code`: `INVALID_INPUT`, `TIMEOUT`, `CANCELLED`,
`MISSING_ASSET`, `ASSET_FAILED` or `UNSUPPORTED`. A failing host loader is reported as
`ASSET_FAILED` with the original error as `cause`. Cancellation is named `AbortError`.

```ts
import { renderMoonPhase, SkyEngineError } from '@orangely/sky-engine';

try {
  await renderMoonPhase(canvas, scene, { signal });
} catch (error) {
  if (error instanceof SkyEngineError && error.code === 'CANCELLED') return; // superseded
  if (error instanceof SkyEngineError && error.code === 'MISSING_ASSET') showTextureHint();
  throw error;
}
```

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

## Realistic Moon portrait

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
- Decoding an `HTMLImageElement` or `ImageBitmap` reads its pixels through a canvas, so the image
  must be **same-origin or CORS-enabled**. For a cross-origin `<img>`, the server must send
  `Access-Control-Allow-Origin` and you must set `img.crossOrigin = 'anonymous'` before `src`.
  Otherwise the browser taints the canvas and the engine throws an `ASSET_FAILED` `SkyEngineError`
  explaining this (the original `SecurityError` is its `cause`). `loadMoonTexture(url)` uses `fetch`, which follows
  the same CORS rules.
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

## Rendering in a Worker

`renderIllustration`, `renderSkyChart`, `renderMinimalSkyMap` and `renderMoonPhase` accept an
`HTMLCanvasElement` or an `OffscreenCanvas`, and `paintIllustrationPanel` either kind of 2D context.
Import the module inside a dedicated module Worker and render there; a page canvas handed over with
`canvas.transferControlToOffscreen()` shows the result without blocking the main thread. Sky Engine
contains no Worker of its own: [`examples/worker-render.ts`](examples/worker-render.ts) and its page
side [`examples/worker-main.ts`](examples/worker-main.ts) (in the source repository) show the whole
exchange.

- **TypeScript.** The declarations compile in a Worker-only project (`lib: ["ES2022", "WebWorker"]`,
  no DOM library, `skipLibCheck: false`): the DOM-only parts of `RenderCanvas`, `RenderContext2D`,
  `RenderImage` and `MoonTexture` resolve to `never` there, leaving `OffscreenCanvas`,
  `OffscreenCanvasRenderingContext2D`, `ImageBitmap` and `ImageData`.
- **Assets.** Load the catalog with `fetch` in the Worker as usual. A Worker has no `<img>`:
  `loadMoonTexture(url)` works unchanged (it decodes with `createImageBitmap`), and city or
  mountain artwork must be an `ImageBitmap`, for example
  `loadLandscape: async (request, signal) => createImageBitmap(await (await fetch(url, { signal })).blob())`.
- **One copy per context.** The Worker's module instance has its own star catalog and Moon texture;
  install them in the Worker. Pass scenes or options between threads as plain data if needed.
- **Text and fonts.** The renderers draw text (chart captions and credits, and labels when
  `layers.labels` is on). In a Worker only system fonts and fonts added to the Worker's own
  `self.fonts` are available; a font the page loaded (CSS `@font-face`, `document.fonts`) is not.
  If labels use a web font (the `font` option of `renderIllustration`), load it in the Worker first:
  `const face = new FontFace('Caveat', 'url(/fonts/caveat.woff2)'); self.fonts.add(face); await face.load();`.
  Where `self.fonts` is missing, labels fall back to the next font in the list. The charts' fixed
  `system-ui` captions need nothing.
- **Pixels.** Inside a Worker the engine's private working canvases are `OffscreenCanvas`; on the main
  thread they stay DOM canvases, so main-thread output is exactly as before. In Chromium, Worker output
  equals main-thread output drawn into an `OffscreenCanvas` pixel for pixel. Compared with a DOM
  canvas, Chromium itself rasterises a few operations (a shadow inside a clip) very slightly
  differently. Browsers without `ctx.filter` on `OffscreenCanvas` (Safari) are unaffected: the engine
  does not use it.

## Lite build

`sky-engine.lite.mjs` (package subpath `@orangely/sky-engine/lite`) has exactly the same exports and
behavior as `sky-engine.mjs` but does not bundle the Temporal polyfill, which makes it about half the
size. It needs a Temporal implementation from the runtime or the host:

- Browsers with a native `Temporal` (current Chrome, Edge and Firefox) need nothing.
- Elsewhere, call `installTemporal(Temporal)` once before `createSkyScene()`, with an implementation
  such as the `Temporal` export of `@js-temporal/polyfill` (for example one the host already loads):

```ts
import { installTemporal, createSkyScene } from '@orangely/sky-engine/lite';
import { Temporal } from '@js-temporal/polyfill';

if (!('Temporal' in globalThis)) installTemporal(Temporal);
const scene = await createSkyScene({
  /* … */
});
```

Without either, the functions that need civil time (`createSkyScene`, `advanced.ensureTemporal`,
`advanced.calculateSky` and `advanced.calculateDailyEvents`) fail with an
`UNSUPPORTED` `SkyEngineError` whose message names both remedies; `createSkyScene` fails before it
starts loading the catalog. Rendering an existing scene needs no Temporal. `installTemporal` exists
in both builds, so code written for one runs with the other.

**Use only one build per page (or per Worker).** Each build is a separate module instance with its own
star catalog, Moon texture and Temporal: loading both would hold two copies of that state, and a
catalog installed through one is invisible to the other.

## Resources and licenses

The engine never makes an implicit network request: the star catalog, landscape artwork and Moon
texture are separate resources that the host serves and passes in.

- **Star catalog** (`stars.json`): the exact HYG v4.1 columnar derivative used by Elsewhere, licensed
  CC BY-SA 4.0 (`HYG.txt`, `CATALOG-ATTRIBUTION.md`). Decode it with `decodeStarColumns` and pass it
  to `createSkyScene({ loadCatalog })`. There is one catalog per module instance; read it with
  `getStarCatalog()`.
- **Landscape artwork** (optional archive): city and mountain WebP renders under the MIT license;
  see `LANDSCAPES.md` in the source. Ridge and sea need no artwork.
- **Moon texture** (optional archive or `moon-lroc.jpg`): NASA public-domain imagery with its
  provenance and checksum in [MOON-TEXTURE.md](MOON-TEXTURE.md). The core archive never contains it.
- **Code**: MIT. The bundled runtime dependencies (Astronomy Engine, the Temporal polyfill and its
  dependencies) keep their own notices in `THIRD-PARTY.txt` / `sky-engine-NOTICES.txt`. The package
  license expression `MIT AND CC-BY-SA-4.0` covers the code and the separately licensed catalog.

## Build and release

From a clean repository checkout run `npm ci` and `npm run sdk:build`. The SDK build is isolated
from the Elsewhere app's `dist/` and Service Worker: output is in ignored `dist-sdk/release/`.
The standalone ESM contains Astronomy Engine, Temporal fallback and its dependencies, with no
additional JS chunks, app dependencies, runtime CDN or import map. The lite ESM is built from the
same entry with `@js-temporal/polyfill` replaced by a stub; the build checks that only the full
module contains the polyfill. Catalog and optional imagery remain separate resources. The app's own
lazy Temporal import is unchanged.

The optional archives, the raw Moon image and the release SHA-256 manifest are produced by the same
command. The core module has initial independent limits of 750,000 raw and 250,000 gzip bytes, the lite
module 275,000 raw and 100,000 gzip bytes; catalog
gzip is capped at 120,000 bytes, the core npm archive at 400,000 bytes, and the optional artwork
archive at 5 MB. The separate lunar texture archive is capped at 600,000 bytes. Existing app limits are unchanged. CI checks the SDK on Node 24 on Linux and Windows,
and the Chromium distribution test serves the actual generated files on an independent host,
forces the bundled Temporal fallback, renders all four image types, checks diagram positions, custom line pixels, lunar phase area,
orientation and texture landmarks, then verifies identical offline reloads. The lite module is checked
there too (`UNSUPPORTED` without Temporal, then identical scenes and pixels to the full module after
`installTemporal`), as it is in the offline Node smoke test. A separate browser test renders all four
image types inside a Worker into `OffscreenCanvas` and compares them with the main thread.

The build also locks the public runtime API. After installing the core tarball offline it reads
the sorted runtime export names of `@orangely/sky-engine`, plus the members of its `advanced`
namespace as `advanced.<name>`, checks that `@orangely/sky-engine/lite` has exactly the same names,
and compares them with the committed
[`api-exports.json`](api-exports.json); any difference fails the build and lists the added and
removed names. To change the API deliberately, run `SKY_ENGINE_UPDATE_API=1 npm run sdk:build`,
review the rewritten file and commit it. Removing or renaming a root export is a breaking change;
`advanced` members are experimental and may change in a minor version (record it in the changelog).

`npm run sdk:bench` (after `npm run sdk:build`) records rendering timings of the built module in
Playwright's Chromium: a Moon portrait at 1024, 2048 and 4096 px, a 1200×1000 illustration with the
Milky Way and paper finish, and a 1000×1000 sky chart, each with one warm-up run. It prints JSON and
writes `dist-sdk/bench.json`. Set `SKY_ENGINE_BENCH_CHROMIUM` to a Chromium executable and
`SKY_ENGINE_BENCH_RUNS` (default 5) as needed. The numbers depend on the machine and are recorded
for comparison only; they are not a CI threshold.

Before a release, run `npm run validate`, `npm run format:check` and `npm run test:browser` from
the repository root; the existing validation and browser suites remain the release gate.

### Publishing after merge

The SDK version comes from `packages/sky-engine/package.json`. After the release PR is merged
and CI passes, push an annotated tag `sky-engine-v0.4.0` on the merged main commit. The release
workflow accepts only a tag matching the package version and reachable from main, validates the
app, rebuilds/tests the SDK, checks hashes and creates a GitHub Release without overwriting an
existing release. It does not publish to npm or deploy either app. Never move or reuse a version
tag: bump the package version (and add its `CHANGELOG.md` entry) for a new release. Use the CI candidate artifact for review before
tagging. Release assets remain unpublished until this explicit tag step.
