import * as Astronomy from 'astronomy-engine';
import { expect, it } from 'vitest';
import { calculateSky } from '../src/domain/astronomy';
import { STAR_CATALOG } from '../src/domain/stars';
import { NEW_YORK, SYDNEY, TROMSO } from './fixtures/locations';

// Compare low stars with astronomy-engine's own apparent, refracted positions for the same catalog
// coordinates. Without refraction the two differ by about 0.5° at the horizon.
it.each(['Sirius', 'Arcturus', 'Vega', 'Capella'])(
  'raises %s near the horizon as the Sun and Moon are',
  (name) => {
    const star = STAR_CATALOG.find((s) => s.name === name)!;
    const observer = new Astronomy.Observer(NEW_YORK.latitude, NEW_YORK.longitude, NEW_YORK.elevation);
    Astronomy.DefineStar(Astronomy.Body.Star1, star.ra, star.dec, 1000);
    const altitudeAt = (date: Date) => {
      const eq = Astronomy.Equator(Astronomy.Body.Star1, date, observer, true, true);
      return Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal').altitude;
    };
    // Find a moment when the star sits about 1° above the horizon.
    let date = new Date('2026-11-12T00:00Z');
    for (let i = 0; i < 1440 && Math.abs(altitudeAt(date) - 1) > 0.15; i++)
      date = new Date(date.getTime() + 60000);
    const reference = altitudeAt(date);
    expect(Math.abs(reference - 1)).toBeLessThan(0.15);
    const ours = calculateSky(NEW_YORK, date).stars.find((s) => s.name === name)!;
    expect(Math.abs(ours.altitude - reference)).toBeLessThan(0.05);
  },
);
it('keeps refracted star altitudes within physical bounds near the zenith', () => {
  for (const star of calculateSky(NEW_YORK, new Date('2026-11-12T04:00Z')).stars)
    expect(star.altitude).toBeLessThanOrEqual(90);
});
it('matches apparent altitudes for bright stars below 10° across observers', () => {
  let samples = 0;
  for (const location of [NEW_YORK, SYDNEY, TROMSO]) {
    const observer = new Astronomy.Observer(location.latitude, location.longitude, location.elevation);
    for (let hour = 0; hour < 48; hour += 3) {
      const date = new Date(Date.UTC(2026, 10, 12) + hour * 3600000);
      for (const star of calculateSky(location, date).stars) {
        if (star.altitude < 0 || star.altitude > 10 || star.magnitude > 3) continue;
        const catalog = STAR_CATALOG.find((s) => s.id === star.id)!;
        Astronomy.DefineStar(Astronomy.Body.Star1, catalog.ra, catalog.dec, 1000);
        const eq = Astronomy.Equator(Astronomy.Body.Star1, date, observer, true, true);
        const reference = Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal').altitude;
        expect(Math.abs(star.altitude - reference)).toBeLessThan(0.05);
        samples++;
      }
    }
  }
  expect(samples).toBeGreaterThan(500);
});
