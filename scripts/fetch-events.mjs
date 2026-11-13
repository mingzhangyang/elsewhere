import { writeFile } from 'node:fs/promises';
const cases = [
  { id: 'new-york', coords: '40.7128,-74.006', tz: -5, timezone: 'America/New_York' },
  { id: 'sydney', coords: '-33.8688,151.2093', tz: 11, timezone: 'Australia/Sydney' },
];
const result = [];
for (const place of cases) {
  const url = new URL('https://aa.usno.navy.mil/api/rstt/oneday');
  url.search = new URLSearchParams({
    date: '2026-01-15',
    coords: place.coords,
    tz: String(place.tz),
    dst: 'false',
  }).toString();
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw Error(String(r.status));
  const data = await r.json();
  if (data.error) throw Error(JSON.stringify(data));
  result.push({ place, url: url.toString(), data });
  console.log(place.id, JSON.stringify(data));
}
await writeFile(
  'tests/fixtures/usno-events.json',
  JSON.stringify({ retrieved: new Date().toISOString(), cases: result }, null, 2) + '\n',
);
