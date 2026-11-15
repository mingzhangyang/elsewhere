# Release candidate and qualification

Updated November 14, 2026: phases 0–5 of the [archived refactor roadmap](archive/refactor-roadmap.md) are implemented, and CI passes on GitHub Actions. Phase 6 implementation and release tooling are in place. The candidate is not yet fully qualified or deployed; deployment is phase 0 of the [roadmap](../ROADMAP.md). A committed browser suite or CI workflow is not evidence that it has run.

## Gate status

| Gate                                                          | Evidence/status                                                                                                                                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type checking, lint, domain/component tests, production build | Passed on GitHub Actions for `main` (Linux and Windows, Node 22 and 24), November 14; 183 tests across 25 files                                                                                                 |
| Independent scientific samples                                | Passed against cached JPL DE441 and USNO references; see [SCIENCE.md](SCIENCE.md) for coverage and limits                                                                                                       |
| Live weather contracts                                        | Current, recent-past, historical, final forecast-horizon requests passed November 13; not part of deterministic CI                                                                                              |
| Automated accessibility                                       | axe-core component flows passed; in-app Chromium audits include contrast; manual assistive-technology qualification remains open                                                                                |
| Desktop and responsive interactions                           | In-app Chromium checked; screenshots in `docs/evidence`; this is viewport emulation, not physical-device evidence                                                                                               |
| Graphics failure recovery                                     | Simulated context loss and Retry preserved time/location/camera in Chromium                                                                                                                                     |
| Performance observations                                      | Short Chromium rain run p95 interval 17.0 ms; domain p95 4.74 ms; see [VALIDATION.md](VALIDATION.md)                                                                                                            |
| Build budgets and offline contract                            | Passed: bundle budgets, header-aware cache checks, and Chromium production offline reload/fresh-tab shared-link restoration, including the 3D renderer                                                          |
| Dependency audit                                              | Zero known vulnerabilities reported for the checked lockfile; rerun before release                                                                                                                              |
| Cross-browser automated suite                                 | Passed on GitHub Actions (Linux, under Xvfb): Playwright Chromium, Firefox, WebKit, mobile Chromium, and production-offline; physical devices remain a separate gate                                            |
| CI                                                            | Passed: pinned-action Linux/Windows Node 22/24 checks and the Linux browser matrix run on every push to `main`                                                                                                  |
| Deployment                                                    | Passed November 15: deployed to `https://elsewhere.orangely.xyz`; headers, precached files, the injected-script check and an offline reload in Chromium pass. Weather needs a check from an ordinary connection |
| Physical devices and assistive technology                     | Open: midrange phone, integrated-GPU laptop, iOS Safari, touch/pinch, screen reader, actual browser zoom at 200%                                                                                                |
| Sustained renderer resources                                  | Open: 30-minute real GPU playback/location-switch soak; simulated particle recycling is already tested                                                                                                          |
| First-use research                                            | Open: at least three unfamiliar users complete the scenarios below                                                                                                                                              |
| Scientific review                                             | Open: broader dates, polar grazing events, elevation and atmospheric-convention review; finite reference samples are not full-range certification                                                               |

## Finish qualification

Run the browser suite in a fresh installed checkout after building. CI retains the built site, screenshots, failure traces, and HTML test report. Fix failures at their source, then rerun the affected gate. Do not accept a retry-only pass without investigating the first failure.

Record device model, OS/browser version, viewport/DPR, power mode, network profile, commit, and scenario. Measure usable shell and interactive sky against the [roadmap's](../ROADMAP.md#acceptance-targets) 1.5 s / 3 s targets. Record p95 frame intervals, input latency, and retained resources. Run at least 30 minutes of playback with repeated location/day changes; hide and restore the tab, disconnect/reconnect the network, and exercise graphics loss. Resource counts should stabilize rather than grow continuously.

With a screen reader and keyboard, reach every primary action, identify field names and selected states, navigate the place dialog, resolve both DST folds, inspect a below-horizon object, and recover from unavailable weather. Repeat at 200% browser zoom, short landscape, narrow portrait, and with reduced motion. Check actual touch drag, pinch, pointer cancellation, and screen safe areas on a physical phone.

Ask at least three unfamiliar users to find tonight's Moon in another city, identify why it is not visible, change and reset weather, save a place, and share a view. Record completion, confusion, and recovery without coaching. Resolve recurring failures before marking release qualification complete.

## Build and deploy

Production is a Cloudflare Worker named `elsewhere` that serves `dist/` as static assets at `https://elsewhere.orangely.xyz`, with no Worker code. Cloudflare's Git integration (Workers Builds) builds and deploys each push to `main`. The configuration is `wrangler.jsonc`; the cache rules are `public/_headers`, which Cloudflare reads and does not serve.

### One-time setup in the Cloudflare dashboard

1. Make sure `orangely.xyz` is a zone in the same Cloudflare account, and that no DNS record already exists for `elsewhere.orangely.xyz`. The first deployment creates the custom domain and its certificate from the `routes` entry.
2. Under Workers & Pages, create a Worker by importing the GitHub repository `mingzhangyang/elsewhere`. The Worker name must be `elsewhere`, matching `wrangler.jsonc`.
3. Build settings: root directory `/`; build command `npm run build`; deploy command `npx wrangler@4.156.0 deploy` (the same Wrangler version the configuration was tested with); production branch `main`. Cloudflare installs dependencies from `package-lock.json` and takes the Node version from `.node-version`.
4. Turn off builds for non-production branches. Preview URLs and `workers.dev` are disabled so that shared links have only one origin.
5. Review the `orangely.xyz` zone features that add scripts to pages at the edge; they are zone settings and also affect other sites on `orangely.xyz`. JavaScript detections (Cloudflare's bot detection, `/cdn-cgi/challenge-platform/`) stays on by the owner's decision, and `public/credits.html` discloses it. Keep automatic Web Analytics and any other script-injecting feature off: the privacy notes say Elsewhere has no analytics. `npm run check:deployment` fails if the page carries any other injected script.

Cloudflare deploys whatever reaches `main`, whether or not GitHub Actions passed. Merge to `main` only through pull requests, and make the `checks` and `browser` jobs of the validation workflow required status checks in the repository's branch rules. A direct push to `main` bypasses that gate.

### Each release

1. Merge a reviewed pull request whose validation passed: `npm run validate`, `npm run format:check`, `npm audit --audit-level=high` and the browser suite. Inspect source and licence notes. Elsewhere's own code is MIT; dependency and data licences still apply. Weather stays on Open-Meteo's free, non-commercial tier, with requests made from visitors' browsers.
2. Watch the Workers Builds log for the deployment, then run `npm run check:deployment`. It retries for about four minutes and checks the home page, that Cloudflare injected no scripts into it, `Cache-Control` on the shell, `sw.js` and a hashed asset, that every precached file is served, and that `_headers` is not.
3. Smoke-test by hand: initial load, local time, a supported weather request, share-link restore, and an offline reload after cache installation. Check a second visit from an older installed version as well as a fresh profile.
4. The remaining qualification gates above still apply before announcing a public release.

### Constraints the configuration relies on

- Serve from the origin root. A subdirectory deployment would need Vite's `base`, a rebuild, and requalification of navigation, source links and service-worker scope.
- Everything under `/assets/` is cached as immutable, so every file there must carry a content hash; `scripts/check-build.mjs` fails the build otherwise. Unhashed files belong in `public/` outside `assets/` and keep Cloudflare's default revalidating headers.
- Cloudflare redirects `/index.html` to `/` and `/credits.html` to `/credits`. The service worker stores plain copies of redirected responses when it precaches, because a navigation cannot be answered with a redirect. This was checked offline in Chromium against Wrangler's local runtime.
- Keep the custom domain fixed: shared links carry the origin they were made on.

## Cache updates and rollback

The build hashes the worker code and all local assets into a versioned shell cache. Worker-only changes therefore install into a separate cache while an older worker is active. Manifest assets are stored and retrieved with the same URL-only request identity, so a host's `Vary: Origin` headers do not prevent offline script/style loading. Installation succeeds only after those assets are cached. Updates use the normal service-worker waiting lifecycle: the current tabs finish using their worker; after they close, the new worker activates and removes previous Elsewhere caches. There is no forced reload or `skipWaiting`. Weather/geocoding requests, location searches, and shared URL parameters are not added to that cache. If worker registration fails, the online app still works and discloses that offline support is unavailable.

Roll back by restoring the previous Worker version under the Worker's Deployments in the Cloudflare dashboard (or `npx wrangler@4.156.0 rollback` when signed in). A version includes its static assets, so this restores the complete previous build, including its `sw.js`. Run `npm run check:deployment` afterwards. Existing tabs may retain their active worker until closed; a rollback cannot instantly replace their running code. Record the version and the release commit together. If a worker defect prevents ordinary recovery, publish a reviewed replacement worker at the same scope that removes only Elsewhere caches, then requalify offline behavior. Do not instruct users to erase unrelated site/browser storage.

Local preferences and share links have a schema version. Preserve compatible readers or provide an explicit migration when that schema changes. Do not silently reinterpret an older coordinate, time, or custom-weather value.
