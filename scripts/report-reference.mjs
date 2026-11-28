import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true } });
try {
  await (await server.ssrLoadModule('/src/domain/temporal.ts')).ensureTemporal();
  await (
    await server.ssrLoadModule('/src/domain/stars.ts')
  ).loadStarCatalog(async () => JSON.parse(await readFile('src/data/stars.json', 'utf8')));
  const { calculateSky, calculateDailyEvents } = await server.ssrLoadModule('/src/domain/astronomy.ts');
  const { civilDayStart, wallTimeCandidates } = await server.ssrLoadModule('/src/domain/time.ts');
  const references = JSON.parse(
    await readFile('packages/sky-engine/test/fixtures/horizons/provenance.json', 'utf8'),
  );
  const maxima = {
    azimuthDegrees: 0,
    geometricAltitudeDegrees: 0,
    moonIlluminationPercentagePoints: 0,
    moonGeometricRangeKm: 0,
    sunApparentRangeKm: 0,
    ordinaryEventSeconds: 0,
  };
  for (const entry of references.entries) {
    const text = await readFile('packages/sky-engine/test/fixtures/horizons/' + entry.file, 'utf8');
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
  const events = JSON.parse(await readFile('packages/sky-engine/test/fixtures/usno-events.json', 'utf8'));
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
  // Planets: JPL Horizons observer tables (airless, topocentric) and refracted rise/set tables.
  const { angularDiameter } = await server.ssrLoadModule('/src/lib/exploration.ts');
  const { localDayBounds } = await server.ssrLoadModule('/src/domain/time.ts');
  const planetReferences = JSON.parse(await readFile('tests/fixtures/planets/provenance.json', 'utf8'));
  const tableRows = async (file) =>
    (await readFile('tests/fixtures/planets/' + file, 'utf8'))
      .split('$$SOE')[1]
      .split('$$EOE')[0]
      .trim()
      .split('\n')
      .map((line) => line.split(',').map((field) => field.trim()));
  const planets = {
    azimuthDegrees: 0,
    geometricAltitudeDegrees: 0,
    magnitude: 0,
    illuminationPercentagePoints: 0,
    rangeKm: 0,
    angularDiameterArcsec: 0,
    elongationDegrees: 0,
    eventSeconds: 0,
  };
  for (const entry of planetReferences.observations) {
    const rows = await tableRows(entry.file);
    for (const [index, date] of entry.dates.entries()) {
      const place = {
        ...entry.place,
        id: entry.place.name,
        country: 'Reference',
        elevation: entry.place.elevation * 1000,
      };
      const planet = calculateSky(place, new Date(date)).planets.find((p) => p.id === entry.planet);
      const [azimuth, altitude, magnitude, , illumination, diameter, range, , elongation] = rows[index]
        .slice(3)
        .map(Number);
      const update = (key, value) => (planets[key] = Math.max(planets[key], Math.abs(value)));
      update('azimuthDegrees', ((planet.azimuth - azimuth + 540) % 360) - 180);
      update('geometricAltitudeDegrees', planet.geometricAltitude - altitude);
      update('magnitude', planet.magnitude - magnitude);
      update('illuminationPercentagePoints', planet.illumination * 100 - illumination);
      update('rangeKm', planet.distanceKm - range * 149597870.7);
      update('angularDiameterArcsec', angularDiameter({ ...planet, kind: 'planet' }) * 3600 - diameter);
      update('elongationDegrees', planet.elongation - elongation);
    }
  }
  for (const entry of planetReferences.events) {
    const place = { ...entry.place, id: entry.place.name, country: 'Reference', elevation: 0 };
    const start = civilDayStart(entry.day, place.timezone);
    const { end } = localDayBounds(start, place.timezone);
    const events = calculateDailyEvents(place, start).planets[entry.planet];
    const rows = await tableRows(entry.file);
    for (const [key, flag] of [
      ['rise', 'r'],
      ['set', 's'],
    ]) {
      const expected = rows
        .filter((row) => row[2] === flag)
        .map((row) => Date.parse(row[0] + ' UTC'))
        .find((time) => time >= start.getTime() && time < end.getTime());
      planets.eventSeconds = Math.max(planets.eventSeconds, Math.abs(events[key] - expected) / 1000);
    }
  }
  console.log(JSON.stringify({ ...maxima, planets }, null, 2));
} finally {
  await server.close();
}
