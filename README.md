# Elsewhere — Interactive Sky Simulator

An immersive React + TypeScript + Three.js application for exploring the sky from different places and times on Earth.

See the [app polish roadmap](ROADMAP.md) for the prioritized refactor, design, fidelity, and release plan.

## Run locally

Requirements: Node.js 22.13+ in the 22.x line or Node.js 24+, and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build:

```bash
npm run build
npm run preview
```

Run `npm run validate` for type checking, lint, tests, and the production build. See [validation and development scenarios](docs/VALIDATION.md).

No API key is required for the Open-Meteo endpoints used by this starter.

## Implemented

- Three.js sky dome with procedural day, twilight, night, cloud, and haze shading.
- 360-degree mouse/touch drag look controls, scroll-to-zoom, compass heading, and reset-view control.
- Sun and Moon positions calculated for the selected observer and instant with Astronomy Engine.
- Sunrise, sunset, solar noon, moonrise, moonset, daylight duration, lunar phase, illumination, and approximate geocentric lunar distance.
- A curated subset of bright stars with J2000 coordinates and visual magnitudes. Star positions are precessed to the date and transformed from equatorial coordinates to local horizontal coordinates using sidereal time and the observer's latitude/longitude.
- Constellation line overlays and major-star labels for a small set of recognizable constellations.
- Location search through Open-Meteo Geocoding, eight quick locations, and browser geolocation after permission is granted.
- Local date/time entry, a 24-hour timeline, play/pause, and 1× / 10× / 60× / 600× time progression. Calculations use JavaScript UTC instants and display the selected location's IANA time zone.
- Open-Meteo hourly weather data for current/forecast dates and historical reanalysis for past dates. Forecast requests explicitly request the 16-day horizon. Hourly timestamps are consumed as UTC Unix times to avoid local-time and DST ambiguity. The UI labels the source and indicates unavailable periods rather than inventing values.
- Historical archive visibility is not provided by the archive endpoint; the app marks that field unavailable instead of presenting a made-up observation. Visibility can still be adjusted in Custom Simulation.
- Weather-driven cloud density/motion, haze, star attenuation, Sun/Moon dimming, and rain/snow particle effects.
- Custom weather controls that affect rendering only; astronomy calculations remain independent.
- Responsive desktop and mobile layouts.

## Current scope and known limitations

This is a working foundation, not yet a full planetarium-grade catalog or a final production release.

- The star catalog is a curated bright-star subset, not the complete Hipparcos or Bright Star Catalog. It is enough to establish recognizable star patterns, but faint-star density and full-sky completeness are limited.
- Constellation lines cover a small selection of patterns. Constellation boundaries, a complete official stick-figure dataset, and Milky Way imagery are not included.
- The Moon's surface map is procedurally generated for this prototype; replace it with a properly licensed lunar texture for scientific/visual fidelity. The phase is produced by directional lighting from the calculated Sun direction.
- The horizon is a generic generated silhouette, not terrain-specific. Observer elevation is passed into astronomical calculations, but no digital elevation model or local obstruction profile is currently loaded.
- Additional planets (Venus, Mars, Jupiter, Saturn), eclipse overlays, a world map picker, and saved locations are not included in this first pass.
- The cloud field is a procedural visual approximation driven by the weather parameters, not a physically simulated 3D cloud volume. Aggregate cloud cover also reduces celestial visibility; it does not reconstruct the exact cloud mask at every azimuth/elevation.
- Open-Meteo forecast availability is limited to the API's forecast horizon (the UI currently uses 16 days). Past dates use the Open-Meteo archive/reanalysis endpoint. Coverage and variable availability can differ by date and location.
- The star positions use precession of J2000 coordinates but do not yet apply individual stellar proper motion or parallax. The curated catalog should be expanded and cross-checked before scientific use.
- The Moon's bright-limb orientation and apparent angular size are simplified for presentation, even though its position and illuminated fraction come from astronomical calculations.

## Data sources and attribution

- [Astronomy Engine](https://github.com/cosinekitty/astronomy) — solar-system positions, rise/set, phase and distance calculations. MIT License.
- [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) — place search.
- [Open-Meteo Weather Forecast API](https://open-meteo.com/en/docs) — current and forecast weather.
- [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) — past weather reanalysis.

Follow Open-Meteo's current attribution and usage terms for the intended deployment and usage volume.
