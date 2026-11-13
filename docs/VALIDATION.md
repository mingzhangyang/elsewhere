# Validation and supported behavior

Use Node 22.13 or later in the 22.x line, or Node 24+. Run `npm ci` and `npm run validate`. The workflow checks TypeScript, ESLint, domain/component tests, and the production build. Run `npm run test:watch` during development. All automated tests use fixtures or mocked requests; live API probes are separate.

## Baseline

The original source and roadmap are preserved in local commit `dfe27f5`; phase 0 is commit `1b95b88`. Phase 1 converts both known failures to ordinary regression tests and extends coverage to missing data, provenance, request cancellation, forecast boundaries, DST folds, half-hour transitions, and civil-day events.

Run `node scripts/weather-smoke.mjs` separately to exercise live current, recent, historical, and final-horizon requests. All four succeeded on November 13, 2026; historical visibility correctly remained unavailable. The final forecast day is clipped to the provider's UTC horizon, and hours beyond that coverage remain unavailable.

The development server supports `?scenario=day`, `?scenario=night`, `?scenario=rain`, and `?scenario=unavailable`. These inject a fixed instant and synthetic, explicitly developer-owned weather. They do not access the weather network and are excluded from production. Precipitation is seeded for repeatability. Use a fixed viewport and pause atmospheric motion when comparing individual image pixels.

Baseline production JavaScript: 741.22 kB / 209.95 kB gzip. Baseline assessment screenshots were inspected at 1280 × 720 and 390 × 844. Automated test timings are not device-performance evidence. Measurements on a physical midrange phone, integrated-GPU laptop, iOS Safari, and assistive technology remain part of release qualification.

The `minimatch` override selects the patched 11.x API used by the lint dependencies. Remove it when both upstream dependency paths require a patched version themselves. Audit the lockfile after dependency updates. The phase 0 install reports zero known vulnerabilities.

## Supported numerical contract

- Product scope: educational sky exploration, 1900 through 2100 inclusive. Reject instants outside the interval rather than implying accuracy for arbitrary years.
- Observer coordinates: WGS84 latitude in degrees north, longitude in degrees east, elevation in meters above sea level. Browser altitude is only used when finite; absent elevation is explicitly assumed to be sea level.
- Horizontal coordinates: altitude above the mathematical horizon; azimuth clockwise from north. The generic drawn ridge is not measured local terrain.
- Sun/Moon horizontal positions use Astronomy Engine's normal refraction. Stellar coordinates currently use precession and geometric altitude; proper motion and star refraction are fidelity work.
- Rise/set follows Astronomy Engine's limb and atmospheric conventions at the specified elevation. A civil day runs from local midnight to the next local midnight, not a fixed number of elapsed hours.
- Missing daily events are meaningful domain states. They must remain distinct from calculation failure. Weather data never changes calculated celestial coordinates.
- Reference tolerances proposed for qualification: Sun/Moon angular separation within 0.1 degrees and ordinary rise/set within 2 minutes of an independent reference configured to the same conventions. Near-horizon, polar, and extreme-elevation differences require explicit review. These are acceptance targets, not already established accuracy claims.

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
