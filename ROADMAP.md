# Elsewhere roadmap

Status: current plan, November 14, 2026. It replaces the refactor roadmap, the mobile roadmap and the product direction proposal, which are now in the [archive](docs/archive/README.md). Release gates stay in [RELEASE.md](docs/RELEASE.md), evidence in [VALIDATION.md](docs/VALIDATION.md), and scientific conventions in [SCIENCE.md](docs/SCIENCE.md).

## Summary

Elsewhere shows **the sky of a particular moment, anywhere, as it really was**: the calculated sky at that place and time, that moment's weather, and a plain explanation of what you could see. That combination, not phone pointing, is what should make it stand out.

Build in this order:

0. **Go live on Cloudflare.** Deploy and close the remaining release gates that a public beta needs.
1. **Planets.** The answer to "what is that bright star?" is often Venus or Jupiter.
2. **Chinese and English.** Before the interface gains many more sentences.
3. **Prototype a sky moment** and test it with people new to the app.
4. **Sky moments**: keepsake images, realistic or illustrated (cartoon style), and shared links that open on their subject. The flagship.
5. **Horizon scenery**: illustrative mountains, snow peaks, forest, sea or city at the horizon.
6. **Will I see it?** A planner for the next few nights, together with a red night theme and the installable web app, for use outdoors.
7. **Two skies side by side.**

Phone pointing, real terrain horizons and a general light theme are deferred, and the cartoon style is for exported images only; see [Deferred](#deferred).

## Decisions

Made by the project owner on November 14, 2026:

| Decision                                                                                                                 | Consequence                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host on Cloudflare Workers at `elsewhere.orangely.xyz`, deployed by Cloudflare's Git integration on every push to `main` | Static hosting now, and a place to run small code later, such as per-link previews, without a separate server. See [phase 0](#0-go-live-on-cloudflare-sm).                                              |
| MIT licence for Elsewhere's own code and documentation                                                                   | No commercial plans and permissive dependencies; MIT is the simplest licence that lets others learn from and reuse the code. Bundled data keeps its own licences (the star catalog stays CC BY-SA 4.0). |
| Stay on Open-Meteo's free tier for now                                                                                   | The free tier is for non-commercial use, so no ads, subscriptions or paid features while it is in use. Weather requests stay in the visitor's browser. Revisit before any form of income.               |
| Cartoon style only for exported images                                                                                   | The live view stays realistic. The illustrated style is a second way to draw a sky moment. See [phase 4](#4-sky-moments-l).                                                                             |

## Where things stand

- The refactor in the [archived refactor roadmap](docs/archive/refactor-roadmap.md) is implemented through phase 5. Every finding in the [code evaluation](docs/archive/code-evaluation.md) is fixed.
- GitHub Actions passes on `main`: validation, formatting and audit on Linux and Windows with Node 22 and 24, and the Playwright browser suite on Linux (Chromium, Firefox, WebKit, mobile emulation, production offline).
- Startup loads about 100 kB of JavaScript (gzip); the star catalog arrives afterwards.
- The sky has the Sun, the Moon, the five naked-eye planets and 5,070 stars (347 with proper names). Phase 1 (planets) is implemented; see [below](#1-planets-m).
- Weather comes from Open-Meteo: forecast up to 15 days ahead, recent days, and historical reanalysis back to 1940. The astronomy covers 1900–2100.
- The interface is English only. The horizon is either flat or a procedural ridge.
- The app is live at `https://elsewhere.orangely.xyz`, deployed by Cloudflare on every push to `main`. Headers, precached files and an offline reload in Chromium pass there. Cloudflare's bot-detection script stays on and is disclosed in the privacy notes.
- **Not yet done:** physical phones, screen readers, the 30-minute GPU soak, unfamiliar-user sessions and broader scientific review. See [RELEASE.md](docs/RELEASE.md).
- Shared links keep their state after `#` (`src/App.tsx`), which browsers never send to a server. That keeps them private, and it also means a server cannot read them to build a preview.

## Why this direction

Sky Guide, Star Walk, SkySafari and Stellarium Mobile have offered "point your phone at the sky" for years, with larger catalogs and polished calibration. Leading with it would make Elsewhere a late entrant on its competitors' strongest ground.

Three things Elsewhere already does are rare together:

- **Any place, any time.** Not only "what is above me now".
- **Real weather in the sky**, with its source labelled: forecast, recent or historical reanalysis.
- **An honest voice.** Visibility explanations say why something can or cannot be seen, and illustrative parts are labelled as such.

Together they support one idea: the sky of a moment that matters to someone. "The sky over Tromsø the night you were born, with that night's clouds." "Tonight's Moon, as your family 7,000 km away sees it." Star-map apps chart the present; printed star-map posters are static and have no weather. The name and the tagline ("a little perspective") already point this way.

## Principles

These carry forward from the earlier roadmaps and apply to every phase.

1. **Audience:** curious people exploring the sky and learning where things appear. Research-grade use would be a separate qualification effort.
2. **Realistic by default.** Any stylization or enhancement is a named display setting and never changes calculated positions, times or visibility.
3. **Say where everything comes from.** Calculated, from a weather model, chosen by the visitor, or illustrative. Missing data stays missing. Images and shared links carry the same labels as the screen.
4. **Disclose little.** Shared moments use city-level coordinates by default; precise device coordinates are shared only when the person chooses to share them. Diagnostics and any measurement avoid coordinates.
5. **Every batch leaves a runnable app** with its own observable acceptance criteria. Do not mix visual redesign, numerical changes and provider migrations in one review.
6. **Keep the test matrix deliberate.** Languages, themes and styles multiply the screenshot and contrast checks. Add a new dimension only with a plan for how it is tested.

## Phases

Sizes are relative (S, M, L) for one developer and are planning guides, not commitments.

### 0. Go live on Cloudflare (S–M)

**Hosting.** A Worker named `elsewhere` serves `dist/` as static assets at `elsewhere.orangely.xyz`; Cloudflare's Git integration builds and deploys each push to `main`. Setup and release steps are in [RELEASE.md](docs/RELEASE.md#build-and-deploy). Already in the repository:

- `wrangler.jsonc`: static assets only, the custom domain, and no `workers.dev` or preview URLs, so shared links have one origin.
- `public/_headers`: hashed files under `/assets/` are immutable; the shell and `sw.js` revalidate. The Moon map is now bundled by Vite so that every file under `/assets/` has a content hash, and the build check enforces it.
- The service worker no longer precaches `_headers`, which Cloudflare does not serve, and stores plain copies of redirected responses, because Cloudflare redirects `/index.html` to `/`. Without that change, the app did not open offline on Cloudflare's runtime at all.
- `npm run check:deployment` checks the live site after each deployment.

Still to do: the dashboard setup, the first deployment, required status checks on `main` (Cloudflare deploys whatever reaches it), and one rehearsed rollback. Static asset requests are not Worker invocations; run Worker code only on routes that need it (link previews later), and check the free-plan limits before phase 4.

**Weather on the free tier.** Keep every Open-Meteo request in the visitor's browser. Routing them through the Worker would put every visitor's requests on Cloudflare's addresses and against one set of free-tier limits. Keep the attribution that the app and `public/credits.html` already show (CC BY 4.0), and add it to exported images.

**Also in this phase:** a first round on physical phones (one midrange Android, one iPhone) and with a screen reader, fixing whatever blocks the primary tasks.

Planets can be built in parallel.

**Done when:** the public URL serves the qualified build with the cache headers from RELEASE.md; share links and offline reload work there; a rollback has been rehearsed; device and screen-reader findings are recorded with the build identifier.

### 1. Planets (M)

**Status:** implemented November 15, 2026. Reference fixtures and tolerances are in [SCIENCE.md](docs/SCIENCE.md#independent-regression-fixtures); browser cases tap an evening Venus and a midnight Jupiter, and reopen a shared link centered on Jupiter. Physical-device checks follow phase 0.

Add Mercury, Venus, Mars, Jupiter and Saturn. Astronomy Engine already computes them. Reuse body rendering, the Objects panel, search, focus framing, rise and set, and visibility explanations. Draw them at their calculated magnitude; Venus's phase belongs in the object details.

**Done when:** independent reference fixtures (as for the Sun and Moon) meet recorded tolerances and are documented in [SCIENCE.md](docs/SCIENCE.md); "what is that bright point?" can be answered for an evening Venus and a midnight Jupiter; share links can focus a planet.

### 2. Chinese and English (M)

Every phase after this one adds sentences, so the cost of translating grows the longer it waits.

- Move all interface text into message catalogs. Visibility explanations are currently assembled from fragments (`src/lib/exploration.ts`); rewrite them as whole-sentence messages with placeholders, plurals and choices, because word order differs between languages.
- Format dates, times and numbers with the active locale instead of the hard-coded `en-US` (`src/domain/time.ts`, `src/components/TimeConsole.tsx`).
- Choose the language from the browser, offer an override in Settings and remember it. Set `lang` on the document.
- Star names: use common Chinese names for the bright named stars (天狼星, 织女星). Do not map traditional Chinese asterisms onto IAU constellations; they are different systems.
- Sky labels are drawn into canvas textures (`src/renderer/resources.ts`); wait for the CJK font before drawing them, and check label widths and collision spacing.
- Place search can pass `language` to Open-Meteo geocoding.
- Load each language as its own chunk so the startup budget holds.
- Shared links carry no language: the recipient sees their own. A keepsake image uses the sender's language.

**Done when:** a test fails if any key is missing from a language; no visible English remains in Chinese, checked by browser screenshots at desktop and 390 × 844; axe and the contrast checks pass in both languages; the startup bundle stays within budget.

### 3. Prototype and test a sky moment (S)

Build the cheapest convincing version: a static image of a chosen moment and a share link that turns to its subject. Show it to five or six people new to the app (this also covers the unfamiliar-user gate in [RELEASE.md](docs/RELEASE.md)). Observe whether they want to send it, and to whom. Try the realistic image against an illustrated (cartoon-style) one, and the ridge against horizon scenery (phase 5), as variants. A hand-made illustration is enough for the test; the illustrated renderer comes in phase 4.

**Decision:** if the response is strong, build phase 4; if it is weak, build the planner (phase 6) first.

### 4. Sky moments (L)

- **Save as image.** A postcard layout: the sky, the place, local time, Moon phase and that night's conditions, made in the browser. Two styles: realistic and illustrated.
- **Realistic image**, captured from the live renderer:
  - The renderer does not keep its drawing buffer, so capture in the same frame as the render, or render off-screen at the export size.
  - The place line, compass and target marker are HTML, not canvas; compose the postcard on a 2D canvas.
  - Star point sizes depend on pixel ratio; check that an export at a higher resolution looks like the screen.
  - Respect phones' maximum render-buffer size and memory.
- **Illustrated (cartoon-style) image.** Draw it from the same calculated snapshot (star and planet positions, Moon phase, Sun altitude, cloud cover, horizon scenery) with a separate 2D canvas or SVG drawing module, not by restyling the WebGL scene. That keeps the cost to one drawing module and one set of artwork, leaves the live view untouched and avoids WebGL capture limits on phones.
  - Positions stay calculated; only the drawing is stylized. Bright stars and planets in their true places are what make it this sky rather than a generic picture.
  - The image says "Illustration" next to the place and time.
  - Because `src/domain` has no browser dependencies, the same module could later draw link-preview images in the Worker.
- **Both styles** carry the provenance line ("Clouds based on reanalysis for this area") and attribution for the weather data (Open-Meteo, CC BY 4.0) and the star catalog (HYG, CC BY-SA 4.0).
- **Guided arrival.** A shared link opens with the camera turning to its subject (the Moon, a planet, a constellation) and one sentence about that sky before the full interface appears. The subject is a new share-link field: bump the schema version and keep reading old links.
- **Link previews.** A chat app shows a preview of a link only from Open Graph tags in the page the server returns. The Worker can write those tags per link (with `HTMLRewriter`), but it cannot see anything after `#`.
  - Give moment links a path or query the Worker can read, for example `/m?…`, holding only what the preview shows: the city-level place, the time, the subject and a short summary of conditions encoded by the sender's app. The app reads the same link. Anything a server can read can also appear in its logs, so nothing more precise goes there.
  - Step 1: per-link title and description with one generic image. Step 2: a per-moment image drawn by the Worker with the illustrated module.
  - The Worker never calls Open-Meteo; conditions come from the link. This keeps weather requests in browsers and within the free tier.
- **Privacy.** Default to city-level coordinates and print only the place name on images.

**Done when:** realistic images match the on-screen sky, and illustrated images put objects in the same places, in both languages on the test phones; old `#` links and new moment links restore; a moment link shows its own title and description when pasted into a chat app; the time from opening a link to seeing its subject is measured.

### 5. Horizon scenery (M)

Today's horizon is flat or a procedural ridge (`src/renderer/createSkyRenderer.ts`). Add a set of illustrative silhouettes the visitor chooses: distant mountains, snow peaks, forest, sea and city skyline.

- Label them as illustrative, as the ridge is now.
- Keep them within about 1–2° of altitude so they never hide an object the app reports as visible. A visible scene that contradicts the visibility explanation would break the app's honest voice.
- Do not guess the scenery from the location; a coastal city shown with snow peaks would mislead. Real terrain is the honest automatic version, and is deferred.
- Link them to existing data where it is honest: city lights glow according to the light-pollution setting; the sea can reflect the Moon; snow can follow Open-Meteo's `snow_depth` for that night.
- Use generic shapes, not real named landmarks.
- At night the silhouettes are nearly black outlines, which are cheap to draw; check twilight and daytime lighting, and phone frame times.

**Done when:** each scene renders by day, at twilight and at night within the frame-time targets; label layout and object picking treat the scenery correctly; the illustrative label appears in the interface and on images.

### 6. Will I see it?, night theme and installable app (L)

- **Planner.** For the next few nights, combine forecast cloud, Moon phase and altitude, twilight and planet positions into plain answers: "Best chance to see the Moon and Jupiter: Thursday at 20:00; cloud clears after midnight."
  - Say how far to trust it: cloud forecasts lose skill after two or three days, and high thin cloud matters differently from low cloud.
  - Light pollution is the visitor's illustrative setting, so the answer names the setting it assumed.
  - Weather is requested one day at a time today; the planner needs a multi-day request.
- **Red night theme** for the controls, labels and panels, for dark-adapted eyes outdoors.
- **Installable web app**: manifest, icons, standalone display, and the installed offline lifecycle tested on the phones from phase 0.

**Done when:** planner answers agree with a set of recorded forecast and astronomy cases; the night theme passes its contrast checks; installation, offline relaunch and updates pass on Android and iPhone.

### 7. Two skies side by side (M)

The same instant from two places. Render both with one renderer and a split viewport rather than two WebGL contexts, which would double the load on phones. Share and export both halves together.

## Ideas reviewed

| Idea                                          | Decision                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multilingual interface                        | **Do early** (phase 2), Chinese and English first. Shared moments between places and families are naturally multilingual, and the cost grows with every new sentence.                                                                                                                                                                    |
| Light mode                                    | **Not as a general theme.** The sky is the main surface and is dark at night; light panels over it would glare, and outdoors the need is a red night theme. Use light styling where nothing sits over the sky: postcard exports and the credits page. The colour tokens make a full theme possible later if people ask for it.           |
| Cartoon world                                 | **Exported images only** (decided November 14). A cartoon live view would conflict with realistic by default and need a second art direction across sky, clouds, Moon, stars and ground. As an export style it costs one 2D drawing module, may suit gifts better than a realistic image, and is tested in phase 3 and built in phase 4. |
| Horizon elements (mountains, sea, city, etc.) | **Do** (phase 5) as illustrative silhouettes the visitor chooses, kept low enough not to contradict visibility. Real terrain is the later, distinctive version.                                                                                                                                                                          |
| Phone pointing                                | **Deferred.** Common in competing apps; reconsider as a convenience once sky moments and the planner show use.                                                                                                                                                                                                                           |

## Deferred

| Feature                                   | Why later                                                                                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone pointing, Android and iOS editions  | Reconsider after phase 6. The [archived mobile roadmap](docs/archive/mobile-roadmap.md) (phases 2–5) has the sensor contract, the Capacitor approach and the qualification steps. |
| Real terrain horizons from elevation data | Makes "as it really was" stronger and could account for mountains in sunrise times, but needs elevation data, licensing and probably a server. Revisit after phase 5.             |
| Cartoon-style live view                   | Not planned; the style is for exported images. See [Ideas reviewed](#ideas-reviewed).                                                                                             |
| General light theme                       | See [Ideas reviewed](#ideas-reviewed).                                                                                                                                            |
| Map picker and curated destinations       | Useful for discovery; pairs well with two skies.                                                                                                                                  |
| Milky Way, meteor showers, eclipses       | Need more data, licensing and scientific validation.                                                                                                                              |
| Accounts, cloud sync, AR, VR              | Only when saved explorations and sharing show a need.                                                                                                                             |

## Acceptance targets

Initial targets, carried from the earlier roadmaps; confirm them on the phase 0 devices and record measurements with the build identifier.

| Area               | Target                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Rendering          | 60 fps desktop and 30 fps midrange phone; p95 frame interval at or below about 20 / 40 ms in demanding scenes            |
| Controls           | p95 response below 100 ms for time scrubbing and ordinary controls                                                       |
| Startup            | Usable shell within 1.5 s and interactive sky within 3 s on the named network and device profile                         |
| Resource stability | No sustained growth in geometries, textures, listeners or loops over a 30-minute playback and location-switch session    |
| Accessibility      | Primary tasks complete with VoiceOver and TalkBack, 200% zoom, text scaling and reduced motion                           |
| Offline            | The sky and saved or shared explorations work after caching; weather and place search report that they need a connection |

## Measuring success

The app collects no analytics, and the privacy principle above limits what it may collect. Before phase 4, decide how to measure. Once moment links pass through the Worker, Cloudflare's own aggregate request counts for them give a measure without adding a tracker; anything more needs aggregate counts with no identifiers and no coordinates. Otherwise rely on sessions with users. What to look at:

- Moments shared per active visitor, and how many people who open a shared link go on to make their own.
- Return visits to the planner in the days before a forecast-dependent event.
- Time from opening a shared link to seeing its subject.

## Open decisions

For the project owner:

1. The moment-link format for previews (phase 4): what a server may read, against the privacy of `#` links.
2. Languages after Chinese and English.
3. How success is measured (see above).

Constraint to revisit: the Open-Meteo free tier rules out commercial use. Choose a paid plan or another provider before adding any income.
