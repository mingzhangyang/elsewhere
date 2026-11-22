# Sky moments: SM0-B time and science fixture register

Status: **time semantics specified; SM2 astronomy checks pending**. Based on `main` at `0e76c7f` (November 22, 2026). Inputs are fictional, not personal records. This register complements the human-session script in [`SKY-MOMENT-TEST.md`](SKY-MOMENT-TEST.md); it is not a report of completed scientific validation.

## Frozen rules for SM1-A

- The event place supplies WGS84 latitude/longitude (degrees north/east), elevation (metres) and an **IANA** time zone. Never infer the event zone from the device or the weather provider.
- `exact` records a supplied Gregorian date and `HH:mm` local clock; `reference` records a separate reference clock and its origin. The reference defaults to **22:00 local** and stays a reference when changed. Seconds in the input are zero; stored UTC uses ISO milliseconds.
- A spring gap is an error, not an automatic shift. A fall fold exposes **both** ordered UTC instants with their real offsets, including historical seconds; no default choice. A new place preserves the local date and clock but clears any prior choice.
- The **UTC instant**, not the civil year, must be between `1900-01-01T00:00:00.000Z` and `2100-12-31T23:59:59.999Z`, inclusive. Persist UTC, the original civil date/clock, IANA zone and the offset used. When reading a future saved artwork, verify `UTC + saved offset = saved wall time`; do **not** silently reinterpret a self-consistent record if the device tzdb has since changed.
- SM2 will use the existing apparent-altitude convention, draw the full **above-horizon hemisphere**, put **north at top, east at left**, use a circular azimuthal-equidistant projection, and ignore daylight/weather concealment only in the *diagram* (never the interactive explorer). The initial limiting magnitude is 6.0; star patterns are off by default. The planned fixed layout, restrained two-palette choice and 1200 × 1500 PNG are SM3 goals, not implemented here.

These rules follow [`SKY-MOMENTS-PLAN.md`](SKY-MOMENTS-PLAN.md) §§5–6, 8, 10–11 and agree with [`SCIENCE.md`](SCIENCE.md) and [`ROADMAP.md`](../ROADMAP.md). No conflicting rule was found requiring edits to those documents.

## Deterministic civil-time fixtures (automated in `tests/memorialTime.test.ts`)

| ID | Input: event location; civil time (mode) | Expected result | Method / independent basis |
| --- | --- | --- | --- |
| T01 | New York `America/New_York`; 2026-03-08 02:30 (exact) | No candidate; `nonexistent-time` | `Temporal` IANA transition; compare with [IANA tzdb](https://www.iana.org/time-zones) and New York DST transition rules |
| T02 | New York; 2026-11-01 01:30 (exact) | Explicit choice: `05:30Z` (`-04:00`) **or** `06:30Z` (`-05:00`) | `wallTimeCandidates`, IANA tzdb DST fold |
| T03 | Beijing `Asia/Shanghai` vs New York; 2026-02-15 08:30 (exact) | Beijing `00:30Z`, New York `13:30Z` | IANA time-zone offsets; compare UTC ISO strings, independent of host TZ |
| T04 | New York 2026-11-01 01:30 with DST choice → Beijing | Local date and `01:30` unchanged; old choice removed; UTC becomes 2026-10-31 `17:30Z` | Pure `changeMemorialLocation`, then fresh resolver |
| T05 | New York; 2026-07-16 (reference, time unknown) | Reference source `default`, 22:00 local; UTC 2026-07-17 `02:00Z` | Default rule §5 plus IANA summer offset |
| T06 | Beijing; 2026-07-16, reference user-adjusted to 06:15 | Still reference, source `user`; UTC 2026-07-15 `22:15Z` | Discriminated union and IANA conversion |
| T07 | `UTC`; 2000-02-29 / 1900-02-29; 12:00 | 2000 date accepted; 1900 invalid | Gregorian leap-year arithmetic, Temporal reject overflow |
| T08 | `UTC`; 1900-01-01 00:00; 2100-12-31 23:59 | Both allowed; one minute beyond either bound rejected | `validateInstant` UTC boundary; direct unit checks cover `.000` and `.999` millisecond endpoints |
| T09 | `Etc/GMT+12`; 1899-12-31 12:00 local | Allowed: UTC exactly 1900-01-01 `00:00Z` | UTC boundary, fixed IANA offset (note reversed sign of `Etc/GMT+12`) |
| T10 | Beijing; 2026-01-01 00:15 | UTC 2025-12-31 `16:15Z`; original local date remains Jan 1 | IANA offset and UTC calendar crossing |
| T11 | Paris `Europe/Paris`; 1901-01-01 12:00 | UTC `11:50:39Z`; stored offset `+00:09:21` | IANA tzdb historical Paris mean time; independently check with `Intl.DateTimeFormat` offset, not integer-minute assumptions |
| T12 | Unknown zone, latitude 91°, longitude NaN, `24:00`, `12:60` | Distinct `invalid-timezone`, `invalid-location`, `invalid-time` results | Validation unit tests, no Date auto rollover |
| T13 | New York 2026-11-02 01:30; New York fold with no choice | First resolves directly, second returns two candidates; stale UTC choice rejected | Resolver outcome union; no implicit earlier/later |
| T14 | Previously saved record with altered UTC, offset, or local date | Reject inconsistent fields; accept internally coherent archived offset even when current tzdb differs | `assertMemorialTimeConsistency`, arithmetic of saved UTC + offset |
| T15 | Sydney `Australia/Sydney`, New York `America/New_York`, Tromsø `Europe/Oslo` | Northern/southern observing positions represented separately; **astronomy not yet compared** | Existing `tests/fixtures/locations.ts`, JPL/USNO fixtures listed in `SCIENCE.md` |

Fixture values above are reproducible civil-time expectations, **not** newly acquired independent star-position results. The implementation uses the runtime IANA database; future browser/Node tzdb updates may change pre-modern historical rules, so recorded offsets must be kept when archiving works.

## SM2 reference scenes — definitions, not acceptance results

| ID | Input or mathematical scenario | Expected quantity / rule | Validation plan and reference | Status |
| --- | --- | --- | --- | --- |
| S01 | Synthetic apparent altitude 90° (zenith), any azimuth | `r=0` at circle center | Analytical projection formula in plan §6; direct pure-function test in SM2 | Pending implementation |
| S02 | Synthetic apparent altitude 0° and azimuth N=0°, E=90°, S=180°, W=270° | North top, east **left**, south bottom, west right on rim | Analytic equations `x=cx-Rr sin(az)`, `y=cy-Rr cos(az)`; independent expected coordinates | Pending implementation |
| S03 | New York vs Sydney, same UTC, bright Sun/planet/star around the horizon | Compare apparent altitude/azimuth; center `alt>=0` only | Existing `tests/fixtures/horizons` and `tests/fixtures/planets` with provenance; match refraction conventions in `SCIENCE.md` | Existing astronomy regressions only; SM2 selection not yet tested |
| S04 | New York daytime 2026-06-21 12:00 local | Diagram plots geometrically above-horizon stars even in daylight; interactive sky stays daylight | Existing `calculateSky` plus independently checked ephemerides as appropriate; **no numeric star references assigned yet** | Pending separate display test |
| S05 | Tromsø summer night, Sydney southern winter sky | Verify north/south hemisphere orientation and high-latitude day/night claims | Existing USNO/Horizons cached queries in `tests/fixtures`; create SM2 case-specific expected observations | Pending |
| S06 | Moon in four projection quadrants, near zenith, near mathematical horizon | Illumination from same sky snapshot; transformed bright-limb screen direction, not reused camera angle | New differential/projected direction assertions; independent JPL Horizons or astronomy reference with same epoch and coordinate conventions | Independent crescent-orientation values not yet obtained |
| S07 | New York/Sydney/Tromsø near 1900, 1950, 1980, 2000 and 2100 | Compare selected historical positions only after fixing the reference frame, star catalog, proper motion and precession conventions | [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) / [USNO](https://aa.usno.navy.mil/) and `SCIENCE.md` budget | Reference samples **not acquired**; no science claim |

For future numerical checks, record: source URL/query, response file, retrieval date, observer coordinates/elevation, time scale, apparent vs geometric altitude, refraction convention, reference frame, tolerance and software/catalog versions. The existing JPL/USNO 2026 fixtures are real cited references; extending their applicability to new dates without fresh comparisons is not permitted. SM2 should keep numerical comparisons separate from screenshot-based visual review.
