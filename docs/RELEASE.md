# Release candidate and qualification

November 13, 2026: phases 0–5 are implemented and locally checked. Phase 6 implementation and release tooling are in place. The candidate is not yet fully qualified or deployed. A committed browser suite or CI workflow is not evidence that it has run.

## Gate status

| Gate                                                          | Evidence/status                                                                                                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type checking, lint, domain/component tests, production build | Passed locally on Windows, Node 24.22.1; 101 tests across 14 files                                                                                                                |
| Independent scientific samples                                | Passed against cached JPL DE441 and USNO references; see [SCIENCE.md](SCIENCE.md) for coverage and limits                                                                         |
| Live weather contracts                                        | Current, recent-past, historical, final forecast-horizon requests passed November 13; not part of deterministic CI                                                                |
| Automated accessibility                                       | axe-core component flows passed; in-app Chromium audits include contrast; manual assistive-technology qualification remains open                                                  |
| Desktop and responsive interactions                           | In-app Chromium checked; screenshots in `docs/evidence`; this is viewport emulation, not physical-device evidence                                                                 |
| Graphics failure recovery                                     | Simulated context loss and Retry preserved time/location/camera in Chromium                                                                                                       |
| Performance observations                                      | Short Chromium rain run p95 interval 17.0 ms; domain p95 4.74 ms; see [VALIDATION.md](VALIDATION.md)                                                                              |
| Build budgets and offline contract                            | Passed: bundle budgets, header-aware cache checks, and Chromium production offline reload/fresh-tab shared-link restoration, including the 3D renderer                            |
| Dependency audit                                              | Zero known vulnerabilities reported for the checked lockfile; rerun before release                                                                                                |
| Cross-browser automated suite                                 | Passed locally on Windows: 25/25 cases across Playwright Chromium, Firefox, WebKit, mobile Chromium, and production-offline; remote CI and physical devices remain separate gates |
| CI                                                            | Pinned-action Linux/Windows Node 22/24 checks and Linux browser matrix authored; pending first remote run (repository has no configured remote)                                   |
| Physical devices and assistive technology                     | Open: midrange phone, integrated-GPU laptop, iOS Safari, touch/pinch, screen reader, actual browser zoom at 200%                                                                  |
| Sustained renderer resources                                  | Open: 30-minute real GPU playback/location-switch soak; simulated particle recycling is already tested                                                                            |
| First-use research                                            | Open: at least three unfamiliar users complete the scenarios below                                                                                                                |
| Scientific review                                             | Open: broader dates, polar grazing events, elevation and atmospheric-convention review; finite reference samples are not full-range certification                                 |

## Finish qualification

Run the browser suite in a fresh installed checkout after building. CI retains the built site, screenshots, failure traces, and HTML test report. Fix failures at their source, then rerun the affected gate. Do not accept a retry-only pass without investigating the first failure.

Record device model, OS/browser version, viewport/DPR, power mode, network profile, commit, and scenario. Measure usable shell and interactive sky against the roadmap's 1.5 s / 3 s targets. Record p95 frame intervals, input latency, and retained resources. Run at least 30 minutes of playback with repeated location/day changes; hide and restore the tab, disconnect/reconnect the network, and exercise graphics loss. Resource counts should stabilize rather than grow continuously.

With a screen reader and keyboard, reach every primary action, identify field names and selected states, navigate the place dialog, resolve both DST folds, inspect a below-horizon object, and recover from unavailable weather. Repeat at 200% browser zoom, short landscape, narrow portrait, and with reduced motion. Check actual touch drag, pinch, pointer cancellation, and screen safe areas on a physical phone.

Ask at least three unfamiliar users to find tonight's Moon in another city, identify why it is not visible, change and reset weather, save a place, and share a view. Record completion, confusion, and recovery without coaching. Resolve recurring failures before marking release qualification complete.

## Build and deploy

1. Start from a clean, reviewed commit and run `npm ci`, `npm run validate`, `npm run format:check`, `npm audit --audit-level=high`, and the browser suite. Inspect source/license notes and confirm the intended Open-Meteo usage. The repository does not grant an application-wide license; the owner must choose one before third-party redistribution. Dependency/data licenses remain applicable.
2. Serve the generated `dist/` directory over HTTPS on a dedicated origin. No server-side secrets or API key are required for the configured endpoints. Do not expose the development server as a production service.
3. For a subdirectory deployment, set Vite's `base`, rebuild, and qualify navigation, source links, and service-worker scope at that exact path. Default qualification uses the origin root.
4. Use revalidation/no-cache headers for `index.html`, `sw.js`, and unhashed public assets. Hashed `assets/*.js` and `assets/*.css` can use `Cache-Control: public, max-age=31536000, immutable`. Serve proper JavaScript MIME types and HTTPS; service workers do not run on ordinary remote HTTP origins.
5. Upload a complete versioned build atomically, retaining the previous complete build. Smoke-test initial load, local time, a supported weather request, share-link restore, and an offline reload after cache installation. Check a second visit from an older installed version as well as a fresh profile.
6. Publish only when the qualification owner signs off the remaining gates. No remote destination or deployment was configured during this implementation.

## Cache updates and rollback

The build hashes the worker code and all local assets into a versioned shell cache. Worker-only changes therefore install into a separate cache while an older worker is active. Manifest assets are stored and retrieved with the same URL-only request identity, so a host's `Vary: Origin` headers do not prevent offline script/style loading. Installation succeeds only after those assets are cached. Updates use the normal service-worker waiting lifecycle: the current tabs finish using their worker; after they close, the new worker activates and removes previous Elsewhere caches. There is no forced reload or `skipWaiting`. Weather/geocoding requests, location searches, and shared URL parameters are not added to that cache. If worker registration fails, the online app still works and discloses that offline support is unavailable.

Rollback by atomically restoring the previous complete `dist/` artifact, including its `sw.js`, and smoke-testing it. Existing tabs may retain their active worker until closed; a rollback cannot instantly replace their running code. Keep both artifact provenance and the release commit. If a worker defect prevents ordinary recovery, publish a reviewed replacement worker at the same scope that removes only Elsewhere caches, then requalify offline behavior. Do not instruct users to erase unrelated site/browser storage.

Local preferences and share links have a schema version. Preserve compatible readers or provide an explicit migration when that schema changes. Do not silently reinterpret an older coordinate, time, or custom-weather value.
