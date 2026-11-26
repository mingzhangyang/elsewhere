# Sky Engine API reference

Every runtime export of `@orangely/sky-engine` (the list is locked by `api-exports.json`), grouped by
task, plus the main exported types. Signatures are abbreviated from the shipped declarations in
`types/`; those declarations are authoritative. Angles are degrees, azimuths are clockwise from
north, and altitudes are above the horizon, unless stated otherwise.

Errors are thrown synchronously by synchronous functions and reject the promise of `async` ones.
`RangeError` and `TypeError` mean invalid input; plain `Error` means a missing resource, cancellation
or an unavailable browser feature.

## Scenes

### `createSkyScene(options: SkySceneOptions): Promise<MomentSnapshot>`

Calculates a complete scene for one observer and instant without geolocation, weather services or app
state. Prepares civil time (`ensureTemporal`) and the star catalog first.

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
| `loadCatalog`             | `(signal: AbortSignal) => Promise<CatalogRow[]>`                         | Needed only when no catalog is installed or installing. Bounded to 15 s.                                               |

Errors:

- `RangeError`: missing time zone, invalid coordinates/elevation, unknown time zone, instant outside
  1900–2100, invalid `aspect`, `view` (heading 0–<360, altitude ±90, fov 2–92) or sky brightness;
  weather percentages outside 0–100 or negative visibility/wind/precipitation.
- `TypeError`: a missing or non-finite weather field, a non-boolean layer.
- `Error('Supply a star catalog loader before creating a scene.')` when there is no catalog,
  installation or `loadCatalog`.
- Catalog failures: decode/validation errors from the loader's rows (see `loadStarCatalog`), or
  `Error('Star catalog cancelled or timed out.')` after 15 s. A caller that joins another caller's
  installation times out alone; the installation continues.

## Rendering

All renderers need a browser Canvas 2D. Each validates its input, and the asynchronous ones load their
resources, before resetting the caller's canvas (by reassigning its width), so those failures leave the
canvas as it was. Common errors:
`Error('Canvas 2D is unavailable.')`, and `RangeError` for out-of-range canvas sizes or aspect ratios.

### `renderIllustration(canvas, scene, options?): Promise<MomentSnapshot>`

Paints the watercolor scene over the **whole** canvas (1–4096 px per side, aspect 0.1–10) and returns
the composed snapshot. `RenderIllustrationOptions`:

- `composition`: `'auto'` (default), `'current'` or `{ pattern: id }`. See `prepareIllustrationScene`.
- `layers`: overrides of the scene's layers. `patterns`: custom `IllustrationPattern[]` (at most 32
  patterns and 256 edges; an empty array disables the built-in patterns). `milkyWay`: default `true`.
- `landscape`: `'ridge'` (default), `'sea'`, `'city'` or `'mountains'`. The last two need a decoded
  `landscapeArt` image or `loadLandscape(request: LandscapeRequest, signal)`.
- `paintFinish`: paper finish, default `true`. `text`, `font`: label wording and font family.
- `assetTimeoutMs` (1–30000, default 10000) and `signal` bound `loadLandscape`.

Errors: `RangeError` for canvas size, invalid landscape, timeout value, too many patterns/edges, or an
unknown pattern id; `TypeError` for malformed patterns, edges or composition;
`Error('This landscape requires decoded artwork.')`; `Error('Illustration cancelled.')`;
`Error('Landscape art cancelled or timed out.')`;
`Error('Canvas size changed while loading illustration resources.')`.

### `prepareIllustrationScene(scene, width, height, options?): MomentSnapshot`

Resolves `composition`, `layers`, `patterns` and `milkyWay` against an output size without mutating
`scene` or drawing. `'current'` keeps the view; `'auto'` uses automatic framing for the output aspect;
`{ pattern }` aims at the above-horizon members of a custom or built-in pattern (falling back to the
input view when none can be framed). Errors as for `renderIllustration`, plus `RangeError` for an
invalid scene view or aspect.

### `renderSkyChart(canvas, scene, options?): SkyChartSnapshot`

Synchronous circular chart of the whole above-horizon hemisphere (north up, east left, zenith at
center). Canvas 160–4096 px per side, aspect 0.1–10. `SkyChartOptions`: `theme` `'midnight'`
(default) or `'paper'`; `limitingMagnitude` −5 to 20, default 6; `locale` `'en'` (default) or
`'zh-Hans'`. Returns the frozen chart data. Errors: `RangeError` for size, theme, locale, magnitude or
inconsistent scene data; an `Error` named `SkyChartCatalogNotReadyError` when the full catalog is not
installed.

### `renderMinimalSkyMap(canvas, scene, options?): MomentSnapshot`

Synchronous perspective position diagram with a footer. `MinimalSkyMapOptions` extends
`SkyChartOptions` (default `limitingMagnitude` 4.5) with `composition` (default `'current'`),
`patterns` and `layers`. Returns the composed scene. Errors as for `renderSkyChart`, plus
`TypeError('Invalid pattern composition.')` and `RangeError` for an unknown pattern or an invalid
remaining map aspect.

### `renderMoonPhase(canvas, scene, options?): Promise<void>`

Textured orthographic lunar portrait (canvas 1–4096 px per side, aspect 0.1–10). `MoonPhaseOptions`:

- `style`: `'realistic'` only. `orientation`: `'observer'` (default, zenith up) or `'north-up'`.
- `background`: `'transparent'` (default), `'dark'` or `'light'`. `earthshine`: default `false`.
- `texture`: `MoonTexture`, or `loadTexture(signal)`; otherwise the texture installed with
  `installMoonTexture`. `assetTimeoutMs` (1–30000, default 10000) and `signal` bound `loadTexture`.

Errors: `RangeError('Invalid Moon portrait options.')`, `RangeError('Invalid Moon ephemeris.')`,
canvas or texture size `RangeError`s; `Error('Supply a Moon texture or install one with
installMoonTexture().')`; `Error('Moon portrait cancelled.')`; `Error('Moon texture cancelled or
timed out.')`; `Error('Canvas size changed while loading Moon texture.')`; and the cross-origin error
described under `installMoonTexture`.

### `loadMoonTexture(url: string | URL, signal?): Promise<ImageData>`

Fetches only the given URL, decodes it with `createImageBitmap` and returns its pixels. Errors:
`Error('Moon texture unavailable: <status>')` for a non-OK response, `Error('Moon texture
cancelled.')`, the texture size `RangeError`, and any `fetch` / decoding error (for example a CORS
failure or an `AbortError`).

### `installMoonTexture(texture: MoonTexture | null): void`

Decodes and installs the default texture for later `renderMoonPhase` calls; `null` clears it.
A texture must be a 2:1 equirectangular image at most 8192 × 4096 (`RangeError` otherwise). Decoded
images are cached by identity. If an `HTMLImageElement` or `ImageBitmap` taints the decoding canvas
(cross-origin without CORS), an `Error` explains the same-origin / `crossOrigin` requirement; its
`cause` is the browser's `SecurityError`.

### `paintIllustrationPanel(ctx, width, height, snapshot, options?): void`

Paints the illustration into the top-left `width × height` region of an existing context without
owning the canvas size, resetting state or loading resources. `IllustrationPanelOptions`:
`landscape`, `landscapeArt`, `text`, `font`, `paintFinish` (default `true`), `patterns`, `milkyWay`.

### `drawIllustration(ctx, width, height, snapshot, toCanvas, horizon, text, font, landscapeArt?, details?): void`

The low-level painter used by `paintIllustrationPanel`, with an explicit `ToCanvas` projection.

### `paintFinish(ctx, x, y, w, h, seed, sky?): void`

The paper finish (bloom, pigment, vignette, painted border, grain) over a rectangle. `sky: false`
paints the paper only.

### `lettering(text, size, font, weight?): string`

Returns a CSS font string suited to the painting's lettering (italic Latin, brush-style Chinese
where available).

## Star catalog

### `decodeStarColumns(data: unknown): CatalogRow[]`

Decodes the columnar `stars.json`. Throws `Error('Invalid star catalog: …')` for a wrong column count,
inconsistent column lengths, non-finite numbers or invalid identifiers/names.

### `loadStarCatalog(load: () => Promise<CatalogRow[]>): Promise<void>`

Installs the catalog once per module instance. While an installation is in flight or after it has
succeeded, `load` is **ignored and not called** and the existing promise is returned; passing a
different function while one is in flight logs one `console.warn`. A failure (loading, or validating
rows: shape, finite coordinates, ranges, unique HYG ids, the built-in pattern stars) rejects and
clears the attempt so that a later call retries.

### `starCatalogInstallation(): Promise<void> | null`

The in-flight or completed installation, or `null` before the first attempt and after a failed one.

### `awaitStarCatalog(timeoutMs = 15000): Promise<void>`

Waits for an existing installation. Resolves at once if a catalog is installed with no pending
attempt; rejects with `Error('Star catalog is not loading.')` if there is neither, or
`Error('Star catalog cancelled or timed out.')` after the timeout (which affects only this waiter).
Throws `RangeError` if `timeoutMs` is outside 1–30000.

### `starCatalogLoaded(): boolean`, `STAR_CATALOG`, `CONSTELLATIONS`

Whether a catalog is installed, and live bindings to the installed `CatalogStar[]` and built-in
`Constellation[]` patterns (`big-dipper`, `orion`, `crux`, `summer-triangle`). Both arrays are empty
until installation.

## Astronomy

These functions need `ensureTemporal()` to have resolved and, for stars, an installed catalog.
`location` is a `LocationInfo` (`id`, `name`, `country`, `latitude`, `longitude`, `elevation`,
`timezone`).

- `ensureTemporal(): Promise<void>`: uses the native `Temporal` or loads the bundled polyfill once.
- `calculateSky(location, date, events?): SkyState`: Sun, Moon, planets and stars for an instant.
- `calculateDailyEvents(location, date): SkyEvents`: rise/set and twilight events within the local
  calendar day.
- `nextBodyRise(location, body: BodyId, date): Date | null`: next rise within about a year, or `null`.
- `getPhase(angle): MoonPhaseKey`: phase key for an elongation angle.
- `validateObserver(location): void` and `validateInstant(date): Date`: the checks used above.

Errors: `RangeError` for invalid coordinates or elevation, an unknown time zone, or an instant outside
1900–2100.

## Sky chart data

- `buildSkyChartSnapshot(input: SkyChartSnapshotInput, sky: SkyState, catalog?): SkyChartSnapshot`:
  canvas-free chart data. `input` is `{ time: { kind: 'utc', utc }, location, limitingMagnitude? }`
  with a canonical millisecond ISO `utc`. Throws `TypeError` / `RangeError` for invalid input or
  inconsistent sky data, and `SkyChartCatalogNotReadyError` (an `Error`) without an installed catalog.
- `selectSkyChartObjects(candidates: SkyChartCandidates, options?): SkyChartSelection`: geometric
  above-horizon selection; independent of daylight and weather. Throws on invalid or duplicate
  candidates, an invalid magnitude, or `starCatalogReady: false`.
- `projectSkyChart(altitude, azimuth): SkyChartPoint | null`: azimuthal-equidistant unit-disc
  position (zenith at 0,0, north up, east left), `null` below the horizon. `RangeError` for
  non-finite input or altitude outside ±90.

## Projection and framing

- `createProjection(view, aspect)`: perspective `(altitude, azimuth) => Projected` in normalized
  device coordinates.
- `createCoverProjection(view, aspect, width, height)`: the centered cover crop used by every
  renderer: `{ coverW, coverH, left, top, toCanvas }`.
- `createSkyRay(view, aspect, width, height)`: inverse of the cover projection, canvas pixel to
  scene direction.
- `frameMoment(snapshot, mode: 'auto' | 'current', options?)`: automatic image framing.

## Scenery, seasons and the Milky Way

- `HORIZON_VARIANTS` (`['ridge', 'mountains', 'sea', 'city']`) and
  `horizonAltitude(variant, azimuth)`: silhouette top edge in degrees.
- `landscapeSeason({ instant, location })` and `landscapeLight(altitude, azimuth)`: the season and
  light (`'day' | 'dawn' | 'dusk' | 'night'`) a `LandscapeRequest` asks for.
- `galacticFromEquatorial(raDeg, decDeg)`, `createSceneToGalactic(field)` and `MILKY_WAY_SHAPE`:
  Galactic coordinates and the shared Milky Way shape constants.
- `defaultWeatherValues(): WeatherValues`: the default rendering weather.

## Main types

`MomentSnapshot`, `CameraView`, `LayerSettings`, `IllustrationPattern`, `IllustrationComposition`,
`SkySceneOptions`, `RenderIllustrationOptions`, `LandscapeRequest`, `IllustrationPanelOptions`,
`SkyChartOptions`, `MinimalSkyMapOptions`, `SkyArtworkTheme`, `SkyChartSnapshot`, `MoonPhaseOptions`,
`MoonTexture` (`ImageData | ImageBitmap | HTMLImageElement`), `CatalogRow`, `CatalogStar`, and the
astronomy types in `types.ts` (`LocationInfo`, `SkyState`, `WeatherValues`, …). All are type-only
exports.
