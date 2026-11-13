import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { calculateSky } from '../src/lib/astronomy';
import references from './fixtures/horizons/provenance.json';

// JPL DE441 airless, topocentric coordinates. Refraction is deliberately excluded
// from this independent comparison; the displayed apparent altitude uses the documented model.
for (const entry of references.entries) {
  const text = readFileSync(new URL('./fixtures/horizons/' + entry.file, import.meta.url), 'utf8');
  const rows = text
    .split('$$SOE')[1]
    .split('$$EOE')[0]
    .trim()
    .split('\n')
    .map((line) => line.split(',').map((f) => f.trim()));
  it.each(entry.dates.map((date, i) => ({ date, row: rows[i] })))(
    `${entry.place.name} ${entry.name} agrees with JPL at $date`,
    ({ date, row }) => {
      const place = {
        ...entry.place,
        id: entry.place.name,
        country: 'Reference',
        elevation: entry.place.elevation * 1000,
      };
      const sky = calculateSky(place, new Date(date));
      const body = entry.name === 'sun' ? sky.sun : sky.moon;
      if (entry.name === 'moon-range') {
        const geometricDistance = Math.hypot(Number(row[2]), Number(row[3]), Number(row[4]));
        // The compact lunar theory differs from DE441 by ~10–12 km in these samples.
        // A 20 km regression budget and 100 km display rounding avoid false precision.
        expect(Math.abs(sky.moon.distanceKm - geometricDistance)).toBeLessThan(20);
        return;
      }
      const azimuthError = Math.abs(((body.azimuth - Number(row[3]) + 540) % 360) - 180);
      expect(azimuthError).toBeLessThan(0.02);
      expect(Math.abs(body.geometricAltitude - Number(row[4]))).toBeLessThan(0.02);
      // Horizons observer range includes light-time; Astronomy Engine's Moon range is geometric.
      // Compare lunar distance against the separate simultaneous vector reference above.
      if (entry.name === 'sun')
        expect(Math.abs(body.distanceKm - Number(row[6]) * 149597870.7)).toBeLessThan(1000);
      if (entry.name === 'moon')
        expect(Math.abs(sky.moon.illumination * 100 - Number(row[5]))).toBeLessThan(0.1);
    },
  );
}
