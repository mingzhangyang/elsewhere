# Elsewhere — Interactive Sky Simulator

Explore a calculated sky from any place and time. Elsewhere combines a quiet, responsive interface with Sun/Moon ephemerides, a 5,070-star catalog, and a weather-driven illustrative atmosphere.

The substantial refactor in [ROADMAP.md](ROADMAP.md) is implemented through phase 5. Phase 6 has local validation, independent numerical regression fixtures, release tooling, and documentation; the external qualification gates in [docs/RELEASE.md](docs/RELEASE.md) remain open.

The [mobile app roadmap](docs/MOBILE_ROADMAP.md) covers an installable web beta, sensor pointing, and shared Android/iOS editions with device qualification gates.

## Run locally

Use Node.js 22.13+ in the 22.x line, or Node.js 24+, with npm. The lockfile is the installation contract.

```sh
npm ci
npm run dev
```

Open the localhost address printed by Vite. Development and preview bind to loopback by default. To build and inspect the production candidate:

```sh
npm run validate
npm run preview
```

Validation runs TypeScript, ESLint, domain and component tests, the production build, bundle budgets, and service-worker contract checks. Additional commands:

```sh
npm run format:check
npm run test:watch
npx playwright install chromium firefox webkit
npm run test:browser
```

Build before running the browser suite; it starts both development and production preview servers. See [validation](docs/VALIDATION.md) for deterministic scenarios, measured results, and separate live-provider checks.

## Explore

Start with **Find the Moon**, or open **Objects** to search and browse positions above the horizon. Centering leaves a position marker and a visibility explanation; a hidden Sun or Moon can jump to its next rise. **Preview a clear sky** temporarily removes clouds, haze, and precipitation, with a Restore action that preserves the original weather. Shared links preserve this preview mode separately from custom conditions.

Click the compact date/time readout for exact editing, previous/next day, and sunrise/sunset jumps. Playback, the timeline, Now, and Tonight stay in the main dock.

- Choose among eight presets, search for a place, use device location explicitly, or return to saved/recent places. Changing place preserves the instant and updates its local clock.
- Enter a local date/time, move through an actual civil-day timeline, jump to sunrise/sunset/tonight, or play at 1×, 10×, 60×, or 600×. **Now** follows the real clock. Editing pauses it. Repeated DST hours offer both UTC offsets; nonexistent times explain the problem.
- Drag the sky, pinch or scroll to zoom, or use arrows, +/−, and Home. Visible zoom/reset controls and a textual sky summary provide alternatives. Select objects in the scene or searchable Objects panel and center them in view; centering the Sun or Moon zooms in (down to a 2° field) so the lunar surface map is visible, and the target ring circles the disc.
- Inspect Sun/Moon events, observer-relative lunar illumination, approximate lunar distance, and star coordinates. Toggle independent star, label, and line layers. Choose dark/suburban/city brightness, an unobstructed or illustrative horizon, reduced motion, and rendering quality.
- Use model-backed weather with explicit current/forecast/recent/historical source, timestamps, missing values, and stale-cache labels. Custom weather is a separate simulation. Neither mode changes calculated astronomical positions.
- Save preferences/places locally and copy a versioned link containing the chosen place, instant, camera, layers, and custom conditions. Exact coordinates are disclosed before sharing. No accounts or analytics are included.

The responsive shell keeps a separate time dock and one inspector. The renderer retains geometry/textures, schedules static scenes on demand, animates clouds only when their drift is visible (capped at 30 fps; rain and snow run at the display rate), suspends hidden-tab animation, adapts resolution, and recovers from graphics loss without resetting the exploration. After a successful production load and asset-cache installation, the local shell and catalog can reopen offline; remote search/weather still require a network connection. Weather caching is memory-only.

## Architecture

| Area                                                         | Responsibility                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `src/lib/astronomy.ts`, `stars.ts`, `time.ts`                | Domain calculations, numerical and time-zone contracts                                            |
| `src/lib/weather.ts`, `src/lib/locations.ts`, `src/services` | Provider adapters, validation, cancellation, cache and provenance                                 |
| `src/hooks`                                                  | Simulation clock and data subscriptions                                                           |
| `src/renderer`                                               | Camera input, retained celestial layers, atmosphere, particles, scheduling and resource ownership |
| `src/components`, `src/App.tsx`                              | Accessible exploration controls and presentation                                                  |
| `src/lib/persistence.ts`                                     | Versioned preferences and shareable state                                                         |
| `src/dev`, `tests`, `scripts`                                | Development fixtures, qualification checks and asset tooling                                      |

## Scope and sources

Supported instants span 1900–2100 UTC. This is educational visualization: the generic landscape, clouds, brightness, and precipitation are illustrative. It does not include planets, measured terrain, a Milky Way layer, eclipse timing, or a complete constellation atlas. Device location uses a disclosed sea-level elevation assumption. Displayed altitudes of the Sun, Moon, and stars include standard atmospheric refraction. Stellar parallax, nutation, and variable brightness are omitted.

[Scientific conventions and independent reference results](docs/SCIENCE.md) explain the accuracy budget and its limits. [Asset provenance](docs/ASSETS.md) records catalog/map licenses, source URLs, hashes, and transformations. The app also exposes [sources, privacy, and limitations](public/credits.html).

- [Astronomy Engine](https://github.com/cosinekitty/astronomy): Sun, Moon, orientation, and events; MIT.
- [HYG v4.1](https://github.com/astronexus/HYG-Database): magnitude-limited star derivative; CC BY-SA 4.0.
- [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/): lunar surface imagery; provenance and mirror caveat are recorded in the asset notes.
- [Open-Meteo](https://open-meteo.com/): weather models and geocoding, with GeoNames place data. Weather data attribution and API usage terms are distinct. No API key is required for the configured public endpoints; confirm intended deployment usage against the provider's terms.

No deployment has been performed. Follow the qualification, deployment, cache-update, and rollback procedure in [docs/RELEASE.md](docs/RELEASE.md).
