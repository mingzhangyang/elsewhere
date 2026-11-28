import { describe, expect, it } from 'vitest';
import {
  civilDayStart,
  getZonedParts,
  localDayBounds,
  localDayStart,
  shiftLocalDate,
  wallTimeCandidates,
  zonedDateTimeToUtc,
} from '../src/domain/time';

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
  it('rejects a nonexistent spring-forward wall time', () => {
    expect(() => zonedDateTimeToUtc(2026, 3, 8, 2, 30, 'America/New_York')).toThrow();
  });
  it('offers both offsets for a repeated fall hour', () => {
    expect(wallTimeCandidates('2026-11-01', '01:30', 'America/New_York').map((d) => d.toISOString())).toEqual(
      ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z'],
    );
  });
  it('offers no candidates for a spring gap', () => {
    expect(wallTimeCandidates('2026-03-08', '02:30', 'America/New_York')).toEqual([]);
  });
  it.each([
    ['2026-11-01', 'America/New_York', 1500],
    ['2026-03-08', 'America/New_York', 1380],
    ['2026-10-04', 'Australia/Lord_Howe', 1410],
    ['2026-04-05', 'Australia/Lord_Howe', 1470],
    ['2026-11-12', 'Pacific/Kiritimati', 1440],
  ])('preserves civil day %s in %s', (day, zone, minutes) => {
    const start = civilDayStart(day, zone);
    expect(getZonedParts(start, zone).date).toBe(day);
    expect(localDayBounds(start, zone).minutes).toBe(minutes);
  });
  it('rejects invalid dates instead of constraining them', () => {
    expect(() => zonedDateTimeToUtc(2026, 2, 30, 12, 0, 'UTC')).toThrow();
    expect(() => zonedDateTimeToUtc(2200, 1, 1, 12, 0, 'UTC')).toThrow();
  });
});
