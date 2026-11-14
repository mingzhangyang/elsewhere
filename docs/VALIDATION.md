# Validation and supported behavior

Use Node 22.13 or later in the 22.x line, or Node 24+. Run `npm ci` and `npm run validate`. The workflow checks TypeScript, ESLint, domain/component tests, the production build, bundle budgets, and generated service-worker behavior. Run `npm run format:check` for formatting and `npm run test:watch` during development. All automated tests use fixtures or mocked requests; live API probes are separate.

## Baseline

The original source and roadmap are preserved in local commit `dfe27f5`; phase 0 is commit `1b95b88`. Phase 1 converts both known failures to ordinary regression tests and extends coverage to missing data, provenance, request cancellation, forecast boundaries, DST folds, half-hour transitions, and civil-day events.

Run `node scripts/weather-smoke.mjs` separately to exercise live current, recent, historical, and final-horizon requests. All four succeeded on November 13, 2026; historical visibility correctly remained unavailable. The final forecast day is clipped to the provider's UTC horizon, and hours beyond that coverage remain unavailable.

The development server supports `?scenario=day`, `?scenario=night`, `?scenario=rain`, and `?scenario=unavailable`. These inject a fixed instant and synthetic, explicitly developer-owned weather. They do not access the weather network and are excluded from production. Precipitation is seeded for repeatability. Use a fixed viewport and pause atmospheric motion when comparing individual image pixels.

Baseline production JavaScript: 741.22 kB / 209.95 kB gzip. Baseline assessment screenshots were inspected at 1280 × 720 and 390 × 844. Automated test timings are not device-performance evidence. Measurements on a physical midrange phone, integrated-GPU laptop, iOS Safari, and assistive technology remain part of release qualification.

The `minimatch` override selects the patched 11.x API used by the lint dependencies. Remove it when both upstream dependency paths require a patched version themselves. Audit the lockfile after dependency updates. The phase 0 install reports zero known vulnerabilities.

## Supported numerical contract

- Product scope: educational sky exploration, 1900 through 2100 inclusive. Reject instants outside the interval rather than implying accuracy for arbitrary years.
- Observer coordinates: WGS84 latitude in degrees north, longitude in degrees east, elevation in meters above sea level. Device geolocation explicitly assumes sea level because browser altitude is ellipsoidal, not mean-sea-level elevation.
- Horizontal coordinates: altitude above the mathematical horizon; azimuth clockwise from north. The generic drawn ridge is not measured local terrain.
- Sun, Moon, and star displayed altitudes use Astronomy Engine's normal refraction, so near-horizon objects share one convention. Stellar coordinates also apply proper motion and precession. Sun/Moon `geometricAltitude` remains airless for reference comparisons.
- Rise/set follows Astronomy Engine's limb and atmospheric conventions at the specified elevation. A civil day runs from local midnight to the next local midnight, not a fixed number of elapsed hours.
- Missing daily events are meaningful domain states. They must remain distinct from calculation failure. Weather data never changes calculated celestial coordinates.
- Independent samples meet 0.02-degree Sun/Moon coordinate-component limits and 2-minute ordinary-event limits. See [SCIENCE.md](SCIENCE.md) for actual errors, dates, reference conventions, and limits of the sample coverage. Near-horizon, polar, and extreme-elevation differences still require review.

## Repeatable browser checks

1. Open each development scenario on desktop and mobile. Confirm a canvas and a useful textual summary, no uncaught errors, and correct location/date/source state.
2. Change location, scrub time, start/pause playback, return to now, and reset the camera. Verify local time changes while an unchanged instant is preserved across locations.
3. Open weather, switch to custom conditions, change precipitation, and return to sourced weather. Missing values must be shown as unavailable.
4. Test search and all core controls with a keyboard. Check narrow portrait, short landscape, and zoomed views for blocked controls.
5. Exercise delayed, failed, partial, and stale provider data; change location while a request is pending. Check that no old source appears under the new observer.
6. Check a spring DST gap, both instances of a fall repeated hour, a half-hour transition, a quarter-hour zone, polar day/night, and local midnight.

Store actual hardware, browser version, viewport, scenarios, results, and unresolved limitations alongside release evidence. Do not mark physical-device or independent scientific review complete from emulation or same-library comparisons.

### Phase 3 implementation check (November 13)

The single inspector and separate timeline were checked in the in-app Chromium browser at desktop size and 390 × 844. Keyboard ArrowUp/Enter selection reached the last preset, restored focus to the picker, and preserved the instant across New York and McMurdo. The mobile weather inspector scrolls independently with its close control and timeline visible. Native dialog focus trapping and broader device qualification remain in the release checklist. The deterministic suite now contains 45 passing checks, including share-link validation and preference recovery. The UI distinguishes paused, accelerated playback, and following real time. No new runtime errors appeared after a clean navigation (earlier HMR hook-order diagnostics were from changing hook structure during development).

### Phase 4 implementation check (November 13)

The catalog now contains 5,070 HYG v4.1 stars with stable IDs, color index, and proper motion. A single foreground cloud pass attenuates every celestial layer per pixel. Moon orientation uses the IAU body frame; the NASA surface map is locally bundled. Labels use screen-space sizing and collision suppression. Rain/snow recycle in all axes and share meteorological downwind conventions with the clouds. Settings offer dark/suburban/city brightness and an unobstructed or illustrative ridge horizon. Asset provenance and the NASA download-mirror limitation are in `docs/ASSETS.md`.

49 automated checks passed, including catalog integrity, lunar near-side orientation in both hemispheres, and a simulated 30-minute precipitation run. In-app Chromium checks confirmed the expanded night sky, centered near-full Moon, and complete occlusion of stars/labels under 100% overcast. This is not a physical-device or independent ephemeris qualification. Additional reproducible scenarios: `sunset`, `moon`, `south`, `polar`, `overcast`, and `snow`.

### Phase 5 implementation check (November 13)

Static scenes now render on invalidation, animation suspends while the document is hidden, and reduced motion stops atmosphere animation. Automatic quality adjusts pixel ratio using bounded frame samples. Renderer disposal also covers partially failed initialization. A simulated WebGL loss was exercised in Chromium: retry restored the selected time and 3° camera heading. A browser-only scheduling bug found during that check was corrected at its source (native animation-frame functions must keep their Window receiver).

Weather requests now have reusable leases, cancellation, in-memory deduplication, bounded coverage caching, and explicitly labeled stale-cache recovery. No exact device coordinates are persisted by that cache. Production builds include a versioned service worker that caches only local shell/assets; API requests and shared URLs are not stored. Generated-worker behavior is checked in phase 6; an actual browser offline lifecycle and physical-device behavior remain separate gates.

Measurements: Node 24.22.1, 100 warm position updates with 5,070 stars and reused daily events: median 3.54 ms, p95 4.74 ms. In-app Chromium, 1280 × 720, DPR 1, rain scenario: observed p95 frame interval 17.0 ms and p95 CPU render submission 0.4 ms over a short run. These are local observations, not GPU-time measurements or the named phone/laptop acceptance matrix. No worker was introduced. 52 automated checks pass. The 30-minute real renderer soak remains open; the precipitation soak alone does not qualify GPU/resource stability.

### Phase 6 local qualification (November 13)

The suite now has 93 passing tests across 12 files. Domain projects run without a DOM; interface tests use jsdom. Independent JPL/USNO fixtures cover northern/southern/polar positions and ordinary events. Regression work corrected observer-relative lunar illumination, matched geometric lunar-distance conventions, and handled valid UTC boundary instants whose local civil day crosses outside the supported year range. Numerical results and remaining scientific limits are in [SCIENCE.md](SCIENCE.md).

axe-core checks the shell, location dialog, weather/custom controls, layers, objects, and sharing. The jsdom suite excludes contrast because it has no layout engine. Additional in-app Chromium audits include contrast for the shell, weather, settings, and objects; no automated violations were reported. Keyboard location selection/focus return, graphic recovery, and responsive panel reachability were exercised in that browser. Manual screen-reader and physical-touch validation are still required.

Production preview was checked at 1280 × 720 and 390 × 844, with development layout checks also at 320 × 568 and 844 × 390. The narrow view had no horizontal overflow; inspector close, Now, and the timeline remained reachable. Share restoration recovered the chosen instant, camera, layers, and custom weather. Keyboard selection of McMurdo preserved the instant, changed local time from 23:00 to 17:00, and returned focus to the location trigger. Reload restored the original shared New York view. The clean production tab reported no console errors or warnings and displayed no development controls. Screenshots are saved in [evidence](evidence/README.md).

Production JavaScript after the product-refinement pass is approximately 421 kB gzip, with the largest raw chunk 481 kB. The build enforces 500 kB total compressed JavaScript, 500 kB per raw JavaScript chunk, and 600 kB for the lunar map. This is larger in total than the original 210 kB gzip because the catalog, time-zone handling, and reliable civil-time implementation are now included; chunk separation alone is not a startup-performance claim. No chunk-size warning remains. The generated service worker passes cache installation, scoped cleanup, offline navigation fallback, and third-party API exclusion checks in a simulated cache environment. Real browser offline tests are authored separately.

`npm run test:browser` defines 25 browser cases across Chromium, Firefox, WebKit, mobile Chromium, and production offline. All 25 now pass locally on Windows; see the offline qualification below. The pinned GitHub Actions workflow runs validation/format/audit on Linux and Windows with Node 22/24, plus the Linux browser matrix and retained build/test artifacts. There is no configured Git remote and no CI run to report. See [RELEASE.md](RELEASE.md) for explicit outstanding gates and deployment/rollback instructions.

### Product refinement after preview review (November 13)

Revisited the primary discovery and viewing tasks after the preview evaluation. Local validation now passes 101 tests across 14 files, TypeScript, lint, the production build, runtime notices, build budgets, generated-worker contracts, and repository formatting. The browser matrix discovers 25 cases, including below-horizon discovery and reversible clear-sky preview; discovery is not execution evidence.

In-app Chromium checks covered 1280 × 720, 390 × 844, 320 × 568, and 844 × 390 viewports. The time dock measures 132, 130, 126, and 78 px respectively. The previous 390 × 844 dock measured 275 px. In short landscape, inspector content height increased from 62 to 172 px by placing time controls in one row and moving the exploration toolbar beside the inspector. No horizontal page overflow was observed. Native date/time editing fits on the smallest checked viewport; a repeated New York 01:30 offered both offsets and correctly selected UTC-05:00. Closing the time editor returns focus to its trigger.

Objects opens with immediately visible search and an above-horizon list. Tests cover searching the below-horizon Moon, jumping to its next rise, returning focus, preserving selection feedback through cloud changes, and keeping original source/custom weather when clearing the rendered sky. The Moon's daytime foreground atmosphere, night illumination, daylit ground, and curved cloud deck were inspected visually. A selected object's marker remained visible under 100% cloud cover. Graphics Retry preserved the target and created exactly one marker. A Chromium axe audit of the selected-object flow found no automated violations; structural audits include the time dialog, object details, and selected-object region. This does not replace assistive-technology testing.

The rebuilt production preview restored a shared clear-sky state while retaining the original custom 100% cloud cover. Restore brought that cloud cover back; clearing again kept keyboard focus on the corresponding Restore action. The production tab contained no development controls and reported no console warnings/errors. New [desktop and mobile captures](evidence/README.md) record the refined interface. The external phase 6 gates remain unchanged.

### Offline qualification and cache correction (November 13)

The first full browser run passed 24/25 cases and reproduced a blank production page after an offline reload. The HTML was cached, but asset lookups missed: installation used URL-only requests, browser script/style requests included `Origin`, and Vite preview returned `Vary: Origin`. The simulated cache originally compared URLs alone and could not expose that failure.

Manifest lookups now use the same URL-only request identity as installation. The cache version includes worker code as well as asset contents, keeping worker-only updates separate from the active worker's cache. The strengthened build check respects `Vary`, reproduces the original failure before the correction, and verifies offline JavaScript, CSS, and image bytes. It also checks that third-party APIs, unlisted same-origin URLs, asset query variants, and non-GET requests remain outside the cache handler.

On Windows with Node 24.22.1 and Playwright 1.65.0, all 25 browser cases pass without retries across Chromium, Firefox, WebKit, mobile Chromium, and production offline. The offline case now verifies a reload, a place change, and a shared-link reopen in a fresh offline tab with the 3D renderer and no page errors. All 101 domain/component tests, TypeScript, lint, formatting, the production build, and build budgets also pass. Generated Playwright reports are excluded from source linting so retaining failure evidence does not break subsequent validation. Physical-device, assistive-technology, sustained GPU, remote CI, and broader scientific qualification remain open.
