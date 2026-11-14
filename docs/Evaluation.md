## Architecture and layering

The layering is sound, and the renderer is the best boundary. Three.js sits behind a small typed API, loads lazily, and React only touches it through `SkyScene`. The domain code runs without a browser, which is why those tests run in plain Node.

It falls short of the roadmap's Phase 2 plan in two places:

- **`App.tsx` is still the real state controller.** It's 757 lines with 16 `useState` hooks, owns selection, custom weather, the clear-sky preview, panels and sharing, and renders the whole Settings panel inline (lines 552–680). The roadmap gave selection and custom weather to a simulation controller, but `useSimulation` only owns the clock. A reducer plus extracted `SettingsPanel`, `ShareDialog` and `FocusSummary` components would make App a thin shell and let you test flows without rendering everything.
- **The folders don't match the boundaries.** `src/domain/` holds one 16-line validator; the real domain logic lives in `src/lib/`. `lib/weather.ts` mixes the Open-Meteo client, validation, interpolation, UI strings and place search, which isn't weather at all. `services/` contains only the cache.

## Domain and science

This is the strongest area. I checked the observer-relative Moon illumination, the lunar orientation, the bright-limb angle, proper motion and precession; all are correct. Time handling covers daylight-saving gaps and repeated hours, events stay inside the local day, and polar day/night are handled. The JPL/USNO reference tests are a professional touch.

One small gap: stars aren't corrected for atmospheric refraction but the Sun and Moon are, so near the horizon their relative positions are off by up to about 0.5°. Applying `Astronomy.Refraction` per star would be cheap.

## Data layer: three real bugs

Weather handling is otherwise excellent: explicit states, source labels tied to each sample, de-duplicated and cancellable requests, and a stale-cache fallback.

- **Rain shows an hour late.** Open-Meteo reports hourly precipitation as the total for the _preceding_ hour. `selectWeather` uses the sample at or before the current time (`weather.ts:228, 238`). Rain falling 14:00–15:00 is stamped 15:00, so the scene is dry at 14:30 and still raining at 15:30. It should use the first sample at or after the current time.
- **"Use my location" skews temperatures.** It sets `elevation: 0` (`LocationPicker.tsx:106`), and that's sent to Open-Meteo (`weather.ts:113`). Open-Meteo adjusts temperatures to the elevation you give it, so a user in Denver gets sea-level temperatures, roughly 10 °C too warm. Leave the parameter out for device locations so Open-Meteo uses its own elevation map.
- **Shared links overwrite the recipient's layer settings.** A link's layers seed preferences (`App.tsx:67–70`), and any preference change saves the whole object (169–174). Even picking a place triggers a save, so the sender's layer choices become the recipient's defaults.

Network failures also show raw messages like "Failed to fetch" or "signal timed out" in the weather panel and place search. And device coordinates go to Open-Meteo at full precision; rounding to two decimals (about 1 km) loses nothing for weather and fits the app's privacy stance.

## Rendering and performance

The renderer does a lot right: it reuses textures and geometry, renders only when needed, pauses in hidden tabs and recovers from graphics loss. Four costs:

- **All 5,070 stars are recalculated on the CPU every tick.** That's five times a second during playback. The renderer then loops over the catalog three more times, rewriting star sizes that never change (`createSkyRenderer.ts:429`) and rebuilding a 5,070-entry lookup table each time (`celestialLayers.ts:36`). Your measured 3.5 ms on desktop could plausibly be 3–5× that on a midrange phone. At 600× the sky also jumps about 0.5° per tick, so fast playback looks choppy.
  - The usual fix is to treat the stars as one rigid sphere and rotate it with a single matrix each frame on the GPU. You already compute that matrix for the Moon. Playback would then be smooth at any speed, which the planned phone-pointing feature will need anyway.
- **Every camera drag re-renders the whole app.** Each pointer move updates App state (`cameraControls.ts:22`, `App.tsx:314`), but only the compass and the share link use it. Your mobile roadmap already says to keep sensor events out of React; this is the same problem today.
- **"Render only when needed" rarely applies with real weather.** The scene animates whenever cloud cover and wind are both above zero (`createSkyRenderer.ts:313–318`), which is most of the time. Phones run a full-screen cloud shader at 60 fps for drift you can barely see. Add minimum thresholds and cap that animation at 20–30 fps.
- **The Moon texture is never visible in detail.** At the maximum zoom the Moon is under about 16 px across, so the 2K surface map is wasted. Either allow a much deeper zoom for the Sun and Moon, or ship a smaller image. Deeper zoom would also let "Find the Moon" end on an actual Moon rather than a marker circle.

Total JavaScript is about 421 kB gzipped, and the star catalog sits in the main bundle, delaying the first screen. Chrome, Edge and Firefox now support Temporal natively (Safari doesn't yet), so its polyfill could load only when needed.

## UI and UX

The look is polished and consistent, and the time controls are excellent, including correct handling of repeated daylight-saving hours. The main issues:

- **On phones the panel covers the whole sky** (`styles.css:1578–1585`, visible in `refined-mobile.jpg`). Moving a weather slider or toggling a layer shows no visible change; a half-height bottom sheet would fix this.
- **iOS Safari zooms into any input under 16 px**, and the search, date/time and share fields are 12–14 px.
- **Text is small.** Panel body text is 12 px and secondary text 8–10 px; contrast is fine, size isn't.
- **Desktop repeats itself.** The location appears in the header and the big title, the time appears twice, settings has two buttons, and the desktop screenshot shows two "Restore" buttons at once.
- **Stars are hard to tap.** The tap tolerance is fixed at about 5 px at default zoom (`createSkyRenderer.ts:330`); base it on a ~20 px screen radius instead.
- **Safe areas don't work.** `viewport-fit=cover` is missing from `index.html`, so all the safe-area CSS has no effect. The planned installable app will need it.

The 1,790-line stylesheet shows signs of piecemeal edits: unused colour variables, near-duplicate hard-coded colours, and `.scene-hint small` defined four times. Cleaning up the design variables now will make the planned night theme much easier.

## Accessibility

The basics are strong: automated axe checks, careful focus handling, keyboard camera control and reduced-motion support. Four issues:

- **Screen readers will repeat themselves.** The object count in the Objects panel is a live region (`ObjectPanel.tsx:241`), and during playback it changes as stars rise and set, so it keeps getting announced.
- **The text contradicts the picture at twilight.** The visibility explanation treats stars as visible below a Sun altitude of −3°, while the renderer fades them gradually from −18° to −3°. At −6° a fifth-magnitude star is described as visible but drawn nearly invisible. The brightness formula is also copied between the two files; it should be one shared function.
- **Some labels were written for tests.** `aria-label="DATE"` and `"LOCAL TIME"` override the visible labels.
- **`<main>` wraps the header and footer**, so screen readers lose those landmarks.

## Testing and tooling

The tests check real behaviour, CI actions are pinned to exact versions, and the docs are candid about what hasn't been verified yet. The gap is that no test would have caught the three data bugs or the twilight mismatch.

## Priorities

| Priority | Issue                                           | Where                                               |
| -------- | ----------------------------------------------- | --------------------------------------------------- |
| High     | Device elevation skews temperatures             | `LocationPicker.tsx:106`, `weather.ts:113`          |
| High     | Rain shows an hour late                         | `weather.ts:228, 238`                               |
| High     | Phone panel hides the sky                       | `styles.css:1578`                                   |
| Medium   | Shared links overwrite saved layers             | `App.tsx:67, 169`                                   |
| Medium   | Twilight text vs. picture mismatch              | `exploration.ts:57, 75`; `createSkyRenderer.ts:434` |
| Medium   | Repeated screen-reader announcements            | `ObjectPanel.tsx:241`                               |
| Medium   | iOS input zoom                                  | input rules in `styles.css`                         |
| Medium   | Camera drags re-render the app                  | `cameraControls.ts:22`, `App.tsx:314`               |
| Medium   | Constant animation in normal weather            | `createSkyRenderer.ts:313`                          |
| Larger   | Star recalculation on CPU, choppy fast playback | `stars.ts:148`, `createSkyRenderer.ts:424`          |
| Larger   | Split up `App.tsx` and reorganise `lib/`        | `App.tsx`, `src/lib`                                |
