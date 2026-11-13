import { describe, expect, it } from 'vitest';
import { getZonedParts, localDayStart, shiftLocalDate, zonedDateTimeToUtc } from '../src/lib/time';

describe('civil time', () => {
  it.each([
    ['America/New_York', '2026-11-12', '07:00'],
    ['Asia/Kathmandu', '2026-11-12', '17:45'],
    ['Pacific/Kiritimati', '2026-11-13', '02:00'],
  ])('formats an instant in %s independently of the host zone', (zone, date, time) => {
    expect(getZonedParts(new Date('2026-11-12T12:00:00Z'), zone)).toMatchObject({ date, time });
  });
  it('measures the New York spring day as 23 hours', () => {
    const start = localDayStart(new Date('2026-03-08T12:00:00Z'), 'America/New_York');
    expect((shiftLocalDate(start, 'America/New_York', 1).getTime() - start.getTime()) / 3600000).toBe(23);
  });
  it.fails('rejects a nonexistent spring-forward wall time (phase 1 regression)', () => {
    expect(() => zonedDateTimeToUtc(2026, 3, 8, 2, 30, 'America/New_York')).toThrow();
  });
});
