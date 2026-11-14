import { expect, it } from 'vitest';
import references from './fixtures/usno-events.json';
import { calculateDailyEvents } from '../src/domain/astronomy';
import { civilDayStart, wallTimeCandidates } from '../src/domain/time';
import type { SkyEvents } from '../src/types';

for (const item of references.cases) {
  const [longitude, latitude] = item.data.geometry.coordinates;
  const location = {
    id: item.place.id,
    name: item.place.id,
    country: 'Reference',
    latitude,
    longitude,
    elevation: 0,
    timezone: item.place.timezone,
  };
  const day = '2026-01-15';
  it(`${item.place.id} ordinary events agree with the USNO to two minutes`, () => {
    const events = calculateDailyEvents(location, civilDayStart(day, location.timezone));
    const map: [keyof SkyEvents, { phen: string; time: string }[], string][] = [
      ['sunrise', item.data.properties.data.sundata, 'Rise'],
      ['sunset', item.data.properties.data.sundata, 'Set'],
      ['solarNoon', item.data.properties.data.sundata, 'Upper Transit'],
      ['twilightDawn', item.data.properties.data.sundata, 'Begin Civil Twilight'],
      ['twilightDusk', item.data.properties.data.sundata, 'End Civil Twilight'],
      ['moonrise', item.data.properties.data.moondata, 'Rise'],
      ['moonset', item.data.properties.data.moondata, 'Set'],
    ];
    for (const [key, rows, phenomenon] of map) {
      const expected = wallTimeCandidates(
        day,
        rows.find((r) => r.phen === phenomenon)!.time,
        location.timezone,
      )[0];
      const actual = events[key];
      expect(actual).toBeInstanceOf(Date);
      expect(Math.abs((actual as Date).getTime() - expected.getTime())).toBeLessThan(120000);
    }
  });
}
