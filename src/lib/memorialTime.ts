import { Temporal, ensureTemporal } from '../domain/temporal';
import { validateInstant, wallTimeCandidates } from '../domain/time';
import type { LocationInfo } from '../types';

export const DEFAULT_REFERENCE_TIME = '22:00';

type TimeChoice = { choiceUtc?: string };
type LocalEvent = { location: LocationInfo; localDate: string };
export type ReferenceClock = { localTime: string; source: 'default' | 'user' };

/** Editable input. Its UTC (if any) is only a candidate choice, never a resolved instant. */
export type MemorialTimeDraft =
  | ({ state: 'draft'; kind: 'exact'; localTime: string } & LocalEvent & TimeChoice)
  | ({ state: 'draft'; kind: 'reference'; reference: ReferenceClock } & LocalEvent & TimeChoice);

type ResolvedFields = {
  state: 'resolved';
  /** Canonical UTC ISO string, with millisecond precision. */
  utc: string;
  /** Actual IANA offset, including historical seconds (for example +00:09:21). */
  offset: string;
  /** Explicit choice only when the local hour occurred twice. */
  disambiguation: 'earlier' | 'later' | null;
};

/** Saved intent stays discriminated: reference never becomes a claimed exact birth instant. */
export type MemorialTime =
  | ({ kind: 'exact'; localTime: string } & LocalEvent & ResolvedFields)
  | ({ kind: 'reference'; reference: ReferenceClock } & LocalEvent & ResolvedFields);

export type MemorialTimeCandidate = { utc: string; offset: string };
export type MemorialTimeErrorCode =
  | 'invalid-date'
  | 'invalid-time'
  | 'invalid-location'
  | 'invalid-timezone'
  | 'nonexistent-time'
  | 'out-of-range'
  | 'invalid-choice';

export type MemorialTimeResult =
  | { status: 'resolved'; value: MemorialTime }
  | { status: 'ambiguous'; candidates: [MemorialTimeCandidate, MemorialTimeCandidate] }
  | { status: 'error'; code: MemorialTimeErrorCode; message: string };

export function createReferenceDraft(
  location: LocationInfo,
  localDate: string,
): Extract<MemorialTimeDraft, { kind: 'reference' }> {
  return {
    state: 'draft',
    kind: 'reference',
    location,
    localDate,
    reference: { localTime: DEFAULT_REFERENCE_TIME, source: 'default' },
  };
}

export function setReferenceTime(
  draft: Extract<MemorialTimeDraft, { kind: 'reference' }>,
  localTime: string,
): Extract<MemorialTimeDraft, { kind: 'reference' }> {
  return { ...draft, reference: { localTime, source: 'user' }, choiceUtc: undefined };
}

/** Unlike the explorer, changes to a memorial location preserve wall time, not UTC. */
export function changeMemorialLocation(
  event: MemorialTimeDraft | MemorialTime,
  location: LocationInfo,
): MemorialTimeDraft {
  if (event.kind === 'exact') {
    return { state: 'draft', kind: 'exact', location, localDate: event.localDate, localTime: event.localTime };
  }
  return {
    state: 'draft',
    kind: 'reference',
    location,
    localDate: event.localDate,
    reference: { ...event.reference },
  };
}

function error(code: MemorialTimeErrorCode, message: string): MemorialTimeResult {
  return { status: 'error', code, message };
}

function validLocation(location: LocationInfo): boolean {
  return (
    !!location &&
    typeof location.id === 'string' &&
    location.id.trim().length > 0 &&
    typeof location.name === 'string' &&
    location.name.trim().length > 0 &&
    typeof location.country === 'string' &&
    location.country.trim().length > 0 &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    Number.isFinite(location.elevation)
  );
}

function validTimeZone(zone: string): boolean {
  if (typeof zone !== 'string' || !/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(zone)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function validCivilDate(date: string): boolean {
  if (typeof date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
    return false;
  }
  try {
    Temporal.PlainDate.from(date, { overflow: 'reject' });
    return true;
  } catch {
    return false;
  }
}

function validClock(time: unknown): time is string {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function offsetAt(utc: Date, zone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(utc.getTime()).toZonedDateTimeISO(zone).offset;
}

/** Must be awaited: the app loads Temporal lazily on browsers lacking native support. */
export async function resolveMemorialTime(draft: MemorialTimeDraft): Promise<MemorialTimeResult> {
  await ensureTemporal();
  if (!draft || draft.state !== 'draft' || (draft.kind !== 'exact' && draft.kind !== 'reference')) {
    return error('invalid-choice', 'Expected an unresolved memorial time draft.');
  }
  if (!validLocation(draft.location)) return error('invalid-location', 'Select a location with valid coordinates.');
  if (!validTimeZone(draft.location.timezone)) return error('invalid-timezone', 'Select a valid IANA time zone.');
  if (!validCivilDate(draft.localDate)) return error('invalid-date', 'Enter a valid Gregorian date (YYYY-MM-DD).');
  const localTime = draft.kind === 'exact' ? draft.localTime : draft.reference?.localTime;
  if (!validClock(localTime)) return error('invalid-time', 'Enter a valid local time (HH:mm).');
  if (
    draft.kind === 'reference' &&
    (draft.reference.source !== 'user' && draft.reference.source !== 'default' ||
      (draft.reference.source === 'default' && localTime !== DEFAULT_REFERENCE_TIME))
  ) {
    return error('invalid-choice', 'Invalid reference time source.');
  }

  let dates: Date[];
  try {
    dates = wallTimeCandidates(draft.localDate, localTime, draft.location.timezone);
  } catch {
    // Civil inputs and time zone have already been checked. This is the UTC range gate.
    return error('out-of-range', 'The resulting UTC instant must be between 1900 and 2100.');
  }
  if (dates.length === 0) return error('nonexistent-time', 'This local time does not exist in the selected time zone.');
  const candidates = dates
    .map((date) => ({ utc: date.toISOString(), offset: offsetAt(date, draft.location.timezone) }))
    .sort((a, b) => a.utc.localeCompare(b.utc));
  if (draft.choiceUtc !== undefined && !candidates.some((candidate) => candidate.utc === draft.choiceUtc)) {
    return error('invalid-choice', 'The selected UTC candidate does not match this local time and location.');
  }
  if (candidates.length === 2 && draft.choiceUtc === undefined) {
    return { status: 'ambiguous', candidates: [candidates[0], candidates[1]] };
  }
  const selected = candidates.find((candidate) => candidate.utc === draft.choiceUtc) ?? candidates[0];
  const fields: ResolvedFields = {
    state: 'resolved',
    utc: selected.utc,
    offset: selected.offset,
    disambiguation: candidates.length === 2 ? (selected.utc === candidates[0].utc ? 'earlier' : 'later') : null,
  };
  const value: MemorialTime =
    draft.kind === 'exact'
      ? { ...fields, kind: 'exact', location: { ...draft.location }, localDate: draft.localDate, localTime }
      : {
          ...fields,
          kind: 'reference',
          location: { ...draft.location },
          localDate: draft.localDate,
          reference: { ...draft.reference },
        };
  assertMemorialTimeConsistency(value);
  return { status: 'resolved', value };
}

/**
 * Validate a saved UTC + offset + civil clock without re-resolving with today's tzdb.
 * Future artwork-link readers may retain a self-consistent historical record after a tzdb update.
 */
export function assertMemorialTimeConsistency(value: MemorialTime): void {
  if (!value || value.state !== 'resolved' || !validLocation(value.location) || !validTimeZone(value.location.timezone)) {
    throw new RangeError('Invalid resolved memorial location or state.');
  }
  const localTime = value.kind === 'exact' ? value.localTime : value.kind === 'reference' ? value.reference?.localTime : '';
  if (!validClock(localTime) || !/^\d{4}-\d{2}-\d{2}$/.test(value.localDate)) {
    throw new RangeError('Invalid resolved civil time.');
  }
  if (
    value.kind === 'reference' &&
    (value.reference.source !== 'user' && value.reference.source !== 'default' ||
      (value.reference.source === 'default' && localTime !== DEFAULT_REFERENCE_TIME))
  ) {
    throw new RangeError('Invalid reference source.');
  }
  if (value.disambiguation !== null && value.disambiguation !== 'earlier' && value.disambiguation !== 'later') {
    throw new RangeError('Invalid DST choice.');
  }
  if (typeof value.utc !== 'string') throw new RangeError('Invalid UTC instant.');
  const utc = new Date(value.utc);
  validateInstant(utc);
  if (utc.toISOString() !== value.utc) throw new RangeError('UTC must be a canonical millisecond ISO instant.');
  const match = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.offset);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) {
    throw new RangeError('Invalid saved UTC offset.');
  }
  const seconds =
    (match[1] === '-' ? -1 : 1) *
    (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] ?? 0));
  const wall = new Date(utc.getTime() + seconds * 1000).toISOString();
  if (wall !== `${value.localDate}T${localTime}:00.000Z`) {
    throw new RangeError('Saved UTC instant, offset, and local clock disagree.');
  }
}
