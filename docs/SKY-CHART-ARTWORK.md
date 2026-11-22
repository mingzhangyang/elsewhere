# Sky Moments SM3-A — artwork model and Canvas 2D painter

Status: **SM3-A rendering and layout only**. No creator route, artwork-link protocol, PNG export, file download, OS share or changes to existing postcards. This module is not imported by explorer startup.

This document supplements SKY-CHART-SNAPSHOT.md, SKY-MOMENT-TIME-FIXTURES.md, SCIENCE.md and SKY-MOMENTS-PLAN.md.

## Source and validation boundaries

The **only** celestial geometry input is an SM2-C SkyChartSnapshot (schema 1), obtained from createSkyChartSnapshotCoordinator.generate with status **ready**. Do not use loading/error/stale statuses as artwork. SM2-C already validates the star catalog and astronomical calculation; the artist guards source metadata, loaded catalog count, object identity/structure, finite above-horizon altitudes, and normalized coordinates. A genuinely empty selection is valid when the source catalog was complete. The renderer never invokes astronomical calculation, selection, projection, catalog loading, or weather.

SM2-C does not retain the original local civil date/clock. The exported createSkyArtwork({ snapshot, event, locale, theme, title?, phrase? }) requires the **original resolved SM1 MemorialTime**. It calls assertMemorialTimeConsistency, rejects mismatched UTC, clock intent, disambiguation, offset, reference-time source or observer, and never re-resolves DST. Raw UTC snapshots must be paired with a separately resolved SM1 record. A current browser timezone is never used.

The validated SkyArtwork (version 1) includes snapshot, chosen language (en or zh-Hans), palette (midnight or paper), plain text content, explicit time-intent words, scientific note, conditional daytime warning and mandatory source credits.

## Public API

| File                   | API                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| src/lib/skyArtwork.ts  | createSkyArtwork, skyArtworkGraphemeCount, assertDrawableSkyChartSnapshot; SkyArtworkInput, SkyArtwork, SkyArtworkTheme                                 |
| src/moment/skyChart.ts | prepareSkyChartFonts(fontSet?), canvasSkyChartTextMetrics(ctx), layoutSkyChartArtwork(artwork, metrics, fonts), drawSkyChartArtwork(ctx, layout, fonts) |
| src/moment/skyChart.ts | SKY_CHART_ARTWORK_SIZE, SKY_CHART_PALETTES, SkyChartLayoutError and layout/font/metric interfaces                                                       |

SM3-B may use this sequence directly after validating a coordinator-ready status: createSkyArtwork → await prepareSkyChartFonts() → create Canvas 2D context → layoutSkyChartArtwork(artwork, canvasSkyChartTextMetrics(ctx), fonts) → set a 4:5 canvas size → drawSkyChartArtwork(ctx, layout, fonts). This does **not** encode a PNG or manage object URLs. Changing Canvas size clears context state but retains the context reference.

Fonts are opt-in: no module-initialization font, HYG or network request. The resource preparation waits for document.fonts.ready and checks system-ui; on failure it explicitly picks generic sans-serif. If the resource choice changes, **remeasure and relayout** before painting. Drawing requires exactly the same prepared font-resource object as layout. A font resource can be injected for deterministic tests; cross-browser font metric identity is not guaranteed.

## Layout and representation

- Fixed design box **1200 × 1500**, exactly **4:5**, with one design-pixel coordinate system.
- Circular hemisphere center **(600,498)** and radius **418**. Zenith at its center; horizon at its circumference. North up, east left, south down, west right in both hemispheres. Separate compass indicators.
- Object anchor mapping is **(600 + 418x, 498 + 418y)** with unrounded SM2-C normalized x/y. No second projection, mirror, selection, fictitious stars or adjustment for overlap. The disc clips symbol graphics but not the real object centers.
- Text slots: title y=985; location y=1090; local date/clock/offset y=1164; immutable exact/reference explanation y=1207; optional phrase y=1246; permanent science y=1332; conditional daylight y=1385; HYG credits y=1433; Astronomy Engine credits y=1463. All have fixed widths and line limits. The chart and compass end before the title.
- Theme colors live in SKY_CHART_PALETTES: midnight uses deep navy with legible pale text and objects; paper uses warm light background with contrasting dark objects/labels. Both use **identical geometry and text constraints**. Star magnitude maps monotonically to a clamped radius, with restrained B−V-inspired tints. Sun, Moon and planets have distinct graphic symbols. Default constellation connectors are absent.
- drawSkyChartArtwork paints vector Canvas 2D at any **positive integer 4:5 output size** by transforming design coordinates, not by scaling a raster. SM3-B can choose 1200 × 1500 or another suitable size, without duplicating layout code.

## Text and scientific attribution

- Titles are capped at **40 Unicode grapheme clusters**, phrases at **80**. Intl.Segmenter handles Chinese, combining characters and emoji ZWJ sequences. NFC normalization and whitespace collapse are applied. Control characters/bidi overrides are rejected.
- User content is passed **only** to Canvas fillText, never HTML. Empty titles select neutral locale-specific defaults (reference titles never claim an observed instant); empty phrases are omitted.
- Text is measured using the actual chosen font and metric adapter. Word boundaries or grapheme boundaries wrap text; if any region cannot safely fit its assigned maximum lines, layout raises SkyChartLayoutError **before painting**. No ellipsis, clipping, silent omission or unbounded font reduction.
- The artwork permanently explains that plotted positions are **calculated**, without modeling daylight obscuration, actual weather, or naked-eye visibility. If the Sun is above the horizon, a further visible daytime warning is included. Reference works always declare the clock is a calculation reference, **not a known exact event time**. The saved local calendar, clock and offset are shown as provided by validated SM1, retaining the canonical UTC separately.
- Existing public/credits.html is the source for HYG attribution: **HYG v4.1 derivative**, **David Nash / Astronexus**, **CC BY-SA 4.0**. Calculated bodies: **Astronomy Engine (MIT)**; standard refraction and azimuthal equidistant projection. No invented scientific release number or catalog hash (snapshot catalogHash remains null). The illustration is not research-grade astronomy or a representation of what a person could see.

## Verification and remaining risks

- tests/skyArtwork.test.ts covers time intent/UTC/date/offset/DST and location matching, Unicode limits and HTML text literalism, immutable models, credits and daylight, incomplete resource rejection.
- tests/skyChartDrawing.test.ts covers fixed size and separation, hemisphere and E/W/N/S, zenith and horizon, exact snapshot anchors, immutable input, stable layout, both themes, font fallback, overflow, Canvas command record and **real HYG / existing astronomy-engine** integration.
- tests/browser/sky-artwork.spec.ts generates screenshot attachments for **two palettes × two languages** plus a chart painted from actual SM2-C ready resource status. All test events are fictional. Screenshots are build artifacts only, not product features. Actual pass counts and build budgets must be retrieved from GitHub CI or validated locally, not inferred from source.

**S06 lunar projected bright-limb orientation remains incomplete**: the current marker is intentionally orientation-neutral. It does not use the existing explorer brightLimbAngle, show a potentially misoriented crescent, or claim projected limb rotation. S06 needs separate four-quadrant/near-zenith/near-horizon checks before closure. **S07 wider independent historic verification** also remains pending. Existing explorer science formulas and Moon shading are unchanged. SM3-B should only add image encoding, resource lifecycle, cancellation and mobile save/share around the reused painter; SM3-C should supply UI without a second renderer.
