import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true } });
try {
  const { calculateSky, calculateDailyEvents } = await server.ssrLoadModule('/src/domain/astronomy.ts');
  const { civilDayStart, wallTimeCandidates } = await server.ssrLoadModule('/src/domain/time.ts');
  const references = JSON.parse(await readFile('tests/fixtures/horizons/provenance.json', 'utf8'));
  const maxima = {
    azimuthDegrees: 0,
    geometricAltitudeDegrees: 0,
    moonIlluminationPercentagePoints: 0,
    moonGeometricRangeKm: 0,
    sunApparentRangeKm: 0,
    ordinaryEventSeconds: 0,
  };
  for (const entry of references.entries) {
    const text = await readFile('tests/fixtures/horizons/' + entry.file, 'utf8');
    const rows = text
      .split('$$SOE')[1]
      .split('$$EOE')[0]
      .trim()
      .split('\n')
      .map((line) => line.split(',').map((field) => field.trim()));
    for (const [index, date] of entry.dates.entries()) {
      const sky = calculateSky(
        {
          ...entry.place,
          id: entry.place.name,
          country: 'Reference',
          elevation: entry.place.elevation * 1000,
        },
        new Date(date),
      );
      const row = rows[index],
        body = entry.name === 'sun' ? sky.sun : sky.moon;
      if (entry.name === 'moon-range') {
        maxima.moonGeometricRangeKm = Math.max(
          maxima.moonGeometricRangeKm,
          Math.abs(sky.moon.distanceKm - Math.hypot(Number(row[2]), Number(row[3]), Number(row[4]))),
        );
        continue;
      }
      maxima.azimuthDegrees = Math.max(
        maxima.azimuthDegrees,
        Math.abs(((body.azimuth - Number(row[3]) + 540) % 360) - 180),
      );
      maxima.geometricAltitudeDegrees = Math.max(
        maxima.geometricAltitudeDegrees,
        Math.abs(body.geometricAltitude - Number(row[4])),
      );
      if (entry.name === 'sun')
        maxima.sunApparentRangeKm = Math.max(
          maxima.sunApparentRangeKm,
          Math.abs(body.distanceKm - Number(row[6]) * 149597870.7),
        );
      if (entry.name === 'moon')
        maxima.moonIlluminationPercentagePoints = Math.max(
          maxima.moonIlluminationPercentagePoints,
          Math.abs(sky.moon.illumination * 100 - Number(row[5])),
        );
    }
  }
  const events = JSON.parse(await readFile('tests/fixtures/usno-events.json', 'utf8'));
  const names = {
    sunrise: ['sun', 'Rise'],
    sunset: ['sun', 'Set'],
    solarNoon: ['sun', 'Upper Transit'],
    twilightDawn: ['sun', 'Begin Civil Twilight'],
    twilightDusk: ['sun', 'End Civil Twilight'],
    moonrise: ['moon', 'Rise'],
    moonset: ['moon', 'Set'],
  };
  for (const item of events.cases) {
    const [longitude, latitude] = item.data.geometry.coordinates;
    const observer = {
      id: item.place.id,
      name: item.place.id,
      country: 'Reference',
      longitude,
      latitude,
      elevation: 0,
      timezone: item.place.timezone,
    };
    const day = '2026-01-15';
    const actual = calculateDailyEvents(observer, civilDayStart(day, observer.timezone));
    for (const [key, [body, phenomenon]] of Object.entries(names)) {
      const row = item.data.properties.data[body + 'data'].find((row) => row.phen === phenomenon);
      const expected = wallTimeCandidates(day, row.time, observer.timezone)[0];
      maxima.ordinaryEventSeconds = Math.max(
        maxima.ordinaryEventSeconds,
        Math.abs(actual[key] - expected) / 1000,
      );
    }
  }
  console.log(JSON.stringify(maxima, null, 2));
} finally {
  await server.close();
}
