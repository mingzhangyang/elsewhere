# Sky Moments SM3-C — Creator and Explorer Handoff

Status: **implementation proposed in SM3-C PR, awaiting automated verification and SM4 physical device testing**. No editable artwork links, storage account or new #sky= protocol. This document describes the implementation contract, not an SM4 acceptance.

## Entry and deployment

- `#create` is a **navigation marker only**. It carries **no** date, UTC, city, name, title or message.
- `src/main.tsx` imports `RouteShell`, rather than `App`. `RouteShell` loads `SkyArtworkCreator` using React lazy and imports `App` and its developer fixtures only on explorer navigation. No `SkyScene`, Three.js context, weather subscription, or explorer star request is started by a direct visit to `#create`.
- The shell maintains the current-tab creator draft in a React ref, never in the URL, `history.state`, application preferences or a server. It watches `hashchange` and `popstate` for browser navigation. `#sky=` continues to be parsed only by the explorer as before; SM5 alone can introduce a separate public artwork permalink.
- The existing explorer adds a visible **Make my sky / 制作我的星空** action. While exploring a creator event, it instead offers **Back to my star map / 返回我的星图**.
- On entry to the explorer the creator subtree unmounts and invalidates pending work; on return the explorer unmounts and releases its existing renderer/workers/listeners. The return rehydrates the **form**, not a misleading already-valid PNG.

## Drafts and civil time

`MemorialTimeForm` keeps its existing `initialDraft`, `onResolved`, and `onInvalidated` API. The small additional `initialInput` and `onDraftChange` contract preserves incomplete local date, clock time, selected city, exact/reference intent, reference provenance, and any UTC DST candidate. The existing `restoreMemorialDraft` rechecks candidate validity against current IANA rules on re-entry. Invalidated DST choices are cleared. Changing the event city keeps the civil clock and clears the old UTC candidate.

All resolution is still through `resolveMemorialTime`, never through `new Date(localClock)`. A reference clock defaults to 22:00 and is labelled as a scientific assumption rather than a known birth/event time. `SkyCreatorDraft` additionally holds the optional title, optional note, and one of `midnight` / `paper`. Grapheme segmentation clips text to 40 and 80 visible characters; both are passed as literal strings to the SM3-A `createSkyArtwork` sanitizer. No markup execution, personal name request, or permanent storage is introduced.

## Snapshot, versioning, preview and PNG

`SkyArtworkCreator` uses a monotonically increasing UI revision. Changing time invalidates the `createSkyChartSnapshotCoordinator()`, the existing export coordinator and any ready output. Changing title, phrase, language or palette invalidates export only; the valid **frozen SM2-C snapshot** stays available, so new edits never recompute astronomy or reselect stars. Old requests are ignored after edits or unmount, with the export coordinator canceling native PNG completion. Error and retry UI keep the draft.

The image is drawn into a single 1200×1500 2D canvas with `createSkyArtwork`, `prepareSkyChartFonts`, `canvasSkyChartTextMetrics`, `layoutSkyChartArtwork` and `drawSkyChartArtwork`. CSS only scales the 4:5 preview. It preserves the SM3-A midnight starlight letter and soft-rose paper gradients, stars and luminous rings, English serif / Chinese Songti title, English Caveat / Chinese native Long Cang–KaiTi handwritten note and detailed scientific caption. Caveat Latin is loaded lazily; CJK fonts are local browser fallbacks. Font failures use the existing font-preparation fallback and fresh layout; the same resolved font resource object is passed to both preview and PNG export.

A ready preview alone is **not** a downloadable work. The existing `createSkyArtworkExportCoordinator` must finish PNG encoding and validate bytes and dimensions before enabling save or explore. A File is constructed in advance where supported. `downloadSkyArtwork` handles browser downloads/open-image fallbacks and owns its delayed URL release, independent of the PNG ownership. UI never claims the image was actually saved into Photos. `shareSkyArtwork` is invoked directly inside the later user click, after the File is ready, never after awaiting encoding; cancellation is neutral, unsupported file-sharing hides the share button and leaves PNG save usable.

## Explore and return

Clicking **Explore this sky / 进入这一刻的天空** passes only the resolved `event.location` and exact `event.utc` in memory to the dynamically loaded existing `App` via `initialLocation` and `initialTime`. The existing `useSimulation` initializes paused and non-following. It follows its real daylight, weather and horizon rules, with the existing camera default. Nothing from the artwork's illustrative daytime/weather bypass gets applied to the explorer.

The reverse action returns to `#create`, re-renders the form with the last in-tab input, title, phrase and palette. Since the prior PNG is disposed, the user must recheck the time to generate a fresh, safe output. A browser reload, separate tab or external `#sky=` link intentionally does **not** recover the unsaved in-memory draft.

## Validation and evidence

New tests:
- `tests/skyCreatorDraft.test.ts`: URL navigation and grapheme boundaries.
- `tests/skyArtworkCreator.test.tsx`: mock-controlled readiness, revision invalidation, retry, reusing scientific snapshots and unmount disposal. They are **unit tests**, not HYG or native browser proof.
- `tests/browser/sky-artwork-creator.spec.ts`: real direct-load isolation and network/WebGL telemetry, real selected-city time, true HYG snapshot, preview drawing, download gesture, return from explorer, a reference-time Chinese flow, and a nonexistent DST clock error. The spec requests screenshot attachments for the form, two palettes, download, explorer, returned draft and error.
- Existing SM1, SM2, SM3-A, SM3-B, astronomic science, postcards, offline and #sky= regression tests must continue passing. Browser coverage spans Chromium, Firefox, WebKit, Android Chrome simulation and iPhone WebKit simulation.

Before claiming completion, inspect **actual** CI and screenshot artifacts, typecheck, format, lint, `npm run validate`, `scripts/check-build.mjs` and runtime network traces. **Do not mark a test as passing merely because code for it was written.**

## Boundaries / follow-up

- No SM4 physical iPhone/Android test or study is claimed. Confirm OS image-save and file-share handoffs, mobile font fallback, low-memory export fallback, safe areas, keyboard/focus and screen-reader flow on real devices during SM4.
- No SM5 serialized artwork or cross-device draft link.
- Star chart ignores daylight, weather and naked-eye observability **by design**; explorer remains physically rendered.
- **S06 projected illuminated lunar limb orientation is still open**, as is the broader independent S07 historical validation. No science formula, planet/star selection, moon shading, star catalog or postcard implementation is changed.
