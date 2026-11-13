import { mkdir, writeFile, readFile } from 'node:fs/promises';

// Independent, opt-in reference refresh. Sequential requests respect JPL's API policy.
const cases = [
  { name: 'new-york', longitude: -74.006, latitude: 40.7128, elevation: 0.01, timezone: 'America/New_York' },
  { name: 'sydney', longitude: 151.2093, latitude: -33.8688, elevation: 0.058, timezone: 'Australia/Sydney' },
  { name: 'tromso', longitude: 18.9553, latitude: 69.6492, elevation: 0.01, timezone: 'Europe/Oslo' },
];
const dates = [
  '2026-03-20T12:00:00Z',
  '2026-06-21T12:00:00Z',
  '2026-11-24T02:00:00Z',
  '2026-12-21T12:00:00Z',
];
await mkdir(new URL('../tests/fixtures/horizons/', import.meta.url), { recursive: true });
const entries = [];
for (const place of cases)
  for (const [name, command] of [
    ['sun', '10'],
    ['moon', '301'],
    ['moon-range', '301'],
  ]) {
    const url = new URL('https://ssd.jpl.nasa.gov/api/horizons.api');
    const params = {
      format: 'json',
      COMMAND: command,
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'OBSERVER',
      CENTER: 'coord@399',
      COORD_TYPE: 'GEODETIC',
      SITE_COORD: `${place.longitude},${place.latitude},${place.elevation}`,
      TLIST: dates.map((d) => Date.parse(d) / 86400000 + 2440587.5).join(','),
      TLIST_TYPE: 'JD',
      QUANTITIES: '4,10,20',
      APPARENT: 'AIRLESS',
      CSV_FORMAT: 'YES',
      ANG_FORMAT: 'DEG',
      EXTRA_PREC: 'YES',
    };
    if (name === 'moon-range') {
      for (const key of ['QUANTITIES', 'APPARENT', 'ANG_FORMAT', 'EXTRA_PREC']) delete params[key];
      Object.assign(params, {
        EPHEM_TYPE: 'VECTORS',
        VEC_TABLE: '1',
        VEC_CORR: 'NONE',
        OUT_UNITS: 'KM-S',
        REF_PLANE: 'FRAME',
        TIME_TYPE: 'UT',
      });
    }
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, key === 'format' ? value : `'${value}'`);
    const filename = `${place.name}-${name}.txt`;
    try {
      if (!process.argv.includes('--refresh')) {
        await readFile(new URL('../tests/fixtures/horizons/' + filename, import.meta.url));
        entries.push({ place, name, dates, url: url.toString(), file: filename });
        continue;
      }
    } catch {
      /* No saved fixture: fetch once. */
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw Error(`Horizons HTTP ${response.status}`);
    const data = await response.json();
    if (data.error || !data.result?.includes('$$SOE'))
      throw Error(data.error || 'Unexpected Horizons response');
    await writeFile(new URL('../tests/fixtures/horizons/' + filename, import.meta.url), data.result);
    entries.push({ place, name, dates, url: url.toString(), file: filename, api: data.signature });
    console.log(filename, data.result.split('$$SOE')[1].split('$$EOE')[0].trim());
  }
await writeFile(
  new URL('../tests/fixtures/horizons/provenance.json', import.meta.url),
  JSON.stringify({ retrieved: new Date().toISOString(), entries }, null, 2) + '\n',
);
