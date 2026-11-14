# Scientific conventions and reference checks

Elsewhere is an educational sky explorer, not an instrument for navigation, telescope pointing, or eclipse timing. The accepted input range is January 1, 1900 through December 31, 2100 UTC. Local calendar dates at those boundaries can fall in the adjacent year. A supported input range is not a claim of independently established accuracy throughout that range.

## Coordinates and time

The domain stores one UTC instant and a separate IANA time zone. Location changes preserve the instant. Temporal resolves local dates, rejects nonexistent spring-transition times, and exposes both offsets of a repeated hour. The timeline follows actual local midnight boundaries, including 23-, 25-, and fractional-hour days.

Observer latitude and longitude are WGS84 degrees north/east. Elevation is meters above sea level. Presets/search supply elevation where available. Device geolocation deliberately assumes sea level: browser altitude is ellipsoidal and cannot be passed as mean-sea-level height without a geoid conversion. The location label discloses this assumption. Time zones come from the coordinates, independently of weather availability.

Azimuth is clockwise from north. Displayed Sun, Moon, and star altitudes are apparent: they include Astronomy Engine's standard refraction (about 0.5° at the horizon, about 1′ at 45°). The Sun and Moon also carry `geometricAltitude`, which excludes refraction, for reference comparisons. Rise/set uses its limb and atmospheric conventions. Daily events are filtered to the selected civil day. Polar day/night and days missing one event are distinct states. The unobstructed horizon is mathematical; the optional ridge is illustrative.

## Moon and stars

Sun and Moon angular sizes use observer distance. Moon illumination is computed at the observer using Moon-to-Sun and Moon-to-observer vectors. The icon uses the apparent bright-limb angle; the scene uses that geometry plus the IAU lunar pole and prime meridian to orient the surface map. Lunar phase names and waxing/waning use geocentric elongation. Lunar distance is geometric and topocentric, displayed approximately to 100 km. Lunar eclipses and atmospheric differential refraction across the disc are not modeled.

The 5,070-star HYG derivative applies J2000 proper motion and precession, evaluated once per UTC day (they move a star by well under 1″ in a day). Each instant then turns the whole catalog with one equatorial-to-horizontal rotation; the renderer applies that rotation, refraction, and the visibility model per star on the GPU, generated from the same constants as the CPU reference. Star altitude applies the same standard refraction as the Sun and Moon, so low stars keep their places beside them; the airless value is available from `horizontalFromEquatorial`. Annual parallax, nutation, radial motion, and variable brightness are omitted. Magnitude, color, atmospheric extinction, moonlight, and light pollution affect approximate display brightness. These are not calibrated radiometric quantities. Four original simplified line patterns are educational overlays, not a complete constellation atlas.

## Atmospheric presentation

The Moon's shader adds the same foreground atmospheric color as the surrounding sky to its attenuated, sunlit surface. This prevents the unlit hemisphere from becoming a black silhouette in daylight. Surface lighting, earthshine, haze, cloud coverage, and ground colors are illustrative rather than calibrated radiometry. The curved procedural cloud deck attenuates celestial objects through one shared foreground pass; it is not a measured cloud map. The position marker remains visible through clouds and is explicitly labeled as a calculated position. Visibility explanations use broad conditions, not a claim that the selected sightline is cloud-free. Clear-sky preview changes only the rendered atmosphere and keeps original weather values available.

## Independent regression fixtures

Checked on November 13, 2026 against cached responses from [JPL Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html) and the [US Naval Observatory](https://aa.usno.navy.mil/data/api.html). The [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html) defines the reference quantities. Raw responses and query URLs are retained in `tests/fixtures`; tests do not access the network.

JPL DE441 samples cover New York, Sydney, and Tromsø on March 20, June 21, November 24, and December 21, 2026. The comparison is topocentric and airless. Lunar range uses separate simultaneous geometric vectors: Horizons observer-table range includes light-time, while Astronomy Engine's lunar vector is geometric. Comparing those directly would manufacture a range error. The remaining range difference reflects the compact lunar model and is accommodated by explicit display precision and a regression budget.

USNO event samples cover New York and Sydney on January 15, 2026, at sea level with matching local UTC offsets. They include sunrise, sunset, solar transit, civil dawn/dusk, and moonrise/moonset. The reference is rounded to minutes.

| Quantity                                            | Largest observed difference |     Regression limit |
| --------------------------------------------------- | --------------------------: | -------------------: |
| Sun/Moon azimuth                                    |                   0.002021° |                0.02° |
| Sun/Moon geometric altitude                         |                   0.000654° |                0.02° |
| Observer lunar illumination                         |  0.002825 percentage points | 0.1 percentage point |
| Geometric lunar distance                            |                   12.001 km |                20 km |
| Apparent solar distance                             |                  799.817 km |             1,000 km |
| Ordinary daily events                               |              29.492 seconds |          120 seconds |
| Star apparent altitude, 0–10° (vs Astronomy Engine) |                     0.0145° |                0.05° |

Reproduce the maxima with `node scripts/report-reference.mjs`. Refresh references deliberately with `node scripts/fetch-reference.mjs --refresh` and `node scripts/fetch-events.mjs`; review changed results before accepting them. The JPL downloader requests sequentially and reuses existing files by default.

The star row is a consistency check against Astronomy Engine's own refracted positions for the same catalog coordinates (786 samples of magnitude 3 or brighter, three observers, 48 hours), not an independent reference; `tests/starRefraction.test.ts` enforces its limit. These finite samples meet the stated regression limits. They do not qualify every date, near-zenith azimuth, polar grazing event, extreme elevation, or real atmospheric condition. Domain tests cover polar and DST semantics, but broader independent review remains a release qualification item.
