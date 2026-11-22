import { describe, expect, it } from 'vitest';
import { MAX_INSTANT, MIN_INSTANT, validateInstant } from '../src/domain/time';
import {
  assertMemorialTimeConsistency,
  changeMemorialLocation,
  createReferenceDraft,
  resolveMemorialTime,
  setReferenceTime,
  type MemorialTime,
  type MemorialTimeDraft,
} from '../src/lib/memorialTime';
import { PRESETS } from '../src/lib/locations';
import type { LocationInfo } from '../src/types';

const ny = PRESETS.find((place) => place.id === 'new-york')!;
const beijing = PRESETS.find((place) => place.id === 'beijing')!;
const sydney = PRESETS.find((place) => place.id === 'sydney')!;
const utc: LocationInfo = { ...ny, id: 'utc', timezone: 'UTC' };
const paris: LocationInfo = { ...ny, id: 'historical-paris', timezone: 'Europe/Paris' };

function exact(location: LocationInfo, localDate: string, localTime: string): MemorialTimeDraft {
  return { state: 'draft', kind: 'exact', location, localDate, localTime };
}

async function resolved(draft: MemorialTimeDraft): Promise<MemorialTime> {
  const result = await resolveMemorialTime(draft);
  if (result.status !== 'resolved') throw new Error(`Expected resolved time, got ${result.status}`);
  return result.value;
}

describe('memorial event time (SM1-A)', () => {
  it('rejects New York spring-forward gap without changing the local clock', async () => {
    expect(await resolveMemorialTime(exact(ny, '2026-03-08', '02:30'))).toMatchObject({
      status: 'error',
      code: 'nonexistent-time',
    });
  });

  it('requires a deliberate choice for both New York fall-back instants', async () => {
    const draft = exact(ny, '2026-11-01', '01:30');
    const result = await resolveMemorialTime(draft);
    expect(result.status).toBe('ambiguous');
    if (result.status !== 'ambiguous') return;
    expect(result.candidates).toEqual([
      { utc: '2026-11-01T05:30:00.000Z', offset: '-04:00' },
      { utc: '2026-11-01T06:30:00.000Z', offset: '-05:00' },
    ]);
    const earlier = await resolved({ ...draft, choiceUtc: result.candidates[0].utc });
    const later = await resolved({ ...draft, choiceUtc: result.candidates[1].utc });
    expect(earlier.disambiguation).toBe('earlier');
    expect(later.disambiguation).toBe('later');
    expect(earlier.utc).not.toBe(later.utc);
    expect(() => assertMemorialTimeConsistency(earlier)).not.toThrow();
    expect(() => assertMemorialTimeConsistency(later)).not.toThrow();
    expect(await resolveMemorialTime({ ...draft, choiceUtc: '2026-11-01T07:30:00.000Z' })).toMatchObject({
      status: 'error',
      code: 'invalid-choice',
    });
  });

  it('uses the event city rather than the device time zone', async () => {
    const [east, west] = await Promise.all([
      resolved(exact(beijing, '2026-02-15', '08:30')),
      resolved(exact(ny, '2026-02-15', '08:30')),
    ]);
    expect(east.utc).toBe('2026-02-15T00:30:00.000Z');
    expect(east.offset).toBe('+08:00');
    expect(west.utc).toBe('2026-02-15T13:30:00.000Z');
    expect(west.offset).toBe('-05:00');
  });

  it('recalculates UTC on city change, keeping the civil clock and clearing an old DST choice', async () => {
    const repeated = exact(ny, '2026-11-01', '01:30');
    const first = await resolveMemorialTime(repeated);
    if (first.status !== 'ambiguous') throw new Error('Expected DST fold');
    const old = await resolved({ ...repeated, choiceUtc: first.candidates[0].utc });
    const switched = changeMemorialLocation(old, beijing);
    expect(switched).toMatchObject({
      state: 'draft',
      kind: 'exact',
      localDate: '2026-11-01',
      localTime: '01:30',
    });
    expect(switched.choiceUtc).toBeUndefined();
    const next = await resolved(switched);
    expect(next.utc).toBe('2026-10-31T17:30:00.000Z');
    expect(next.disambiguation).toBeNull();
    expect(next.utc).not.toBe(old.utc);
  });

  it('keeps an unknown time as a 22:00 reference, including after city changes', async () => {
    const draft = createReferenceDraft(ny, '2026-07-16');
    const value = await resolved(draft);
    expect(value).toMatchObject({
      state: 'resolved',
      kind: 'reference',
      reference: { localTime: '22:00', source: 'default' },
      utc: '2026-07-17T02:00:00.000Z',
    });
    const moved = changeMemorialLocation(value, sydney);
    expect(moved).toMatchObject({ kind: 'reference', reference: { localTime: '22:00', source: 'default' } });
    expect((await resolved(moved)).kind).toBe('reference');
  });

  it('keeps a user-adjusted reference clearly distinct from an exact birth time', async () => {
    const changed = setReferenceTime(createReferenceDraft(beijing, '2026-07-16'), '06:15');
    const value = await resolved(changed);
    expect(value).toMatchObject({ kind: 'reference', reference: { localTime: '06:15', source: 'user' } });
    expect(value.utc).toBe('2026-07-15T22:15:00.000Z');
    expect(() => assertMemorialTimeConsistency(value)).not.toThrow();
  });

  it('validates real Gregorian leap dates rather than normalizing invalid days', async () => {
    expect((await resolved(exact(utc, '2000-02-29', '12:00'))).localDate).toBe('2000-02-29');
    for (const date of ['1900-02-29', '2026-02-30', '2026-04-31', '2026-2-03']) {
      expect(await resolveMemorialTime(exact(utc, date, '12:00'))).toMatchObject({
        status: 'error',
        code: 'invalid-date',
      });
    }
  });

  it('uses the final UTC instant for inclusive 1900–2100 boundaries', async () => {
    expect((await resolved(exact(utc, '1900-01-01', '00:00'))).utc).toBe('1900-01-01T00:00:00.000Z');
    expect((await resolved(exact(utc, '2100-12-31', '23:59'))).utc).toBe('2100-12-31T23:59:00.000Z');
    expect(() => validateInstant(new Date(MIN_INSTANT))).not.toThrow();
    expect(() => validateInstant(new Date(MAX_INSTANT))).not.toThrow();
    expect(() => validateInstant(new Date(MIN_INSTANT - 1))).toThrow(RangeError);
    expect(() => validateInstant(new Date(MAX_INSTANT + 1))).toThrow(RangeError);
    expect(await resolveMemorialTime(exact(utc, '1899-12-31', '23:59'))).toMatchObject({
      status: 'error',
      code: 'out-of-range',
    });
    expect(await resolveMemorialTime(exact(utc, '2101-01-01', '00:00'))).toMatchObject({
      status: 'error',
      code: 'out-of-range',
    });
    // A local date outside 1900 may still be legal when its UTC instant is inside the range.
    const westFixed = { ...utc, id: 'west-fixed', timezone: 'Etc/GMT+12' };
    expect((await resolved(exact(westFixed, '1899-12-31', '12:00'))).utc).toBe('1900-01-01T00:00:00.000Z');
  });

  it('retains the event local date when UTC falls on the previous day', async () => {
    const value = await resolved(exact(beijing, '2026-01-01', '00:15'));
    expect(value.utc).toBe('2025-12-31T16:15:00.000Z');
    expect(value.localDate).toBe('2026-01-01');
  });

  it('preserves historical seconds in the offset, rather than rounding to minutes', async () => {
    const value = await resolved(exact(paris, '1901-01-01', '12:00'));
    expect(value.offset).toBe('+00:09:21');
    expect(value.utc).toBe('1901-01-01T11:50:39.000Z');
    expect(() => assertMemorialTimeConsistency(value)).not.toThrow();
  });

  it('reports invalid zones, coordinates and local clocks distinctly', async () => {
    expect(
      await resolveMemorialTime(exact({ ...ny, timezone: 'Mars/Olympus' }, '2026-11-20', '12:00')),
    ).toMatchObject({
      status: 'error',
      code: 'invalid-timezone',
    });
    expect(await resolveMemorialTime(exact({ ...ny, latitude: 91 }, '2026-11-20', '12:00'))).toMatchObject({
      status: 'error',
      code: 'invalid-location',
    });
    expect(
      await resolveMemorialTime(exact({ ...ny, longitude: Number.NaN }, '2026-11-20', '12:00')),
    ).toMatchObject({
      status: 'error',
      code: 'invalid-location',
    });
    for (const time of ['24:00', '12:60', '1:30']) {
      expect(await resolveMemorialTime(exact(ny, '2026-11-20', time))).toMatchObject({
        status: 'error',
        code: 'invalid-time',
      });
    }
  });

  it('accepts an unambiguous time without a choice and refuses stale choices', async () => {
    const draft = exact(ny, '2026-11-02', '01:30');
    const value = await resolved(draft);
    expect(value.disambiguation).toBeNull();
    expect(await resolveMemorialTime({ ...draft, choiceUtc: '2026-11-01T05:30:00.000Z' })).toMatchObject({
      status: 'error',
      code: 'invalid-choice',
    });
  });

  it('rejects saved records whose UTC, offset or local clock contradict one another', async () => {
    const value = await resolved(exact(ny, '2026-02-15', '08:30'));
    expect(() => assertMemorialTimeConsistency({ ...value, utc: '2026-02-15T14:30:00.000Z' })).toThrow();
    expect(() => assertMemorialTimeConsistency({ ...value, offset: '+01:00' })).toThrow();
    expect(() => assertMemorialTimeConsistency({ ...value, localDate: '2026-02-16' })).toThrow();
    // A stored, internally consistent offset survives later zone rule changes.
    expect(() =>
      assertMemorialTimeConsistency({ ...value, location: { ...value.location, timezone: 'Europe/Paris' } }),
    ).not.toThrow();
  });
});
