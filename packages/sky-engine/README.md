# Sky Engine — scene and illustration API (milestone 2)

This directory is the single source of truth for the shared sky calculations and Canvas 2D illustration
pipeline. Elsewhere's existing `src/domain`, `src/moment`, `src/lib` and ridge entry points re-export
the relocated modules where needed. No copied implementations or second catalog state are introduced.

## Boundaries

- `src/index.ts`: host-neutral source entry point; not a published npm API yet.
- `src/types.ts` and `src/contracts.ts`: astronomy, weather values, camera, layers and moment contracts.
- `src/domain/`: observer and time validation, ephemerides, star catalog/encoding, Galactic coordinates,
  visibility and clear-weather defaults.
- `src/moment/`: projection, framing (including the #45 automatic framing policy), illustration,
  Galactic pigment, cloud and landscape painting, ridge and paper finish.
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

Import from `src/index.ts` until M3 packages the same entry point. A plain browser consumer supplies
its observer and data; there is no geolocation prompt, live weather request, or site dependency.

```ts
import { createSkyScene, decodeStarColumns, renderIllustration } from './src/index';

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
  The input date, view, weather and layers are copied. A catalog loader is needed only before
  the first installation; concurrent calls share the same catalog and failed SDK loads can retry.
- `renderIllustration` owns the **whole** canvas (dimensions set by the caller, 1–4096 px each,
  aspect 0.1–10). It resets the drawing state after resources are ready and returns the actual
  composed snapshot. It does not generate app-specific text, compass, link, or a download.
- `composition: 'current'` preserves the supplied camera and source aspect with a centered cover
  crop; `'auto'` uses the real output aspect for smart framing and respects explicit object focus.
  Use `{ pattern: 'signature' }` and `patterns: [{ id: 'signature', lines: [[idA, idB]] }]` for a
  host-selected pattern. IDs are actual HYG IDs such as `hyg-32263`; no fabricated coordinates.
  The engine uses above-horizon edges and tries progressively wider views. If no usable pattern
  can be framed, it preserves the input view. Set `layers.lines: true` to draw those edges.
  An empty patterns list suppresses the built-in patterns; an omitted list keeps them.
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

## Remaining milestones (separate, non-stacked changes)

1. **M1 (completed):** relocate implementation and contracts without changing rendering behavior;
   keep legacy imports and existing tests working. Check module boundary and single-instance exports.
2. **M2 (this change):** design and test a host-neutral scene/render facade, consistent crop/projection mapping,
   explicit composition and pattern overrides, asset injection, and bounded browser resource loading.
   Preserve current and automatic framing; allow the now-and-more signature asterism policy.
3. **M3:** publish a versioned build from the same sources: ESM (including a browser-consumable build),
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
