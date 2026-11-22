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

- Fixed design box **1200 × 1500**, exactly **4:5**, with one design-pixel coordinate system. The keepsake treatment uses two warm editorial palettes: **midnight** (ink navy, muted plum ambient wash, champagne-gold engraving) and **paper** (warm ivory, blush watercolor-style wash, dusty rose/brass-toned engraving). These are deterministic gradients, NOT reconstructed nebulae, cloud maps or physically measured sky brightness.
- Circular hemisphere center **(600,498)** and radius **418**. Zenith at its center; horizon at its circumference. North up, east left, south down, west right in both hemispheres. Separate compass indicators.
- Object anchor mapping is **(600 + 418x, 498 + 418y)** with unrounded SM2-C normalized x/y. No second projection, mirror, selection, fictitious stars or adjustment for overlap. The disc clips symbol graphics but not the real object centers.
- Text slots: title y=972; location y=1093; local date/clock/offset y=1164; immutable exact/reference explanation y=1206; optional phrase y=1248; permanent science y=1331; conditional daylight y=1381; HYG credits y=1428; Astronomy Engine credits y=1453. All have fixed widths and line limits. The chart and compass end before the title.
- Theme colors live in SKY_CHART_PALETTES: midnight uses deep navy with legible pale text and objects; paper uses warm light background with contrasting dark objects/labels. Both use **identical geometry and text constraints**. Star magnitude maps monotonically to a clamped radius, with restrained B−V-inspired tints. Sun, Moon and planets have distinct graphic symbols. Default constellation connectors are absent.
- drawSkyChartArtwork paints vector Canvas 2D at any **positive integer 4:5 output size** by transforming design coordinates, not by scaling a raster. SM3-B can choose 1200 × 1500 or another suitable size, without duplicating layout code.

## Text and scientific attribution

- Titles are capped at **40 Unicode grapheme clusters**, phrases at **80**. Intl.Segmenter handles Chinese, combining characters and emoji ZWJ sequences. NFC normalization and whitespace collapse are applied. Control characters/bidi overrides are rejected.
- User content is passed **only** to Canvas fillText, never HTML. Empty titles select neutral locale-specific defaults (reference titles never claim an observed instant); empty phrases are omitted.
- Text is measured using the actual chosen font and metric adapter. Word boundaries or grapheme boundaries wrap text; if any region cannot safely fit its assigned maximum lines, layout raises SkyChartLayoutError **before painting**. No ellipsis, clipping, silent omission or unbounded font reduction.
- The artwork permanently explains that plotted positions are **calculated**, without modeling daylight obscuration, actual weather, or naked-eye visibility. If the Sun is above the horizon, a further visible daytime warning is included. Reference works always declare the clock is a calculation reference, **not a known exact event time**. The saved local calendar, clock and offset are shown as provided by validated SM1, retaining the canonical UTC separately.
- Existing public/credits.html is the source for HYG attribution: **HYG v4.1 derivative**, **David Nash / Astronexus**, **CC BY-SA 4.0**. Calculated bodies: **Astronomy Engine (MIT)**; standard refraction and azimuthal equidistant projection. No invented scientific release number or catalog hash (snapshot catalogHash remains null). The illustration is not research-grade astronomy or a representation of what a person could see.

## Romantic keepsake visual treatment (SM3-A refinement)

Market references reviewed: The Night Sky's [personalized star-map prints](https://www.thenightsky.com/shop/star-map-print), [custom foil maps](https://printvolution.sg/product/framed-pictures/star-map-photo-frame/), and [watercolor-map examples](https://www.etsy.com/listing/864026307/personalized-star-map-gift-night-sky). We borrow hierarchy and atmosphere, **not** their copyrighted star-map artwork or potentially ungrounded Milky Way textures.

The chart retains SM2-C's exact x/y and circle, with no projection changes, new stars, simulated galaxy or added constellation links. The former prominent concentric range rings are omitted for a less technical, more gift-like composition. A subtle gradient and lavender/rose editorial wash is painted behind the mapped points. A fine, compass-aligned engraved rim (72 evenly spaced marks, the four cardinal ticks omitted for the visible N/E/S/W labels), two fine border rules, and a small typographic heading create a restrained framed-paper appearance. All of these strokes are **decorative UI furniture**, not celestial objects.

Actual stars alone receive restrained magnitude-derived radii; those with magnitude less than 2.5 receive a soft glow centered at their real computed coordinates. The brightest (magnitude below 0.5) receive a small four-point glint at their **same unchanged center**; it does not represent an additional catalog star. Objects and their true centers remain clipped to the circle. The Moon remains an orientation-neutral marker; S06 does not pass.

For emotional hierarchy, headlines become calm 52px serif text (Georgia/Times/serif for English, Songti/Noto Serif CJK/SimSun/serif for Chinese), with a smaller italic-capable serif phrase, restrained metadata, and framed scientific attribution. The default title says **“The sky remembers”** (reference: **“The sky remembers this day”**) or **“星光记得这一刻”** (reference: **“星光记得这一天”**). An immutable reference-time explanation still makes clear that the exact event clock was not known. Fixed, validated line budgets preserve complete credits and warnings: title 972–1088, location 1093–1157, date 1164–1196, time note 1206–1232, phrase 1248–1312, science 1331–1375, optional daytime warning 1381–1423, HYG credit 1428–1448 and astronomy credit 1453–1473. None overlap the circular chart or compass.

The two themes retain identical celestial positions and design-space placements. Their differences are **only** paint colors, wash gradients and accents. Preview and SM3-B export continue to use the same 4:5 vector drawing interface, without pre-rendered raster assets or new runtime dependencies.

## Verification and remaining risks

- tests/skyArtwork.test.ts covers time intent/UTC/date/offset/DST and location matching, Unicode limits and HTML text literalism, immutable models, credits and daylight, incomplete resource rejection.
- tests/skyChartDrawing.test.ts covers fixed size and separation, hemisphere and E/W/N/S, zenith and horizon, exact snapshot anchors, immutable input, stable layout, both themes, font fallback, overflow, Canvas command record and **real HYG / existing astronomy-engine** integration.
- tests/browser/sky-artwork.spec.ts generates screenshot attachments for **two palettes × two languages** plus a chart painted from actual SM2-C ready resource status. All test events are fictional. Screenshots are build artifacts only, not product features. Actual pass counts and build budgets must be retrieved from GitHub CI or validated locally, not inferred from source.

**S06 lunar projected bright-limb orientation remains incomplete**: the current marker is intentionally orientation-neutral. It does not use the existing explorer brightLimbAngle, show a potentially misoriented crescent, or claim projected limb rotation. S06 needs separate four-quadrant/near-zenith/near-horizon checks before closure. **S07 wider independent historic verification** also remains pending. Existing explorer science formulas and Moon shading are unchanged. SM3-B should only add image encoding, resource lifecycle, cancellation and mobile save/share around the reused painter; SM3-C should supply UI without a second renderer.
