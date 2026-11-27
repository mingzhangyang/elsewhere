# Sky Engine API reference

The public API of `@orangely/sky-engine` 0.4. It has two layers:

- **Stable API**: every export of the package root except `advanced`. These names follow Semantic
  Versioning: they change incompatibly only in a new major version.
- **Advanced API** (`advanced` namespace): lower-level building blocks, all marked
  **`@experimental`**. They may change in any minor version. Use them only when the stable functions
  cannot do the job, and pin the minor version when you do.

```ts
import { advanced, createSkyScene, renderIllustration } from '@orangely/sky-engine';
const project = advanced.createProjection(scene.view, scene.aspect);
```

`advanced` is a namespace of the same single `sky-engine.mjs` module, not a separate file, so there is
still exactly one star catalog and one default Moon texture per module instance. Both layers are
locked by `api-exports.json` (root names, and namespace members as `advanced.<name>`).

The **lite build** (`sky-engine.lite.mjs`, package subpath `@orangely/sky-engine/lite`) has the same
exports, declarations and behavior, except that it bundles no Temporal polyfill (see
[`installTemporal`](#installtemporaltemporal-unknown-void)). The export lock covers both builds. Use
one build per page or Worker: each is its own module instance with its own catalog, Moon texture and
Temporal.

Signatures are abbreviated from the shipped declarations in `types/`; those declarations are
authoritative. Angles are degrees, azimuths are clockwise from north, and altitudes are above the
horizon, unless stated otherwise.

## Errors

Every failure is a `SkyEngineError`. Synchronous functions throw it; `async` functions reject with it.

```ts
class SkyEngineError extends Error {
  readonly code: SkyEngineErrorCode;
  readonly cause?: unknown;
}
```

| `code`          | `name`           | Meaning                                                                                |
| --------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `INVALID_INPUT` | `SkyEngineError` | An argument, option, canvas size, scene or decoded data value is invalid.              |
| `TIMEOUT`       | `SkyEngineError` | A resource wait exceeded its bound (`assetTimeoutMs`, or `awaitStarCatalog`'s).        |
| `CANCELLED`     | `AbortError`     | The caller's `signal` was aborted.                                                     |
| `MISSING_ASSET` | `SkyEngineError` | A required resource was not supplied: the star catalog, a Moon texture, landscape art. |
| `ASSET_FAILED`  | `SkyEngineError` | A resource failed to load or decode. `cause` holds the original error.                 |
| `UNSUPPORTED`   | `SkyEngineError` | The environment lacks a required feature: no Canvas 2D context, or no Temporal.        |

Branch on `code`; messages are for people and may be reworded. Cancellation keeps the name
`AbortError`, so `error.name === 'AbortError'` checks keep working. When a host loader
(`loadCatalog`, `loadLandscape`, `loadTexture`, or the function given to `loadStarCatalog`) throws or
rejects, the engine reports `ASSET_FAILED` with the loader's message and the original error as
`cause`; a `SkyEngineError` thrown by the loader itself is passed through unchanged. More codes may be
added in a minor version.

## Stable API

### Scenes

#### `createSkyScene(options: SkySceneOptions): Promise<MomentSnapshot>`

Calculates a complete scene for one observer and instant without geolocation, weather services or app
state. Prepares civil time and the star catalog first. In the lite build without a native or installed
Temporal it rejects with `UNSUPPORTED` before starting a catalog load.

| Option                    | Type / default                                                           | Notes                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `latitude`, `longitude`   | `number`                                                                 | Required; ±90 and ±180.                                                                                                |
| `timezone`                | `string`                                                                 | Required IANA time zone.                                                                                               |
| `instant`                 | `Date`                                                                   | Required; 1900–2100. Copied.                                                                                           |
| `elevation`               | `number`, `0`                                                            | Meters, −500 to 10,000.                                                                                                |
| `locationName`, `country` | `string`, `''`                                                           | Metadata only; blank values are described as unspecified on charts.                                                    |
| `weather`                 | `WeatherValues \| 'clear'`, default values                               | Omitted: provenance `none`. `'clear'`: clear-sky assumption (provenance `clear`). Values: copied, provenance `custom`. |
| `skyBrightness`           | `'dark' \| 'suburban' \| 'city'`, `'dark'`                               |                                                                                                                        |
| `view`                    | `CameraView`, `{ heading: 0, altitude: 20, fov: 66 }`                    | Copied.                                                                                                                |
| `aspect`                  | `number`, `1`                                                            | Source view width / height, 0.1–10.                                                                                    |
| `layers`                  | `Partial<LayerSettings>`, `{ stars: true, lines: false, labels: false }` | Copied.                                                                                                                |
| `loadCatalog`             | `(signal: AbortSignal) => Promise<CatalogRow[]>`                         | Needed only when no catalog is installed or installing.                                                                |
| `assetTimeoutMs`          | `number`, `15000`                                                        | 1–30000. Bounds the wait for the catalog (own load or a joined one). Always validated.                                 |
| `signal`                  | `AbortSignal`                                                            | Cancels this call, and a catalog load this call started.                                                               |

Errors:

- `INVALID_INPUT`: missing time zone, invalid coordinates/elevation, unknown time zone, instant
  outside 1900–2100, invalid `aspect`, `view` (heading 0–<360, altitude ±90, fov 2–92), sky
  brightness, `assetTimeoutMs`, weather values (missing or non-finite fields, percentages outside
  0–100, negative visibility/wind/precipitation) or layers; catalog rows that fail validation (see
  `loadStarCatalog`).
- `MISSING_ASSET` (`'Supply a star catalog loader before creating a scene.'`) when there is no
  catalog, installation or `loadCatalog`.
- `TIMEOUT` (`'Star catalog timed out.'`). A caller that joins another caller's installation times
  out alone; the installation continues. `CANCELLED` (`'Sky scene cancelled.'` or
  `'Star catalog cancelled.'`). `ASSET_FAILED` when `loadCatalog` fails.
- `UNSUPPORTED` (lite build only) when no Temporal is available; see `installTemporal`.

#### `installTemporal(temporal: unknown): void`

Uses the host's Temporal implementation for all civil-time work, in place of the runtime's own and of
the bundled polyfill, for example `installTemporal(Temporal)` with `Temporal` from
`@js-temporal/polyfill`. Call it before `createSkyScene()`. It exists in both builds and is needed only
by the lite build on runtimes without a native `Temporal`. The implementation must provide `Instant`,
`ZonedDateTime`, `PlainDate` and `PlainDateTime`; anything else throws `INVALID_INPUT`. The latest call
wins.

Without a Temporal (lite build, no native one, nothing installed), `createSkyScene`,
`advanced.ensureTemporal`, `advanced.calculateSky` and `advanced.calculateDailyEvents` fail with
`UNSUPPORTED`; the message names both remedies (`installTemporal()`, or the full build).

### Rendering

All renderers need Canvas 2D. The `canvas` parameter is a `RenderCanvas`: an `HTMLCanvasElement` or
an `OffscreenCanvas`, also inside a Worker (see the README's Worker section for fonts and assets there).
Each validates its input, and the asynchronous ones load their resources, before resetting the caller's
canvas (by reassigning its width), so those failures leave the canvas as it was. Common errors:
`UNSUPPORTED` (`'Canvas 2D is unavailable.'`) and `INVALID_INPUT` for out-of-range canvas sizes or
aspect ratios. The engine's private working canvases are DOM canvases wherever a `document` exists and
`OffscreenCanvas` otherwise.

Shared options use the same names, types and validation everywhere they apply:

| Option              | Used by                                                       | Default                                                                          |
| ------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `composition`       | `renderIllustration`, `prepareIllustrationScene`, minimal map | `'auto'` for illustrations; `'current'` for the minimal map (a position diagram) |
| `layers`            | `createSkyScene`, `renderIllustration`, minimal map           | Scene: `{ stars: true, lines: false, labels: false }`; renderers: the scene's    |
| `patterns`          | `renderIllustration`, `paintIllustrationPanel`, minimal map   | The built-in patterns; `[]` disables them                                        |
| `assetTimeoutMs`    | `createSkyScene`, `renderIllustration`, `renderMoonPhase`     | 15000 for the catalog; 10000 for landscape art and the Moon texture              |
| `signal`            | `createSkyScene`, `renderIllustration`, `renderMoonPhase`     | None. The synchronous renderers take no signal.                                  |
| `theme`             | `renderSkyChart`, `renderMinimalSkyMap`                       | `'midnight'`                                                                     |
| `limitingMagnitude` | `renderSkyChart`, `renderMinimalSkyMap`                       | 6 for the whole-sky chart; 4.5 for the minimal map                               |
| `locale`            | `renderSkyChart`, `renderMinimalSkyMap`                       | `'en'`                                                                           |

`assetTimeoutMs` must be 1–30000 and is validated even when no loader ends up being called.

#### `renderIllustration(canvas, scene, options?): Promise<MomentSnapshot>`

Paints the watercolor scene over the **whole** canvas (1–4096 px per side, aspect 0.1–10) and returns
the composed snapshot. `RenderIllustrationOptions`:

- `composition`: `'auto'` (default), `'current'` or `{ pattern: id }`. See `prepareIllustrationScene`.
- `layers`: overrides of the scene's layers. `patterns`: custom `IllustrationPattern[]` (at most 32
  patterns and 256 edges; an empty array disables the built-in patterns). `milkyWay`: default `true`.
- `landscape`: `'ridge'` (default), `'sea'`, `'city'` or `'mountains'` (`HORIZON_VARIANTS`). The last
  two need decoded `landscapeArt` or `loadLandscape(request: LandscapeRequest, signal)` resolving to it:
  a `RenderImage`, that is a loaded `HTMLImageElement` (`complete`, non-zero `naturalWidth` and
  `naturalHeight`) or an open `ImageBitmap` (non-zero `width` and `height`; the only choice in a Worker).
- `paintFinish`: paper finish, default `true`. `text`, `font`: label wording and font family.
- `assetTimeoutMs` (default 10000) and `signal` bound `loadLandscape`.

Errors: `INVALID_INPUT` for canvas size, invalid landscape, timeout value, too many patterns/edges,
malformed patterns, edges or composition (`'Invalid illustration composition.'`), an unknown pattern
id, or `'Canvas size changed while loading illustration resources.'`; `MISSING_ASSET`
(`'This landscape requires decoded artwork.'`); `CANCELLED` (`'Illustration cancelled.'`,
`'Landscape art cancelled.'`); `TIMEOUT` (`'Landscape art timed out.'`); `ASSET_FAILED` when
`loadLandscape` fails.

#### `prepareIllustrationScene(scene, width, height, options?): MomentSnapshot`

Resolves `composition`, `layers`, `patterns` and `milkyWay` against an output size without mutating
`scene` or drawing. `'current'` keeps the view; `'auto'` uses automatic framing for the output aspect;
`{ pattern }` aims at the above-horizon members of a custom or built-in pattern (falling back to the
input view when none can be framed). Errors: `INVALID_INPUT`, as for `renderIllustration`, and for an
invalid scene view or aspect.

#### `paintIllustrationPanel(ctx, width, height, snapshot, options?): void`

Paints the illustration into the top-left `width × height` region of an existing context
(`RenderContext2D`: a `CanvasRenderingContext2D` or an `OffscreenCanvasRenderingContext2D`) without
owning the canvas size, resetting state or loading resources. `IllustrationPanelOptions`:
`landscape` (validated like `renderIllustration`'s), `landscapeArt` (a `RenderImage`), `text`, `font`,
`paintFinish` (default `true`), `patterns`, `milkyWay`. Errors: `INVALID_INPUT` for an unknown
landscape.

#### `renderSkyChart(canvas, scene, options?): SkyChartSnapshot`

Synchronous circular chart of the whole above-horizon hemisphere (north up, east left, zenith at
center). Canvas 160–4096 px per side, aspect 0.1–10. `SkyChartOptions`: `theme` `'midnight'`
(default) or `'paper'`; `limitingMagnitude` −5 to 20, default 6; `locale` `'en'` (default) or
`'zh-Hans'`. Returns the frozen chart data. Errors: `INVALID_INPUT` for size, theme, locale, magnitude
or inconsistent scene data; `MISSING_ASSET` (`'Sky chart star catalog is not ready.'`) when the full
catalog is not installed.

#### `renderMinimalSkyMap(canvas, scene, options?): MomentSnapshot`

Synchronous perspective position diagram with a footer. `MinimalSkyMapOptions` extends
`SkyChartOptions` (default `limitingMagnitude` 4.5) with `composition` (default `'current'`),
`patterns` and `layers`. Returns the composed scene. Errors as for `renderSkyChart`, plus
`INVALID_INPUT` for a malformed composition (`'Invalid illustration composition.'`), an unknown
pattern or an invalid remaining map aspect.

#### `renderMoonPhase(canvas, scene, options?): Promise<void>`

Textured orthographic lunar portrait (canvas 1–4096 px per side, aspect 0.1–10). `MoonPhaseOptions`:

- `style`: `'realistic'` only. `orientation`: `'observer'` (default, zenith up) or `'north-up'`.
- `background`: `'transparent'` (default), `'dark'` or `'light'`. `earthshine`: default `false`.
- `texture`: `MoonTexture`, or `loadTexture(signal)`; otherwise the texture installed with
  `installMoonTexture`. `assetTimeoutMs` (default 10000) and `signal` bound `loadTexture`.

Errors: `INVALID_INPUT` (`'Invalid Moon portrait options.'`, `'Invalid Moon ephemeris.'`, canvas or
texture size, timeout value, `'Canvas size changed while loading Moon texture.'`); `MISSING_ASSET`
(`'Supply a Moon texture or install one with installMoonTexture().'`); `CANCELLED`
(`'Moon portrait cancelled.'`, `'Moon texture cancelled.'`); `TIMEOUT` (`'Moon texture timed out.'`);
`ASSET_FAILED` when `loadTexture` fails, and the cross-origin error described under
`installMoonTexture`.

#### `loadMoonTexture(url: string | URL, signal?): Promise<ImageData>`

Fetches only the given URL, decodes it with `createImageBitmap` and returns its pixels; it works the
same inside a Worker. Errors:
`ASSET_FAILED` for a non-OK response (`'Moon texture unavailable: <status>'`) or a `fetch` / decoding
failure such as a CORS error (the original error is `cause`); `CANCELLED`
(`'Moon texture cancelled.'`) when `signal` is aborted; `INVALID_INPUT` for the texture size.

#### `installMoonTexture(texture: MoonTexture | null): void`

Decodes and installs the default texture for later `renderMoonPhase` calls; `null` clears it.
A texture must be a 2:1 equirectangular image at most 8192 × 4096 (`INVALID_INPUT` otherwise).
Decoded images are cached by identity. If an `HTMLImageElement` or `ImageBitmap` taints the decoding
canvas (cross-origin without CORS), an `ASSET_FAILED` error explains the same-origin / `crossOrigin`
requirement; its `cause` is the browser's `SecurityError`. Any other pixel-read failure is also
`ASSET_FAILED`, with the original error as `cause`.

### Star catalog

#### `decodeStarColumns(data: unknown): CatalogRow[]`

Decodes the columnar `stars.json`. Throws `INVALID_INPUT` (`'Invalid star catalog: …'`) for a wrong
column count, inconsistent column lengths, non-finite numbers or invalid identifiers/names.

#### `loadStarCatalog(load: () => Promise<CatalogRow[]>): Promise<void>`

Installs the catalog once per module instance. While an installation is in flight or after it has
succeeded, `load` is **ignored and not called** and the existing promise is returned; passing a
different function while one is in flight logs one `console.warn`. A failure rejects and clears the
attempt so that a later call retries: `ASSET_FAILED` (with `cause`) when `load` rejects, or
`INVALID_INPUT` when the rows fail validation (shape, finite coordinates, ranges, unique HYG ids, the
built-in pattern stars). A `load` that throws synchronously, instead of returning a rejected promise,
makes `loadStarCatalog` itself throw synchronously, as an `ASSET_FAILED` error with the original as
`cause`; nothing is installed or retained and a later call can retry. Use an `async` function to get
a rejection in both cases. The load function is released once its installation settles.

#### `awaitStarCatalog(timeoutMs = 15000): Promise<void>`

Waits for an existing installation. Resolves at once if a catalog is installed with no pending
attempt; rejects with `MISSING_ASSET` (`'Star catalog is not loading.'`) if there is neither, or
`TIMEOUT` (`'Star catalog timed out.'`) after the timeout (which affects only this waiter). Throws
`INVALID_INPUT` if `timeoutMs` is outside 1–30000.

#### `starCatalogLoaded(): boolean`

Whether a catalog is installed.

#### `getStarCatalog(): readonly CatalogStar[]` and `getPatterns(): readonly Constellation[]`

The installed catalog (5070 stars for the shipped `stars.json`) and the built-in line patterns
(`big-dipper`, `orion`, `crux`, `summer-triangle`, with catalog star IDs). Both are empty until the
catalog is installed. The returned arrays, every star, every pattern and its line pairs are frozen:
they are frozen once, when the catalog is installed, and every call returns the same arrays without
copying. Call the function again after installation to see the catalog.

### Validation and defaults

- `validateObserver(location: LocationInfo): void`: coordinates and elevation; `INVALID_INPUT`.
- `validateInstant(date: Date): Date`: 1900–2100 UTC; `INVALID_INPUT`.
- `defaultWeatherValues(): WeatherValues`: the default rendering weather.
- `HORIZON_VARIANTS`: the frozen list `['ridge', 'mountains', 'sea', 'city']` of `landscape` values.

### Sky chart data

#### `buildSkyChartSnapshot(input: SkyChartSnapshotInput, sky: SkyState, catalog?): SkyChartSnapshot`

Canvas-free chart data, the same that `renderSkyChart` returns. `input` is
`{ time: { kind: 'utc', utc }, location, limitingMagnitude? }` with a canonical millisecond ISO `utc`.
Throws `INVALID_INPUT` for invalid input or inconsistent sky data, and `MISSING_ASSET` without an
installed (or supplied) catalog.

### Main types

All type-only exports: `RenderCanvas` (`HTMLCanvasElement | OffscreenCanvas`), `RenderContext2D`
(`CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D`), `RenderImage`
(`HTMLImageElement | ImageBitmap`), `MomentSnapshot`, `CameraView`, `LayerSettings`, `IllustrationPattern`,
`IllustrationComposition`, `SkySceneOptions`, `RenderIllustrationOptions`, `LandscapeRequest`,
`LandscapeSeason`, `IllustrationPanelOptions`, `IllustrationDetails`, `IllustrationText`,
`HorizonVariant`, `SkyChartOptions`, `MinimalSkyMapOptions`, `SkyArtworkTheme`, `SkyChartSnapshot`,
`SkyChartSnapshotInput`, `SkyChartSnapshotObject`, `MoonPhaseOptions`, `MoonTexture`
(`ImageData | ImageBitmap | HTMLImageElement`), `CatalogRow`, `CatalogStar`, `Constellation`,
`PatternId`, `StarField`, `SkyBrightness`, `SkyEngineErrorCode`, and the astronomy types in
`types.ts` (`LocationInfo`, `SkyState`, `WeatherValues`, …).

## Advanced API (`advanced`, experimental)

Everything below is reached as `advanced.<name>` and is **`@experimental`**: it may change in a minor
version. Types are reached the same way, for example `advanced.Projection`.

### Astronomy

These functions need `advanced.ensureTemporal()` to have resolved and, for stars, an installed
catalog. `createSkyScene` does both. `location` is a `LocationInfo`.

- `ensureTemporal(): Promise<void>`: uses an installed or native `Temporal`, or loads the bundled
  polyfill once. In the lite build it rejects with `UNSUPPORTED` when there is neither.
- `calculateSky(location, date, events?): SkyState`: Sun, Moon, planets and stars for an instant.
- `calculateDailyEvents(location, date): SkyEvents`: rise/set and twilight events within the local
  calendar day.
- `nextBodyRise(location, body: BodyId, date): Date | null`: next rise within about a year, or `null`.
- `getPhase(angle): MoonPhaseKey`: phase key for an elongation angle.

Errors: `INVALID_INPUT` for invalid coordinates or elevation, an unknown time zone, or an instant
outside 1900–2100; `UNSUPPORTED` from `calculateSky` and `calculateDailyEvents` when no Temporal is
available.

### Catalog installation

- `starCatalogInstallation(): Promise<void> | null`: the in-flight or completed installation, or
  `null` before the first attempt and after a failed one. The stable `starCatalogLoaded()` and
  `awaitStarCatalog()` cover the usual checks.

### Sky chart building blocks

- `selectSkyChartObjects(candidates: SkyChartCandidates, options?): SkyChartSelection`: geometric
  above-horizon selection; independent of daylight and weather. `INVALID_INPUT` for invalid or
  duplicate candidates or an invalid magnitude; `MISSING_ASSET` for `starCatalogReady: false`.
- `projectSkyChart(altitude, azimuth): SkyChartPoint | null`: azimuthal-equidistant unit-disc
  position (zenith at 0,0, north up, east left), `null` below the horizon. `INVALID_INPUT` for
  non-finite input or altitude outside ±90.
- Types: `SkyChartCandidates`, `SkyChartSelectedObject`, `SkyChartSelection`,
  `SkyChartSelectionOptions`, `SkyChartPoint`.

### Projection and framing

- `createProjection(view, aspect)`: perspective `(altitude, azimuth) => Projected` in normalized
  device coordinates (types `Projection`, `Projected`).
- `createCoverProjection(view, aspect, width, height)`: the centered cover crop used by every
  renderer: `{ coverW, coverH, left, top, toCanvas }` (`toCanvas` is a `ToCanvas`).
- `createSkyRay(view, aspect, width, height)`: inverse of the cover projection, canvas pixel to
  scene direction.
- `frameMoment(snapshot, mode: MomentFraming, options?)`: automatic image framing.

### Painting

- `drawIllustration(ctx, width, height, snapshot, toCanvas, horizon, text, font, landscapeArt?, details?): void`
  (`ctx` a `RenderContext2D`, `landscapeArt` a `RenderImage`):
  the low-level painter used by `paintIllustrationPanel`, with an explicit `ToCanvas` projection.
- `paintFinish(ctx, x, y, w, h, seed, sky?): void`: the paper finish (bloom, pigment, vignette,
  painted border, grain) over a rectangle. `sky: false` paints the paper only.
- `lettering(text, size, font, weight?): string`: a CSS font string suited to the painting's lettering
  (italic Latin, brush-style Chinese where available).

### Scenery, seasons and the Milky Way

- `horizonAltitude(variant, azimuth)`: silhouette top edge in degrees.
- `landscapeSeason({ instant, location })` and `landscapeLight(altitude, azimuth)`: the season and
  light (`'day' | 'dawn' | 'dusk' | 'night'`) a `LandscapeRequest` asks for.
- `galacticFromEquatorial(raDeg, decDeg)`, `createSceneToGalactic(field)` and the frozen
  `MILKY_WAY_SHAPE`: Galactic coordinates and the shared Milky Way shape constants.
