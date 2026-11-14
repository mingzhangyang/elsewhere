# Product direction: making Elsewhere stand out

Status: proposal for discussion, November 14, 2026. It does not replace the [app roadmap](../ROADMAP.md) or the [mobile roadmap](MOBILE_ROADMAP.md); where it disagrees with them, that is called out below and is a decision for the project owner.

## Summary

Do not lead with phone pointing. Lead with what Elsewhere already does that sky apps do not: **the sky of a particular moment, anywhere, as it really was**, with that moment's weather and an honest explanation of what you could see. Build in this order:

1. Planets (a gap that breaks the first beginner question).
2. **Sky moments**: shareable, keepsake-quality views of a moment and place. The flagship.
3. **Will I see it?**: a planner for the next few nights that combines forecast cloud, Moon and twilight. The reason to return.
4. Two skies side by side: the same moment from two places.
5. Installable app and device qualification as groundwork, not as the selling point.

## Why not phone pointing

`MOBILE_ROADMAP.md` names "point the phone at the sky" as the distinctive feature of the mobile edition. It is a good feature, but not a distinctive one. Sky Guide, Star Walk, SkySafari and Stellarium Mobile have shipped it for years, with larger catalogs, planets, and polished calibration. Competing there makes Elsewhere a late entrant on its competitors' strongest ground. Pointing remains worth doing later as a convenience; it should not carry the product's identity.

## What is distinctive already

Three things Elsewhere already does are rare in combination:

- **Any place, any time.** Dates from 1900 through 2100 at any location, not only "what is above me now".
- **Real weather in the sky.** Forecast, recent and historical reanalysis (back to 1940) drive clouds, haze and precipitation, with provenance labelled.
- **An honest voice.** Visibility explanations say why something can or cannot be seen: cloud, twilight, light pollution, the horizon. Illustrative parts are labelled as such.

Together these support one idea: **the sky of a moment that matters to someone**. "The sky over Tromsø the night you were born, with that night's clouds." "Tonight's Moon, as your family 7,000 km away sees it." Star-map apps chart the present; printed star-map posters are static and weatherless. The name and tagline ("elsewhere", "a little perspective") already point this way.

## Proposed sequence

### 1. Planets

"What is that bright star?" is the most common beginner question, and the answer is often Venus or Jupiter. Without planets the promise of "find it and understand it" fails at the first try. Astronomy Engine already computes them, and the existing body rendering, object panel, visibility explanations and focus framing can be reused, so the cost is low. This is also first in `ROADMAP.md`'s optional expansion list.

### 2. Sky moments (flagship)

Share links already preserve place, instant, camera, layers and weather mode. What is missing is something worth sending, and a good arrival for the person who opens it.

- **Save as image**: the sky at that moment with place, local time, Moon phase and that night's conditions, in a postcard layout. Render it in the browser from the existing canvas first; it needs no server.
- **Guided arrival**: a shared link opens with the camera turning to the subject (the Moon, a planet, a constellation) and one sentence about that sky, before revealing the full interface.
- **Growth loop**: each shared moment brings in a new viewer who can make their own.

### 3. Will I see it? (retention)

A planner for the next few nights that turns forecast cloud cover, Moon phase and altitude, and twilight into plain answers: "Best chance to see the Moon and Jupiter: Thursday at 20:00; cloud clears after midnight." Astronomy-weather tools tend to be technical, and sky apps make little use of weather, so this fills a real gap. It reuses the forecast data, event search and visibility model the app already has.

### 4. Two skies side by side

The same instant from two places: your city and a friend's, home and the place you are travelling to. It is the most literal expression of "elsewhere" and produces natural things to share.

### 5. Groundwork, not headline

Keep the installable web app, physical-device baseline, accessibility checks and offline lifecycle from `MOBILE_ROADMAP.md`; they are prerequisites for everything above. Defer phone pointing, AR, accounts and sync until the moments and planner show traction.

## Risks and constraints

- **Accuracy of historical clouds.** Reanalysis resolves weather at roughly 25 km; cloud shapes are illustrative. The app already labels this. Keepsake images must carry the same honesty, for example "Clouds based on reanalysis for this area" rather than implying a photograph.
- **Weather data terms.** Confirm Open-Meteo's terms for the intended deployment, especially any commercial use, before a public launch.
- **Image rendering.** Client-side capture must match the on-screen sky (labels, scrim, theme) and stay within memory limits on phones; test on the device baseline from the mobile roadmap.

## How to validate before building

Show a rough prototype of a sky moment (a static image and a share link with a guided arrival) to five or six people unfamiliar with the project. Observe whether they want to send it to someone, and to whom. Unfamiliar-user sessions are already an open item in the release checklist; this gives them a concrete question to answer. If the response is weak, the planner (step 3) is the stronger first bet.

## Measures of success

- Shared moments created per active user, and the share of opened links whose viewers go on to make one of their own.
- Return visits to the planner in the days before a forecast-dependent event.
- Time from opening a shared link to seeing its subject.

## Open decision

Adopting this direction changes the stated distinctive feature in `MOBILE_ROADMAP.md`. If accepted, that document should be updated to make pointing a later convenience and to schedule sky moments and the planner after the installable beta. Planets are worthwhile under either direction and can start immediately.
