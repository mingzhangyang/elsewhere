# Sky Moments SM3-A — artwork model and Canvas 2D painter

Status: **SM3-A vector artwork + SM3-B PNG export and browser delivery adapters**. No creator route, artwork-link protocol, OS album-save confirmation or changes to existing postcards. All export and handwriting resources are loaded on demand; explorer startup does not import them.

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

SM3-B may use this sequence directly after validating a coordinator-ready status: createSkyArtwork → await prepareSkyChartFonts() → create Canvas 2D context → layoutSkyChartArtwork(artwork, canvasSkyChartTextMetrics(ctx), fonts) → set a 4:5 canvas size → drawSkyChartArtwork(ctx, layout, fonts). SM3-B owns PNG encoding and object URLs separately from this painter. Changing Canvas size clears context state but retains the context reference.

Fonts are opt-in: no module-initialization font, HYG or network request. The resource preparation waits for document.fonts.ready and checks system-ui; on failure it explicitly picks generic sans-serif. SM3-B additionally prepares a lazily imported Latin Caveat hand-lettered phrase (borrowed from InkScribe) where available; English titles remain serif, Chinese titles remain Songti-style and Chinese phrases use native KaiTi/Long Cang-like calligraphic font stacks. No CJK font files are bundled because that would defeat the offline/launch budget. If handwriting fails, the entire export is measured and painted with the same fallback font resource; the painter never swaps fonts after layout. If the resource choice changes, **remeasure and relayout** before painting. Drawing requires exactly the same prepared font-resource object as layout. A font resource can be injected for deterministic tests; cross-browser font metric identity is not guaranteed.

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

## SM3-B: PNG export, typography, ownership and browser delivery

**Scope and entry:** `src/lib/skyArtworkExport.ts` and `src/lib/skyArtworkDelivery.ts` are consumed only by an explicit dynamic import from a future SM3-C creator. Neither is imported in `src/main.tsx`. There is no screenshot-to-image conversion, camera read, second sky projector, weather read, current date, time-zone inference or mutation of `SkyArtwork`. The existing `MomentImage` postcard path remains untouched.

### Image and errors

```ts
import { exportSkyChartPng, createSkyArtworkExportCoordinator } from '../lib/skyArtworkExport';
import { downloadSkyArtwork, shareSkyArtwork, skyArtworkShareCapability } from '../lib/skyArtworkDelivery';

const coordinator = createSkyArtworkExportCoordinator();
const prepared = await coordinator.export(artwork); // validated SM3-A model
// In a subsequent *direct* click handler, use prepared.file and:
// skyArtworkShareCapability(prepared) === 'files' ? shareSkyArtwork(prepared) : downloadSkyArtwork(prepared);
// When replaced, dismissed or unmounted:
coordinator.dispose();
```

- `exportSkyChartPng({ artwork, signal?, requestId?, createCanvas?, encodePng?, prepareFonts? })` validates the frozen SM2-C coordinates and saved SM1 civil-time metadata. A request identifier ties results to their caller's artwork revision. Invalid or contradictory inputs are terminal failures.
- Creates a new Canvas **1200 × 1500**, using the SAME SM3-A `layoutSkyChartArtwork` and `drawSkyChartArtwork` functions. Layout is measured from the actual Canvas context with exactly the prepared font resources used for drawing. Drawing produces a complete opaque vector background; pixel probes reject transparent or flat/missing output.
- Calls `canvas.toBlob(..., 'image/png')` or an explicitly injected encoder. Rejects thrown errors, null/empty/mismatched Blob, malformed signature, wrong IHDR dimensions, and missing IEND. Native browser tests additionally decode and inspect the PNG and compare sampled colors to a separately repainted same-resource preview. A successful browser download click is **not** proof of a completed phone photo save.
- **Bounded fallback:** if primary Canvas allocation/context creation or encoder capacity fails, release its backing store and repaint once at **960 × 1200** using the identical vector layout path. No raster upscale, retry loop, layout overflow fallback, or fallback on corrupt scientific inputs. Both dimensions and the effective resolution are returned. Maximum edge **1500 px** and maximum pixels **1,800,000**.
- `SkyArtworkExportError.code` identifies `invalid-artwork`, `resources-unavailable`, `layout-failed`, `canvas-unavailable`, `png-encoding-failed`, `aborted`, `file-unsupported`, `download-unavailable`, `download-failed`, `share-unavailable`, or `share-rejected` (plus a human-readable message and `retryable`). Host UI must key on these codes, not browser message strings.

### Event date and font policy

The default filename is `elsewhere-sky-YYYY-MM-DD.png` using **only** the artwork's saved `civilTime.localDate`; its UTF-8 text metadata uses the saved `localTime`, `offset`, exact/reference intent and attribution. A UTC crossing such as New York 2026-06-21 at 21:15 (UTC 2026-06-22 at 01:15) still exports `elsewhere-sky-2026-06-21.png`. Never derive it from `Date.now()`, the device timezone, the name or a prose phrase. A reference instant is always explicitly described as a calculation reference.

InkScribe-inspired **typographic hierarchy**: editorial Georgia/Times serif remains the English title and Songti-style remains the Chinese title; the _personal caption_ uses lazy **Caveat 400 Latin** or native handwritten fallbacks for English, and a **Long Cang/KaiTi** local stack for Chinese. This keeps celebratory character without replacing complete credits or dense notes with illegible handwriting. The `@fontsource/caveat` package has OFL 1.1 licensing, is imported inside `prepareSkyChartFonts()` only when generating a keepsake and provides no extra app entry CSS. CJK webfont subsetting is deferred: shipping hundreds of extra shards in an offline-precache build would regress size and first-install behavior. Browser-specific font rendering is not claimed pixel-identical; same-resource metric and layout plus overflow rejection protect consistency. If loading fails, measure and redraw with the returned fallback; never substitute a different face after layout.

### Blob, File, temporary Canvas and Object URL lifecycle

- Each attempt clears its Canvas backing store by setting width and height to zero in `finally`, even on abort, encoder failure or bounded retry. No global Canvas or cached Blob is allocated at import time.
- `SkyArtworkPng` owns its Blob and lazily created `File`; `.release()`/ `releaseSkyArtworkExport(output)` invalidates Blob/File access and revokes **all** outstanding `.objectUrl()` leases. Each lease may be explicitly released exactly once; URLs are never silently retained by the export layer.
- `downloadSkyArtwork(output)` creates its own URL lease and temporary anchor, uses the already-encoded Blob, removes the anchor, and delays URL revocation for a bounded 60-second navigation handoff. The returned `.release()` can revoke earlier when safe. Immediate revoke after `.click()` is not reliable on iOS Safari. The download lease is **independent** of output preview URLs and survives artwork replacement until the bounded handoff interval or explicit release.
- `createSkyArtworkExportCoordinator().export(artwork)` cancels the prior request, retires its output and stamps a monotonically increasing requestId. A new artwork invalidates the previous one. `.cancel()` and `.dispose()` cause in-flight work to stop accepting results immediately. Native `toBlob` cannot necessarily be cancelled; any later output is discarded. Retired results cannot create fresh File or object URLs.

### iOS Safari, Android and desktop Web Share

`skyArtworkShareCapability` distinguishes `files`, `text-only`, `unavailable` and `file-unsupported`. Only a real file-capable browser is allowed to call `shareSkyArtwork(output)`. It calls `navigator.share({files:[output.file]})` **synchronously in a user-gesture handler** after the file has already been prepared; it must never await PNG generation before invoking sharing. Resolution reports `shared` (browser handoff only), while `AbortError` reports `cancelled` and other rejections are typed failures. No `#sky=` link is used as a memorial artwork link.

For download, `downloadSkyArtwork` checks whether the anchor supports `download` and otherwise attempts to open the PNG for manual saving. The result is `download-requested` or `image-opened`, not `saved-to-photos`. In browsers without file sharing, the creator can still offer PNG download. If both file download and opening are blocked, it returns `download-unavailable`/`download-failed`.

### Verification and SM3-C integration

- `tests/skyArtworkExport.test.ts`: isolated Canvas/encoder/share adapters cover full-size output, theme text, local filenames, invalid input, transparent Canvas, null/throw/wrong PNG, lower-res bounded retry, resources, racing requests, cancellation, object URL leases, download handoff and file-sharing cancellation.
- `tests/browser/sky-artwork-export.spec.ts`: actual browser PNG encoding/decoding of fictional English midnight and Chinese paper event images, preview comparison, actual HYG snapshot output, PNG download and cancelled share. PNG screenshots are CI artifacts; browser/font antialiasing differences use sample tolerances rather than global strict pixel equality.
- Existing SM1/SM2/SM3-A regressions, postcards, production size and offline validation remain part of `npm run validate`; Playwright includes Chromium, Firefox, WebKit and emulated Pixel. Actual phone Safari, Android browsers, OS Photos/Files save receipts and third-party share targets remain **SM4**, not claimed as tested.
- The **S06 lunar projected illuminated-limb orientation** and S07 broader independent science checks remain open. SM3-B does not alter astronomical formulas or claim a physically rendered night sky.
