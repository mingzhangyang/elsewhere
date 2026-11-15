import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Independent, opt-in planet reference refresh from JPL Horizons (DE441). Requests are sequential,
// as JPL's API policy asks, and existing files are reused unless --refresh is given.
const places = [
  { name: 'new-york', longitude: -74.006, latitude: 40.7128, elevation: 0.01, timezone: 'America/New_York' },
  { name: 'sydney', longitude: 151.2093, latitude: -33.8688, elevation: 0.058, timezone: 'Australia/Sydney' },
  { name: 'tromso', longitude: 18.9553, latitude: 69.6492, elevation: 0.01, timezone: 'Europe/Oslo' },
];
const planets = [
  ['mercury', '199'],
  ['venus', '299'],
  ['mars', '499'],
  ['jupiter', '599'],
  ['saturn', '699'],
];
// The Sun and Moon sample dates, plus local midnight in New York at Jupiter's 2026 opposition and an
// evening near Venus's greatest eastern elongation. Horizons returns rows in time order, so the
// list is kept in time order.
const dates = [
  '2026-01-10T05:00:00Z',
  '2026-03-20T12:00:00Z',
  '2026-06-21T12:00:00Z',
  '2026-08-15T00:30:00Z',
  '2026-11-24T02:00:00Z',
  '2026-12-21T12:00:00Z',
];
// Rise and set over one local civil day, matching the USNO Sun and Moon event day. The window is
// wider than the day; the test keeps the events that fall inside it.
const eventDay = '2026-01-15';
const eventPlaces = [
  { ...places[0], elevation: 0, start: '2026-01-15 00:00', stop: '2026-01-16 10:00' },
  { ...places[1], elevation: 0, start: '2026-01-14 08:00', stop: '2026-01-15 18:00' },
];
const directory = new URL('../tests/fixtures/planets/', import.meta.url);
await mkdir(directory, { recursive: true });
const refresh = process.argv.includes('--refresh');

async function fetchTable(file, params) {
  const url = new URL('https://ssd.jpl.nasa.gov/api/horizons.api');
  for (const [key, value] of Object.entries({ format: 'json', ...params }))
    url.searchParams.set(key, key === 'format' ? value : `'${value}'`);
  if (!refresh) {
    try {
      await readFile(new URL(file, directory));
      return url.toString();
    } catch {
      /* No saved fixture: fetch once. */
    }
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw Error(`Horizons HTTP ${response.status}`);
  const data = await response.json();
  if (data.error || !data.result?.includes('$$SOE'))
    throw Error(data.error || 'Unexpected Horizons response');
  await writeFile(new URL(file, directory), data.result);
  console.log(file, data.result.split('$$SOE')[1].split('$$EOE')[0].trim());
  return url.toString();
}

const observations = [];
for (const place of places)
  for (const [planet, command] of planets) {
    const file = `${place.name}-${planet}.txt`;
    const url = await fetchTable(file, {
      COMMAND: command,
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'OBSERVER',
      CENTER: 'coord@399',
      COORD_TYPE: 'GEODETIC',
      SITE_COORD: `${place.longitude},${place.latitude},${place.elevation}`,
      TLIST: dates.map((d) => Date.parse(d) / 86400000 + 2440587.5).join(','),
      TLIST_TYPE: 'JD',
      // Azimuth/elevation, magnitude, illuminated fraction, angular diameter, range, elongation.
      QUANTITIES: '4,9,10,13,20,23',
      APPARENT: 'AIRLESS',
      CSV_FORMAT: 'YES',
      ANG_FORMAT: 'DEG',
      EXTRA_PREC: 'YES',
    });
    observations.push({ place, planet, dates, url, file });
  }
const events = [];
for (const { start, stop, ...place } of eventPlaces)
  for (const [planet, command] of planets) {
    const file = `${place.name}-${planet}-rise-set.txt`;
    const url = await fetchTable(file, {
      COMMAND: command,
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'OBSERVER',
      CENTER: 'coord@399',
      COORD_TYPE: 'GEODETIC',
      SITE_COORD: `${place.longitude},${place.latitude},${place.elevation}`,
      START_TIME: start,
      STOP_TIME: stop,
      STEP_SIZE: '1m',
      TIME_TYPE: 'UT',
      QUANTITIES: '4',
      // Rise, transit and set on the true visual horizon: refracted, for the planet's center.
      R_T_S_ONLY: 'TVH',
      APPARENT: 'REFRACTED',
      CSV_FORMAT: 'YES',
      ANG_FORMAT: 'DEG',
    });
    events.push({ place, planet, day: eventDay, url, file });
  }
await writeFile(
  new URL('provenance.json', directory),
  JSON.stringify({ retrieved: new Date().toISOString(), observations, events }, null, 2) + '\n',
);
