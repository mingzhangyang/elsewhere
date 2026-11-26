import { describe, expect, it } from 'vitest';
import { INVALID_INPUT } from './skyEngineErrorMatchers';
import { MAX_INSTANT, MIN_INSTANT, validateInstant } from '../src/domain/time';
import {
  assertMemorialTimeConsistency,
  createReferenceDraft,
  editMemorialTime,
  resolveMemorialTime,
  restoreMemorialDraft,
  restoreMemorialInstant,
  setReferenceTime,
  supportedMemorialInstants,
  type MemorialTime,
  type MemorialTimeDraft,
} from '../src/lib/memorialTime';
import { PRESETS } from '../src/lib/locations';
import type { LocationInfo } from '../src/types';

const ny = PRESETS.find((place) => place.id === 'new-york')!;
const beijing = PRESETS.find((place) => place.id === 'beijing')!;
const utc: LocationInfo = { ...ny, id: 'utc-fixture', timezone: 'UTC' };

function exact(location: LocationInfo, localDate: string, localTime: string): MemorialTimeDraft {
  return { state: 'draft', kind: 'exact', location, localDate, localTime };
}

async function resolved(draft: MemorialTimeDraft): Promise<MemorialTime> {
  const outcome = await resolveMemorialTime(draft);
  if (outcome.status !== 'resolved') throw new Error(`Expected resolution, got ${outcome.status}`);
  return outcome.value;
}

describe('memorial-time restoration and UTC boundary (SM1-C)', () => {
  it('revalidates both real DST fold choices on draft recovery', async () => {
    const draft = exact(ny, '2026-11-01', '01:30');
    const fold = await resolveMemorialTime(draft);
    if (fold.status !== 'ambiguous') throw new Error('Expected a fold');
    expect(fold.hasOutOfRangeCandidate).toBe(false);
    expect(fold.candidates).toEqual([
      { utc: '2026-11-01T05:30:00.000Z', offset: '-04:00' },
      { utc: '2026-11-01T06:30:00.000Z', offset: '-05:00' },
    ]);
    for (const candidate of fold.candidates) {
      const recovered = await restoreMemorialDraft({ ...draft, choiceUtc: candidate.utc });
      expect(recovered.status).toBe('restored');
      if (recovered.status !== 'restored') continue;
      const value = await resolved(recovered.draft);
      expect(value.utc).toBe(candidate.utc);
      expect(value.offset).toBe(candidate.offset);
    }
    const withoutChoice = await restoreMemorialDraft(draft);
    expect(withoutChoice.status).toBe('restored');
    if (withoutChoice.status === 'restored') {
      expect((await resolveMemorialTime(withoutChoice.draft)).status).toBe('ambiguous');
    }
  });

  it('clears an obsolete choice when the local clock or date changes', async () => {
    const folded = { ...exact(ny, '2026-11-01', '01:30'), choiceUtc: '2026-11-01T05:30:00.000Z' };
    const clock = await restoreMemorialDraft({ ...folded, localTime: '01:31' });
    expect(clock).toMatchObject({ status: 'needs-confirmation', code: 'invalid-choice' });
    if (clock.status !== 'needs-confirmation') return;
    expect(clock.draft.choiceUtc).toBeUndefined();
    expect((await resolveMemorialTime(clock.draft)).status).toBe('ambiguous');

    const unique = await restoreMemorialDraft({
      ...exact(ny, '2026-11-02', '01:30'),
      choiceUtc: '2026-11-02T06:30:00.000Z',
    });
    expect(unique).toMatchObject({ status: 'needs-confirmation', code: 'invalid-choice' });

    const date = await restoreMemorialDraft({ ...folded, localDate: '2026-11-02' });
    expect(date).toMatchObject({ status: 'needs-confirmation', code: 'invalid-choice' });
    if (date.status === 'needs-confirmation') {
      expect(date.draft.choiceUtc).toBeUndefined();
      expect((await resolved(date.draft)).utc).toBe('2026-11-02T06:30:00.000Z');
    }
  });

  it('preserves exact and reference precision and reference source across draft recovery', async () => {
    const exactDraft = exact(beijing, '2026-07-16', '06:15');
    expect(await restoreMemorialDraft(exactDraft)).toMatchObject({
      status: 'restored',
      draft: { kind: 'exact', localTime: '06:15' },
    });

    const defaultDraft = createReferenceDraft(ny, '2026-07-16');
    expect(await restoreMemorialDraft(defaultDraft)).toMatchObject({
      status: 'restored',
      draft: { kind: 'reference', reference: { localTime: '22:00', source: 'default' } },
    });

    const edited = setReferenceTime(createReferenceDraft(beijing, '2026-07-16'), '06:15');
    const recovered = await restoreMemorialDraft(edited);
    expect(recovered).toMatchObject({
      status: 'restored',
      draft: { kind: 'reference', reference: { localTime: '06:15', source: 'user' } },
    });
    if (recovered.status === 'restored') {
      expect((await resolved(recovered.draft)).kind).toBe('reference');
    }
  });

  it('discards malformed or stale choices without treating them as resolved instants', async () => {
    const draft = exact(ny, '2026-11-01', '01:30');
    for (const raw of [
      { ...draft, choiceUtc: '2026-11-01T09:30:00.000Z' },
      { ...draft, choiceUtc: 123 },
      { ...draft, choiceUtc: null },
    ]) {
      const outcome = await restoreMemorialDraft(raw);
      expect(outcome).toMatchObject({ status: 'needs-confirmation', code: 'invalid-choice' });
      if (outcome.status === 'needs-confirmation') {
        expect(outcome.draft.choiceUtc).toBeUndefined();
        expect((await resolveMemorialTime(outcome.draft)).status).toBe('ambiguous');
      }
    }
  });

  it('keeps correctable invalid civil input while rejecting corrupt structure and location', async () => {
    const draft = exact(ny, '1900-02-29', '08:30');
    expect(await restoreMemorialDraft(draft)).toMatchObject({
      status: 'needs-confirmation',
      code: 'invalid-date',
      draft: { localDate: '1900-02-29' },
    });
    expect(
      await restoreMemorialDraft({ ...draft, localDate: '2026-02-15', localTime: '24:01' }),
    ).toMatchObject({
      status: 'needs-confirmation',
      code: 'invalid-time',
    });
    expect(await restoreMemorialDraft(exact(ny, '2026-03-08', '02:30'))).toMatchObject({
      status: 'needs-confirmation',
      code: 'nonexistent-time',
    });
    expect(await restoreMemorialDraft({ ...draft, location: { ...ny, latitude: 91 } })).toMatchObject({
      status: 'error',
      code: 'invalid-location',
    });
    expect(
      await restoreMemorialDraft({ ...draft, location: { ...ny, timezone: 'Mars/Olympus' } }),
    ).toMatchObject({ status: 'error', code: 'invalid-timezone' });
    expect(await restoreMemorialDraft({ state: 'resolved', kind: 'exact' })).toMatchObject({
      status: 'error',
      code: 'invalid-choice',
    });
    expect(
      await restoreMemorialDraft({
        ...createReferenceDraft(ny, '2026-07-16'),
        reference: { localTime: '06:15', source: 'default' },
      }),
    ).toMatchObject({ status: 'error', code: 'invalid-choice' });
  });

  it('restores archived UTC exactly, but a deliberate edit resolves the wall clock again', async () => {
    const original = await resolved(exact(ny, '2026-02-15', '08:30'));
    const saved = restoreMemorialInstant(JSON.parse(JSON.stringify(original)));
    expect(saved).toEqual(original);
    expect(saved).not.toBe(original);
    expect(saved.location).not.toBe(original.location);

    const draft = editMemorialTime(saved);
    expect(draft).toMatchObject({
      state: 'draft',
      kind: 'exact',
      localDate: '2026-02-15',
      localTime: '08:30',
    });
    expect(draft.choiceUtc).toBeUndefined();
    expect((await resolved(draft)).utc).toBe(original.utc);
  });

  it('does not rewrite an internally coherent historical offset that differs from current tzdb', async () => {
    const current = await resolved(exact(ny, '2026-02-15', '08:30'));
    // Simulate a record made under different time-zone rules: the saved wall clock
    // and saved -04:00 offset agree with the original UTC, but differ from modern NY rules.
    if (current.kind !== 'exact') throw new Error('Expected exact');
    const archived: MemorialTime = { ...current, localTime: '09:30', offset: '-04:00' };
    expect(() => assertMemorialTimeConsistency(archived)).not.toThrow();
    const recovered = restoreMemorialInstant(archived);
    expect(recovered.utc).toBe('2026-02-15T13:30:00.000Z');
    expect(recovered.offset).toBe('-04:00');
    expect(recovered).toEqual(archived);
    const edit = editMemorialTime(recovered);
    expect(edit).toMatchObject({ kind: 'exact', localTime: '09:30' });
    expect(edit.choiceUtc).toBeUndefined();
    expect((await resolved(edit)).utc).toBe('2026-02-15T14:30:00.000Z');
    expect(recovered.utc).toBe('2026-02-15T13:30:00.000Z');
  });

  it('preserves reference source through restoration and editing', async () => {
    for (const draft of [
      createReferenceDraft(ny, '2026-07-16'),
      setReferenceTime(createReferenceDraft(beijing, '2026-07-16'), '06:15'),
    ]) {
      const saved = await resolved(draft);
      expect(saved.kind).toBe('reference');
      const restored = restoreMemorialInstant(saved);
      expect(restored).toEqual(saved);
      const edit = editMemorialTime(restored);
      expect(edit.kind).toBe('reference');
      if (edit.kind === 'reference' && saved.kind === 'reference') {
        expect(edit.reference).toEqual(saved.reference);
        expect((await resolved(edit)).kind).toBe('reference');
      }
    }
  });

  it('rejects inconsistent UTC, offset, clock, reference metadata and DST metadata', async () => {
    const saved = await resolved(exact(ny, '2026-02-15', '08:30'));
    for (const invalid of [
      { ...saved, utc: '2026-02-15T14:30:00.000Z' },
      { ...saved, offset: '+01:00' },
      { ...saved, offset: ['-05:00'] },
      { ...saved, localDate: '2026-02-16' },
      { ...saved, localTime: '09:30' },
      { ...saved, disambiguation: 'maybe' },
      { ...saved, disambiguation: undefined },
      { ...saved, utc: '2101-01-01T00:00:00.000Z' },
    ]) {
      expect(() => restoreMemorialInstant(invalid)).toThrow(RangeError);
    }
    // A JSON array stringifies to the expected offset in RegExp.exec unless its type is checked.
    expect(() =>
      restoreMemorialInstant(JSON.parse(JSON.stringify({ ...saved, offset: ['-05:00'] }))),
    ).toThrow(RangeError);
    const reference = await resolved(createReferenceDraft(ny, '2026-07-16'));
    expect(() =>
      restoreMemorialInstant({ ...reference, reference: { localTime: '06:15', source: 'default' } }),
    ).toThrow(RangeError);
    expect(() => restoreMemorialInstant({ ...reference, reference: null })).toThrow(RangeError);
  });

  it('checks inclusive UTC millisecond endpoints and filters each fold candidate independently', () => {
    const instants = [
      new Date(MIN_INSTANT - 1),
      new Date(MIN_INSTANT),
      new Date(MAX_INSTANT),
      new Date(MAX_INSTANT + 1),
    ];
    expect(supportedMemorialInstants(instants).map((instant) => instant.getTime())).toEqual([
      MIN_INSTANT,
      MAX_INSTANT,
    ]);
    expect(() => validateInstant(instants[1])).not.toThrow();
    expect(() => validateInstant(instants[2])).not.toThrow();
    expect(() => validateInstant(instants[0])).toThrow(INVALID_INPUT);
    expect(() => validateInstant(instants[3])).toThrow(INVALID_INPUT);
    // A hypothetical fold straddling the endpoint yields one eligible candidate,
    // never a default selection of the invalid sibling.
    expect(supportedMemorialInstants(instants.slice(0, 2))).toEqual([instants[1]]);
  });

  it('allows local calendar dates outside the range only when UTC is in range', async () => {
    const west = { ...utc, timezone: 'Etc/GMT+12' };
    const east = { ...utc, timezone: 'Etc/GMT-14' };
    expect((await resolved(exact(west, '1899-12-31', '12:00'))).utc).toBe('1900-01-01T00:00:00.000Z');
    expect((await resolved(exact(east, '2101-01-01', '13:59'))).utc).toBe('2100-12-31T23:59:00.000Z');
    expect(await resolveMemorialTime(exact(west, '1899-12-31', '11:59'))).toMatchObject({
      status: 'error',
      code: 'out-of-range',
    });
    expect(await resolveMemorialTime(exact(east, '2101-01-01', '14:00'))).toMatchObject({
      status: 'error',
      code: 'out-of-range',
    });
  });

  it('retains historical sub-minute offset seconds and Gregorian leap-date validation', async () => {
    const paris = { ...utc, timezone: 'Europe/Paris' };
    const value = await resolved(exact(paris, '1901-01-01', '12:00'));
    expect(value.offset).toBe('+00:09:21');
    expect(restoreMemorialInstant(value)).toEqual(value);
    expect((await resolved(exact(utc, '2000-02-29', '12:00'))).localDate).toBe('2000-02-29');
    expect(await resolveMemorialTime(exact(utc, '2100-02-29', '12:00'))).toMatchObject({
      status: 'error',
      code: 'invalid-date',
    });
  });
});
