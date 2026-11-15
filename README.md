# Elsewhere — Interactive Sky Simulator

Explore a calculated sky from any place and time. Elsewhere combines a quiet, responsive interface with Sun, Moon and planet ephemerides, a 5,070-star catalog, and a weather-driven illustrative atmosphere.

The planned refactor is complete, and CI passes on GitHub Actions. The remaining release gates, such as deployment, physical devices and screen readers, are in [docs/RELEASE.md](docs/RELEASE.md).

The interface is in English and Simplified Chinese. The [roadmap](ROADMAP.md) sets out what comes next: shareable sky moments, horizon scenery and a viewing planner. Earlier plans and reviews are in the [archive](docs/archive/README.md).

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
- Read the app in English or Simplified Chinese. The language follows the browser (any Chinese variant, including zh-TW and zh-HK, gets Simplified Chinese; anything else gets English) and can be set in **Layers → Language**, which is remembered. Dates, times and numbers follow the language; bright stars take their common Chinese names, and search finds an object by its Chinese or English name. Shared links carry no language: the recipient reads them in their own.
- Save preferences/places locally and copy a versioned link containing the chosen place, instant, camera, layers, and custom conditions. A link made while an object or line pattern is centered opens by turning to it. Device coordinates are rounded to about 10 km unless you choose to share them exactly. No accounts or analytics are included.
- **Make an image** in the share dialog draws a keepsake image of the moment (a prototype for user testing; see [the test guide](docs/SKY-MOMENT-TEST.md)): realistic or illustrated, with a ridge or a mountain, sea or city horizon, with the place name, local time, Moon phase, conditions, their source and the data credits, in the language you are using.

The responsive shell keeps a separate time dock and one inspector. The renderer retains geometry/textures, schedules static scenes on demand, animates clouds only when their drift is visible (capped at 30 fps; rain and snow run at the display rate), suspends hidden-tab animation, adapts resolution, and recovers from graphics loss without resetting the exploration. After a successful production load and asset-cache installation, the local shell and catalog can reopen offline; remote search/weather still require a network connection. Weather caching is memory-only.

## Architecture

| Area                            | Responsibility                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain`                    | Platform-independent calculations: astronomy, stars, time zones, star visibility, weather sample selection. Imports nothing from the app, network or renderer (enforced by `tests/architecture.test.ts`) |
| `src/services`                  | Open-Meteo weather and place-search clients, response validation, cancellation, cache and provenance                                                                                                     |
| `src/lib`                       | Application state: exploration reducer, visibility reasons, preferences and share links, locations, network failure classification                                                                       |
| `src/i18n`                      | Typed message catalogs (`en.ts` is the source, `zh-Hans.ts` matches its shape), each its own chunk; locale detection, Intl formatters, display names for objects and places                              |
| `src/hooks`                     | Simulation clock and data subscriptions                                                                                                                                                                  |
| `src/renderer`                  | Camera input, the rigid star sphere and its shader, retained celestial layers, atmosphere, particles, scheduling and resource ownership                                                                  |
| `src/moment`                    | Keepsake images (phase 3 prototype, loaded on demand): projection, the illustrated drawing, horizon silhouettes and the postcard layout                                                                  |
| `src/components`, `src/App.tsx` | Accessible exploration controls and presentation; App wires state to components                                                                                                                          |
| `src/dev`, `tests`, `scripts`   | Development fixtures, qualification checks and asset tooling                                                                                                                                             |

## Scope and sources

Supported instants span 1900–2100 UTC. This is educational visualization: the generic landscape, clouds, brightness, and precipitation are illustrative. It does not include planetary discs or moons, measured terrain, a Milky Way layer, eclipse timing, or a complete constellation atlas. Device location uses a disclosed sea-level elevation assumption. Displayed altitudes of the Sun, Moon, planets, and stars include standard atmospheric refraction. Stellar parallax, nutation, and variable brightness are omitted.

[Scientific conventions and independent reference results](docs/SCIENCE.md) explain the accuracy budget and its limits. [Asset provenance](docs/ASSETS.md) records catalog/map licenses, source URLs, hashes, and transformations. The app also exposes [sources, privacy, and limitations](public/credits.html) ([简体中文](public/credits.zh-Hans.html)).

- [Astronomy Engine](https://github.com/cosinekitty/astronomy): Sun, Moon, planets, orientation, and events; MIT.
- [HYG v4.1](https://github.com/astronexus/HYG-Database): magnitude-limited star derivative; CC BY-SA 4.0.
- [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/): lunar surface imagery; provenance and mirror caveat are recorded in the asset notes.
- [Open-Meteo](https://open-meteo.com/): weather models and geocoding, with GeoNames place data. Weather data attribution and API usage terms are distinct. No API key is required for the configured public endpoints; confirm intended deployment usage against the provider's terms.

## Deployment

Cloudflare Workers serves the built site as static assets at `https://elsewhere.orangely.xyz`. Cloudflare's Git integration builds and deploys every push to `main`; `wrangler.jsonc` holds the configuration and `public/_headers` the cache rules. After a deployment, `npm run check:deployment` checks the live site. Setup, qualification, cache updates and rollback are in [docs/RELEASE.md](docs/RELEASE.md).

## Licence

Elsewhere's own code and documentation are under the [MIT licence](LICENSE). Bundled data and images keep their own licences, listed above and in [asset provenance](docs/ASSETS.md): in particular the star catalog derivative `src/data/stars.json` remains CC BY-SA 4.0.
