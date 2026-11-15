import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { calculateDailyEvents, calculateSky } from '../src/domain/astronomy';
import { civilDayStart, localDayBounds } from '../src/domain/time';
import { angularDiameter } from '../src/lib/exploration';
import type { PlanetId } from '../src/types';
import references from './fixtures/planets/provenance.json';

// Independent planet references from JPL Horizons (DE441): topocentric, airless observer tables, and
// refracted rise/set tables at one-minute resolution. The limits are recorded in docs/SCIENCE.md;
// `node scripts/report-reference.mjs` prints the largest observed differences.
const AU_KM = 149_597_870.7;

const table = (file: string) =>
  readFileSync(new URL('./fixtures/planets/' + file, import.meta.url), 'utf8')
    .split('$$SOE')[1]
    .split('$$EOE')[0]
    .trim()
    .split('\n')
    .map((line) => line.split(',').map((field) => field.trim()));

type Place = (typeof references.observations)[number]['place'];
const observer = (place: Place, elevationKm = place.elevation) => ({
  ...place,
  id: place.name,
  country: 'Reference',
  elevation: elevationKm * 1000,
});

for (const entry of references.observations) {
  const rows = table(entry.file);
  it.each(entry.dates.map((date, i) => ({ date, row: rows[i] })))(
    `${entry.place.name} ${entry.planet} agrees with JPL Horizons at $date`,
    ({ date, row }) => {
      // Horizons returns rows in time order; the recorded dates are in that order too.
      expect(Date.parse(row[0] + ' UTC')).toBe(Date.parse(date));
      const planet = calculateSky(observer(entry.place), new Date(date)).planets.find(
        (p) => p.id === entry.planet,
      )!;
      const [azimuth, altitude, magnitude, , illumination, diameter, range, , elongation] = row
        .slice(3)
        .map(Number);
      expect(Math.abs(((planet.azimuth - azimuth + 540) % 360) - 180)).toBeLessThan(0.02);
      expect(Math.abs(planet.geometricAltitude - altitude)).toBeLessThan(0.02);
      // Astronomy Engine's photometric models differ from Horizons' (Mallama and Hilton, 2018).
      expect(Math.abs(planet.magnitude - magnitude)).toBeLessThan(0.2);
      expect(Math.abs(planet.illumination * 100 - illumination)).toBeLessThan(0.1);
      expect(Math.abs(planet.distanceKm - range * AU_KM)).toBeLessThan(50_000);
      expect(Math.abs(angularDiameter({ ...planet, kind: 'planet' }) * 3600 - diameter)).toBeLessThan(0.01);
      expect(Math.abs(planet.elongation - elongation)).toBeLessThan(0.02);
    },
  );
}

for (const entry of references.events) {
  it(`${entry.place.name} ${entry.planet} rises and sets with JPL Horizons on ${entry.day}`, () => {
    const place = observer(entry.place, 0);
    const start = civilDayStart(entry.day, place.timezone);
    const { end } = localDayBounds(start, place.timezone);
    const events = calculateDailyEvents(place, start).planets[entry.planet as PlanetId];
    const rows = table(entry.file);
    for (const [key, flag] of [
      ['rise', 'r'],
      ['set', 's'],
    ] as const) {
      const times = rows
        .filter((row) => row[2] === flag)
        .map((row) => Date.parse(row[0] + ' UTC'))
        .filter((time) => time >= start.getTime() && time < end.getTime());
      // Each sample day has one rise and one set of every planet.
      expect(times).toHaveLength(1);
      expect(events[key]).toBeInstanceOf(Date);
      expect(Math.abs(events[key]!.getTime() - times[0])).toBeLessThan(120_000);
    }
  });
}
