# Elsewhere app polish roadmap

Elsewhere should make it effortless to choose a place and time, explore a convincing sky, and understand what is calculated, supplied by a weather model, or simulated. Keep the quiet visual identity and make the sky the main experience. Rebuild the internal boundaries and responsive interface where needed.

The recommended approach is a substantial refactor within React, TypeScript, Vite, Three.js, and Astronomy Engine. These tools already support the product. The main constraints are the app's state model, rendering lifecycle, scientific presentation, and interaction design. Replace those parts incrementally behind verified behavior rather than making a framework migration the first milestone.

## Current baseline

Implementation status on November 13, 2026: phases 0–2 have their implementation and automated checks in place. Phase 1 corrects weather request ranges, missing-data/provenance handling, cancellation, DST ambiguity, civil-day events, time-zone lookup, lunar phase presentation, and layer semantics. Phase 2 separates the simulation controller, weather service, renderer lifecycle, camera controls, shaders, and retained celestial layers. Phase 3 now provides the responsive exploration shell, location picker, object/weather/settings inspector, camera/time controls, saved preferences and share links. Phase 4 adds the licensed catalog, lunar map and orientation, shared cloud occlusion, screen-space labels, and bounded precipitation. Phase 5 is next. Physical-device benchmarks and independent scientific review remain qualification tasks. See [validation](docs/VALIDATION.md) for commands and the supported numerical contract.

Assessment date: November 12, 2026. Source review covered all application files; browser inspection covered desktop at 1280 × 720 and mobile at 390 × 844, including daytime, nighttime, and unavailable weather.

- TypeScript checking and the production build pass. The build produces one 741.07 kB JavaScript bundle, 209.86 kB gzip, and a chunk-size warning.
- The application has a procedural sky, Sun and Moon calculations, location search, time controls, weather controls, 37 catalog stars, and five hand-built line patterns.
- The package provides no test or lint scripts, and this extracted project has no Git repository. Preserve a baseline before starting the refactor.
- Browser inspection was a focused assessment, not cross-browser, accessibility, performance, or scientific qualification. Those checks are deliverables below.

### Findings that determine priority

| Priority | Finding and evidence | Root correction |
| --- | --- | --- |
| P0 | The forecast request fails. A request matching the app returned HTTP 400 with the reason `Parameter 'forecast_days' is mutually exclusive with 'start_date' and 'end_date'`. Both are assembled in `src/lib/weather.ts:121–138`. | Define one valid request shape for each time-range strategy. Preserve provider error reasons and verify the request contract. |
| P0 | Unavailable weather still displays default temperature, wind, cloud cover, humidity, and pressure. This was visible in the browser. Missing hourly values also become plausible defaults in `src/lib/weather.ts:43–66`. | Represent missing data explicitly; keep rendering assumptions separate from sourced measurements. |
| P1 | `getWeatherForInstant` always prefers hourly data, bypassing the current sample, while the source label remains attached to the original fetch. Previous location/day data also remains available during a replacement fetch. See `src/App.tsx:40–107`. | Resolve sample, provenance, freshness, and coverage together for the active location and instant. |
| P1 | New York local time `2026-03-08 02:30` converts to `01:30` when round-tripped. The iterative conversion has no gap/fold policy. The fall repeated hour also has no way to select its second occurrence. See `src/lib/time.ts:33–47`. | Use explicit time-zone disambiguation and actual local-day boundaries. |
| P1 | Rise/set searches use a fixed one-day interval, and daylight duration assumes a same-day sunrise before sunset. Errors and absent events both become `null`. See `src/lib/astronomy.ts:12–23,48–76`. | Compute events within the selected civil day, including partial and polar days, and retain distinct event statuses. |
| P1 | The Moon phase icon appears mostly lit while the panel reports a small crescent. Its CSS uses only illumination. The scene also derives lighting by subtracting Sun and Moon positions placed at the same artificial radius. See `src/styles.css:110–113` and `src/components/SkyScene.tsx:457–464`. | Drive the icon and rendered terminator from consistent phase geometry and observer orientation. |
| P1 | Mobile keeps a 190 px wide details panel over much of a 390 px viewport. The weather control is partly covered by the time console. Numerous labels shrink to 6–8 px. See `src/styles.css:212–288`. | Introduce a mobile sheet and compact controls with deliberate layout ownership. |
| P1 | Playback updates React every 200 ms, recalculates daily events, and disposes/recreates text textures and line geometry on every scene update. See `src/App.tsx:80,109–119` and `src/components/SkyScene.tsx:484–519`. | Separate calculation cadences and retain GPU resources across updates. |
| P1 | Constellation labels ignore the Labels toggle; lines and labels are not attenuated with the stars. Lines remain visible in daytime. The pattern named Cygnus connects Deneb to Vega and Altair. | Define independent layer behavior and audit the data. Those stars belong to the Summer Triangle across three constellations. [NASA reference](https://science.nasa.gov/solar-system/skywatching/night-sky-network/summer-triangle-corner-altair/). |
| P2 | Only four of eight presets are rendered; the chevron only opens a search state whose empty results are hidden. Geolocation uses the browser's time zone rather than resolving the coordinates. | Give location selection one complete interaction and an explicit location/time-zone contract. |
| P2 | Camera controls support drag and wheel, but no keyboard navigation or pinch zoom. Reset view disappears below 900 px. Layer state is communicated visually without `aria-pressed`. | Provide equivalent keyboard and touch controls and accessible state. |

P0 means the primary experience is broken or misrepresents data. P1 is required for a polished release. P2 is usability and completeness work that follows the foundations.

## Product decisions to establish first

Use these defaults to keep implementation moving. Revisit them only if the intended audience changes.

1. **Audience:** curious people exploring the sky and learning where objects appear. Define a separate scientific qualification effort if research-grade use becomes a requirement.
2. **Initial view:** start at the selected place and current instant, with an upward-looking camera and a clear route to tonight or sunset. Make paused, playing, and following real time distinct states.
3. **Changing places:** preserve the instant by default and update the local clock. A later explicit option may preserve wall-clock time; never switch this implicitly.
4. **Weather:** use “Weather data” for model-backed conditions, with current, forecast, or historical provenance beneath it. Custom weather is a separate mode. Missing source data stays missing in the readout; a neutral rendered atmosphere must be labeled as an assumption.
5. **Sky layers:** stars, constellation lines, and labels are independent settings. Labels can annotate enabled object layers; turning Labels off removes all labels. An optional educational overlay may remain visible by day if that behavior is explicit.
6. **Presentation:** realistic object size and brightness are the default goal. Any visibility enhancement is a named display setting and does not change astronomical values.

## Delivery sequence

Estimates are planning ranges for one experienced developer, including routine design and verification, with occasional astronomy and accessibility review. They are not measured delivery commitments. Allow approximately 6–10 focused weeks for phases 0–6, then adjust after the first milestone. Optional features have a separate budget.

| Phase | Effort | Depends on | Deliverable |
| --- | --- | --- | --- |
| 0 Establish the baseline | 2–3 days | None | Reproducible scenarios and checks |
| 1 Make the simulation trustworthy | 5–8 days | 0 | Correct time, weather, and event semantics |
| 2 Refactor the application boundaries | 3–5 days | 1 contracts | Modular simulation, data, and renderer layers |
| 3 Redesign the exploration interface | 6–9 days | 1–2 | Complete desktop, mobile, keyboard, and touch flows |
| 4 Improve sky fidelity | 8–12 days | 1–2 | Convincing and internally consistent sky rendering |
| 5 Meet performance and resilience targets | 3–5 days | 2–4 | Measured performance and recovery |
| 6 Qualify and release | 3–5 days | 0–5 | Tested release candidate and deployment process |

Phases 3 and 4 can proceed concurrently after the shared contracts settle. Performance profiling and accessibility checks begin in phase 0 and continue throughout; phase 5 closes the measured gaps. The first useful milestone is phases 0–1: restore working weather and trustworthy controls before investing in richer imagery.

### Phase 0 Establish the baseline

- Preserve this version in version control and document the local runtime, install, build, and preview commands.
- Add domain tests, component interaction tests, and a small browser suite. Expose typecheck, lint, test, and build commands in one reproducible validation workflow.
- Create deterministic scenarios using fixed instants, locations, seeded rendering randomness, and captured weather fixtures. Keep live provider smoke checks separate from deterministic CI.
- Record representative screenshots and startup, frame-time, memory, and request-count baselines on named devices. Include a midrange phone and an integrated-GPU laptop.
- Define the supported date range, browsers, coordinate conventions, refraction policy, and intended numerical tolerances. Cover normal days, DST, midnight crossings, northern and southern hemispheres, polar conditions, and unavailable weather.

**Exit criteria:** a fresh checkout builds; the forecast request conflict and DST round-trip bug have reproducible checks; representative scenes can be replayed without relying on live weather or the current clock.

### Phase 1 Make the simulation trustworthy

**Weather contract**

- Fix the conflicting forecast query parameters by selecting one documented range strategy. Validate the URL before sending it and surface the provider's useful error reason.
- Route current, recent-past, archive, and future requests by actual coverage. Open-Meteo supports recent past data through the forecast API; historical model availability and delay vary. Encode a tested routing policy rather than assuming every previous day has the same archive coverage. [Forecast documentation](https://open-meteo.com/en/docs), [historical documentation](https://open-meteo.com/en/docs/historical-weather-api).
- Replace `available + values` with explicit loading, ready, partial, unavailable, and error states. Attach coordinates, covered interval, sample time, fetch time, source kind, units, and missing fields.
- Select the weather value and its source label in a single operation. Make interpolation field-specific: continuous quantities, circular wind direction, categorical codes, and precipitation intervals require different treatment.
- Key cached data by observer, interval, provider, and requested variables; cancel obsolete requests. Never show another location's values as current while a new request loads.
- Add freshness rules and explicit refresh for current conditions. Handle timeout, offline, rate limiting, invalid payloads, and out-of-range dates with useful recovery actions.
- Give custom weather a coherent model for cloud amount, visibility, haze, wind, and precipitation type/intensity. Derive descriptive text from that model so a rainy custom scene cannot retain a stale “Clear sky” code.

**Time and astronomy contract**

- Store one canonical UTC instant and a separate IANA time zone. Inject the wall clock into logic that depends on “now.”
- Replace the iterative wall-clock solver with a maintained time-zone implementation that supports explicit disambiguation. Reject nonexistent input with an explanation; allow choosing the earlier or later repeated hour, displaying its offset.
- Build the timeline from local midnight to the following local midnight. Its duration can vary; repeated hour labels must be distinguishable. Preserve sub-hour offsets such as Asia/Kathmandu and cover Australia/Lord_Howe transitions.
- Derive daily events separately from instantaneous positions. Filter results to the local-day interval and calculate the union of daylight intervals, including days that start or end in daylight.
- Distinguish “does not rise today,” “does not set today,” polar day/night, unavailable calculations, and errors. Declare whether a displayed event means today or the next occurrence.
- Resolve geolocation time zones from coordinates independently of weather availability. Define elevation semantics and invalid-coordinate/date handling.
- Establish a phase and observer-orientation model shared by the Moon readout, icon, and scene. Correct mislabeled sky patterns and unify layer visibility rules.

**Exit criteria:** forecast requests succeed for a supported fixture location/date; missing values never masquerade as observations; rapid location/date changes cannot leak stale values; DST cases round-trip according to the visible policy; daily events remain inside the selected civil day; the Moon icon and numerical phase agree at new, quarter, and full phases.

### Phase 2 Refactor the application boundaries

Replace the responsibilities concentrated in `App.tsx` and `SkyScene.tsx` with the following boundaries. File count is not the objective; each boundary should have one clear owner and independent verification.

| Boundary | Owns | Must not own |
| --- | --- | --- |
| Domain | Observer, instant, daily events, astronomical positions, units and coordinate transforms | React, fetch calls, Three.js objects |
| Data services | Weather and geocoding adapters, validation, caching, cancellation and provenance | Camera state or presentation defaults |
| Simulation controller | Playback clock, selection, custom weather and derived snapshots | GPU resources |
| Renderer | Camera, layers, uniforms, picking, textures and disposal | Network calls, date parsing or application truth |
| Interface | Location picker, timeline, inspector, settings and accessible summaries | Independent copies of calculation logic |
| Persistence | Versioned preferences, saved places and shareable exploration state | Implicit persistence of exact device location |

- Keep React as the interface layer and a dedicated Three.js renderer behind a small typed API. Replace the global `sky-reset-view` event with explicit camera commands.
- Separate persistent user preferences, shareable simulation state, transient UI state, and remote data. A reducer and focused subscriptions may suffice; add a state library only for a demonstrated need.
- Cache daily events by observer and local day. Update positions at an appropriate simulation cadence and interpolate rendering where validated. Camera dragging must not trigger astronomical recalculation.
- Keep a single renderer lifecycle. Allocate geometry and label resources once, update buffers in place, and dispose when their owner is removed.
- Allocate star buffers from the catalog size; remove the hard-coded capacity of 90 before expanding the catalog.
- Move shaders, camera input, label placement, atmosphere, celestial bodies, and precipitation into testable renderer modules. Retain the current shell while migrating one module at a time.

**Exit criteria:** domain tests run without a DOM or WebGL; data adapters run against fixtures; the scene consumes an immutable snapshot; playback does not recreate unchanged label textures or line topology; mount/unmount leaves no extra loops, listeners, or GPU resources.

### Phase 3 Redesign the exploration interface

**Desktop:** use a compact place/time header, a generous sky viewport, one collapsible inspector, and a bottom timeline. Consolidate the existing location card, celestial panel, weather panel, and footer where they duplicate context. Display deeper coordinates and metadata on demand.

**Mobile:** keep place and time visible in a compact header, retain a small timeline, and open object details, weather, or layers in a single bottom sheet. Use safe-area insets and dynamic viewport height. The idle view should expose most of the sky; panels must scroll internally without hiding their close controls or blocking the timeline.

- Establish tokens for typography, spacing, surfaces, focus, contrast, and motion. Preserve the restrained blue/gold palette, but increase essential text and touch targets. Aim for 44 px primary touch targets as a product choice; verify applicable WCAG 2.2 AA criteria separately. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).
- Turn search into a complete combobox: keyboard navigation, enter-to-select, escape-to-close, loading/error/empty states, and ambiguous-place disambiguation. Include all presets, recent places, and saved places.
- Give geolocation pending, denied, timeout, and unavailable states their own messages and an ordinary search route.
- Improve time travel with previous/next day, now, sunrise/sunset/twilight jumps, visible simulation speed, and an event-marked timeline. Pause playback while editing or scrubbing; make resume deliberate.
- Support drag, pinch, visible zoom/reset controls, and keyboard camera movement. Track pointer identity, separate cancelled gestures from selection, and keep the final compass heading accurate.
- Make Sun, Moon, and stars selectable through both the scene and an accessible object list. Offer “center in view” and a useful explanation when an object is below the horizon.
- Show weather provenance and custom mode near the main view, including when the weather panel is closed. Add readable source time, units, refresh, and reset behavior.
- Add a dismissible first-use hint and an uncluttered viewing mode. Provide reduced-motion behavior and a useful textual sky summary.
- Persist preferences and saved places with a schema version. Share links should restore place, instant, camera, layers, and custom settings; invalid links must produce a clear recoverable state. Make inclusion of precise device coordinates deliberate.

**Exit criteria:** a person can choose a place, change time, inspect an object, adjust weather, and return to now using keyboard or touch; controls remain reachable at 320 px width, short landscape heights, and 200% zoom; no competing panels or timeline overlap; toggle and loading states are announced correctly.

### Phase 4 Improve sky fidelity

Prioritize the images users spend most time looking at: a clear day, golden hour, twilight, a clear night, a cloudy night, and the Moon. Fix geometry and visibility before adding effects.

- **Sun and Moon:** use consistent observer-relative geometry, distance-derived angular sizes, correct phase/bright-limb orientation, and a documented refraction/horizon convention. Replace the procedural Moon texture with a licensed, attributed surface map after validating orientation. The 2D icon and 3D Moon must tell the same story.
- **Stars:** replace the sparse hand-curated set with a licensed catalog containing stable IDs, magnitude, color, epoch, and any motion fields required by the supported date range. Choose catalog size against the performance budget. Add magnitude-based visibility and a deliberate policy for extinction, moonlight, and light pollution.
- **Constellations:** use a documented, attributed line dataset and distinguish constellations from asterisms. Make labeling rules apply to every label type. Add collision avoidance, screen-space sizing, horizon clipping, and fades tied to the chosen display mode.
- **Atmosphere:** create coherent exposure and color transitions across daylight, twilight, and night. Use a shared cloud-transmittance model for the sky, stars, Sun, and Moon so objects disappear behind rendered clouds consistently. Avoid the current abrupt disappearance at 99% total cloud cover.
- **Weather motion:** keep meteorological wind direction consistent across clouds and particles. Bound and recycle precipitation in all axes; particles currently drift in X without being recycled there. Define how atmosphere animation behaves when time is paused or accelerated.
- **Horizon:** make the foreground intentional and keep the default camera looking into the sky. Offer a clear unobstructed horizon and a small set of attractive generic silhouettes, visibly distinguished from actual terrain.
- **Visual stability:** seed procedural effects and handle font loading before generating text textures. Review blending, depth, and tone mapping at different pixel densities.

**Exit criteria:** a fixed visual matrix covers seasons, hemispheres, polar conditions, lunar phases, clear/overcast skies, rain, and snow; objects and labels obey layer and visibility rules; phase geometry agrees with the numeric state; reference checks meet the agreed tolerances; assets and catalogs have traceable licenses.

### Phase 5 Meet performance and resilience targets

The following are initial acceptance targets to confirm on the phase 0 device matrix, not claims about present performance.

| Area | Target |
| --- | --- |
| Camera interaction | Smooth 60 fps desktop / 30 fps midrange mobile, with p95 frame time at or below roughly 20 / 40 ms in the agreed demanding scenes |
| Controls | p95 response below 100 ms for local controls and time scrubbing |
| Startup | Usable shell within 1.5 s and interactive sky within 3 s on the named test network/device profile |
| Resource stability | No monotonic growth in retained label textures, geometries, listeners, or loops during a 30-minute playback and location-switch scenario |
| Data fetching | No weather requests caused solely by frame ticks; obsolete requests cancel and identical coverage requests deduplicate |
| Hidden/background view | Rendering suspends when hidden; playback resume follows an explicit catch-up or pause policy |

- Profile before adding workers. Move bulk catalog transforms or heavier calculations off the UI thread only if measurements justify it.
- Split the interface from the renderer and load large catalogs/textures progressively. Set bundle budgets from the measured baseline; splitting a file alone is not a performance improvement.
- Add adaptive pixel ratio and visual quality tiers. Reduce cost gracefully without changing astronomical state.
- Handle WebGL initialization failure and context loss with an actionable recovery state and an accessible numerical summary. Verify restoration after resize, orientation change, and background/resume.
- Keep preset locations and astronomy usable offline. Label cached weather and stale data explicitly.

**Exit criteria:** recorded profiles meet the agreed budgets; long sessions remain stable; the app handles offline operation, failed assets, unavailable WebGL, and context restoration without losing the selected exploration state.

### Phase 6 Qualify and release

- Run the full validation workflow in CI and create a preview build for review. Document deployment, cache behavior, and rollback before publishing.
- Verify current Chrome, Edge, Firefox, Safari, Android Chrome, and iOS Safari on the agreed support matrix. Include real touch and GPU testing; desktop viewport emulation alone is insufficient.
- Perform manual keyboard and screen-reader checks alongside automated accessibility checks. Include focus return, combobox behavior, sheets, slider value text, contrast, reduced motion, and zoom.
- Cross-check representative astronomical positions and events against an independent reference with the same coordinate frame, refraction assumptions, and event definitions. Record tolerances and differences.
- Exercise network delay, cancellation, malformed/partial data, HTTP 400/429/500, stale caches, corrupt preferences, invalid links, and date boundaries.
- Add useful error reporting with bounded diagnostics; avoid collecting precise coordinates by default. Show friendly recovery paths instead of raw provider failures.
- Review linked attribution, dependency and asset licensing, provider usage terms for the intended deployment, font delivery, metadata, favicon, and help content.
- Run short usability sessions with a few first-time users: find tonight's sky, move to another hemisphere, locate the Moon, change weather, and restore now. Resolve repeated confusion before calling the release polished.

**Exit criteria:** all P0/P1 findings are closed with evidence; the primary tasks pass across the supported platforms; scientific limitations are explicit; source attribution and release/rollback instructions are complete; a fresh user can complete the exploration tasks without coaching.

## Optional expansion after the polished release

These are separate product investments. They should not delay correcting the existing experience.

| Order | Feature | Why it belongs later |
| --- | --- | --- |
| 1 | Venus, Mars, Jupiter, and Saturn with search and object details | Valuable for exploration once body rendering and inspection are reusable |
| 2 | Tonight highlights and guided tours | Depends on reliable events, selection, and visibility semantics |
| 3 | Map picker and curated destinations | Improves discovery after the location contract and mobile navigation are stable |
| 4 | Milky Way, meteor showers, eclipse visualization | Requires additional data, licensing, and scientific validation |
| 5 | Terrain-aware horizons, device orientation, AR, or VR | Separate complexity and platform qualification; pursue only for a clear user need |
| 6 | Accounts, cloud sync, and collaboration | Add only when local saved explorations and sharing show a need |

## First implementation batches

1. Baseline scripts and fixtures; reproduce and correct forecast request construction, with provider error parsing.
2. Replace weather state and sampling with provenance-aware coverage; remove source-value defaults from readouts; add cancellation and freshness.
3. Replace local-time conversion and define civil-day/event behavior; cover DST, polar days, and local midnight.
4. Separate domain snapshots, daily-event computation, simulation clock, and renderer API; retain label and geometry resources.
5. Ship the responsive shell, mobile sheet, complete location picker, and accessible camera/time controls.
6. Correct Moon geometry and sky-layer data, expand the catalog, and improve atmosphere and visibility.
7. Close measured performance, resilience, accessibility, and independent astronomy validation gaps; prepare the release.

Each batch should leave a runnable app and have its own observable acceptance criteria. Avoid mixing unrelated visual redesign, numerical changes, and provider migrations in one review.


