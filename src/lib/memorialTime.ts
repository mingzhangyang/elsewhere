import { Temporal, ensureTemporal } from '../domain/temporal';
import { MAX_INSTANT, MIN_INSTANT, validateInstant, wallTimeCandidates } from '../domain/time';
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
  | { status: 'ambiguous'; candidates: MemorialTimeCandidate[]; hasOutOfRangeCandidate: boolean }
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
    return {
      state: 'draft',
      kind: 'exact',
      location,
      localDate: event.localDate,
      localTime: event.localTime,
    };
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

function validLocation(location: unknown): location is LocationInfo {
  if (!location || typeof location !== 'object') return false;
  const place = location as Partial<LocationInfo>;
  return (
    !!place &&
    typeof place.id === 'string' &&
    place.id.trim().length > 0 &&
    typeof place.name === 'string' &&
    place.name.trim().length > 0 &&
    typeof place.country === 'string' &&
    place.country.trim().length > 0 &&
    typeof place.latitude === 'number' &&
    Number.isFinite(place.latitude) &&
    place.latitude >= -90 &&
    place.latitude <= 90 &&
    typeof place.longitude === 'number' &&
    Number.isFinite(place.longitude) &&
    place.longitude >= -180 &&
    place.longitude <= 180 &&
    typeof place.elevation === 'number' &&
    Number.isFinite(place.elevation)
  );
}

function validTimeZone(zone: unknown): zone is string {
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

/** Validate Gregorian dates synchronously; draft restoration must not eagerly load Temporal. */
function validCivilDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
    return false;
  }
  const [year, month, day] = date.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function validClock(time: unknown): time is string {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function offsetAt(utc: Date, zone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(utc.getTime()).toZonedDateTimeISO(zone).offset;
}

/** Apply the supported UTC interval to individual wall-time candidates, not the entire fold. */
export function supportedMemorialInstants(candidates: readonly Date[]): Date[] {
  return candidates.filter((date) => {
    const ms = date.getTime();
    return Number.isFinite(ms) && ms >= MIN_INSTANT && ms <= MAX_INSTANT;
  });
}

/** Must be awaited: the app loads Temporal lazily on browsers lacking native support. */
export async function resolveMemorialTime(draft: MemorialTimeDraft): Promise<MemorialTimeResult> {
  await ensureTemporal();
  if (!draft || draft.state !== 'draft' || (draft.kind !== 'exact' && draft.kind !== 'reference')) {
    return error('invalid-choice', 'Expected an unresolved memorial time draft.');
  }
  if (!validLocation(draft.location))
    return error('invalid-location', 'Select a location with valid coordinates.');
  if (!validTimeZone(draft.location.timezone))
    return error('invalid-timezone', 'Select a valid IANA time zone.');
  if (!validCivilDate(draft.localDate))
    return error('invalid-date', 'Enter a valid Gregorian date (YYYY-MM-DD).');
  const localTime = draft.kind === 'exact' ? draft.localTime : draft.reference?.localTime;
  if (!validClock(localTime)) return error('invalid-time', 'Enter a valid local time (HH:mm).');
  if (
    draft.kind === 'reference' &&
    ((draft.reference.source !== 'user' && draft.reference.source !== 'default') ||
      (draft.reference.source === 'default' && localTime !== DEFAULT_REFERENCE_TIME))
  ) {
    return error('invalid-choice', 'Invalid reference time source.');
  }

  let dates: Date[];
  try {
    dates = wallTimeCandidates(draft.localDate, localTime, draft.location.timezone, false);
  } catch {
    return error('out-of-range', 'The resulting UTC instant must be between 1900 and 2100.');
  }
  if (dates.length === 0)
    return error('nonexistent-time', 'This local time does not exist in the selected time zone.');
  // Keep both real fold instants until after range filtering, so one invalid sibling
  // never hides a valid choice or silently picks it on the user's behalf.
  const supported = supportedMemorialInstants(dates);
  if (supported.length === 0)
    return error('out-of-range', 'The resulting UTC instant must be between 1900 and 2100.');
  const candidates = supported
    .map((date) => ({ utc: date.toISOString(), offset: offsetAt(date, draft.location.timezone) }))
    .sort((a, b) => a.utc.localeCompare(b.utc));
  if (
    draft.choiceUtc !== undefined &&
    (dates.length !== 2 || !candidates.some((candidate) => candidate.utc === draft.choiceUtc))
  ) {
    return error('invalid-choice', 'The selected UTC candidate does not match this local time and location.');
  }
  if (dates.length === 2 && draft.choiceUtc === undefined) {
    return { status: 'ambiguous', candidates, hasOutOfRangeCandidate: candidates.length < 2 };
  }
  const selected = candidates.find((candidate) => candidate.utc === draft.choiceUtc) ?? candidates[0];
  const ordered = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const fields: ResolvedFields = {
    state: 'resolved',
    utc: selected.utc,
    offset: selected.offset,
    disambiguation:
      ordered.length === 2 && selected.utc === ordered[0].toISOString()
        ? 'earlier'
        : ordered.length === 2
          ? 'later'
          : null,
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
  if (
    !value ||
    value.state !== 'resolved' ||
    !validLocation(value.location) ||
    !validTimeZone(value.location.timezone)
  ) {
    throw new RangeError('Invalid resolved memorial location or state.');
  }
  const localTime =
    value.kind === 'exact' ? value.localTime : value.kind === 'reference' ? value.reference?.localTime : '';
  if (!validClock(localTime) || !validCivilDate(value.localDate)) {
    throw new RangeError('Invalid resolved civil time.');
  }
  if (
    value.kind === 'reference' &&
    ((value.reference?.source !== 'user' && value.reference?.source !== 'default') ||
      (value.reference?.source === 'default' && localTime !== DEFAULT_REFERENCE_TIME))
  ) {
    throw new RangeError('Invalid reference source.');
  }
  if (
    value.disambiguation !== null &&
    value.disambiguation !== 'earlier' &&
    value.disambiguation !== 'later'
  ) {
    throw new RangeError('Invalid DST choice.');
  }
  if (typeof value.utc !== 'string') throw new RangeError('Invalid UTC instant.');
  const utc = new Date(value.utc);
  try {
    validateInstant(utc);
  } catch (error) {
    // Saved-state failures stay RangeErrors for this module's callers; the SDK reports SkyEngineError.
    throw new RangeError(error instanceof Error ? error.message : 'Invalid UTC instant.', { cause: error });
  }
  if (utc.toISOString() !== value.utc)
    throw new RangeError('UTC must be a canonical millisecond ISO instant.');
  if (typeof value.offset !== 'string') throw new RangeError('Invalid saved UTC offset.');
  const match = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.offset);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) {
    throw new RangeError('Invalid saved UTC offset.');
  }
  const seconds =
    (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] ?? 0));
  const wall = new Date(utc.getTime() + seconds * 1000).toISOString();
  if (wall !== `${value.localDate}T${localTime}:00.000Z`) {
    throw new RangeError('Saved UTC instant, offset, and local clock disagree.');
  }
}

/**
 * Parse an untrusted draft without coercing precision, time, date or location.
 * A corrupted UTC choice can be discarded, but all other required fields must be structurally sound.
 */
type ParsedMemorialDraft =
  | { draft: MemorialTimeDraft; discardedChoice: boolean }
  | { code: MemorialTimeErrorCode };

function readMemorialDraft(input: unknown): ParsedMemorialDraft {
  if (!input || typeof input !== 'object') return { code: 'invalid-choice' };
  const value = input as Record<string, unknown>;
  if (value.state !== 'draft' || (value.kind !== 'exact' && value.kind !== 'reference')) {
    return { code: 'invalid-choice' };
  }
  if (!validLocation(value.location)) return { code: 'invalid-location' };
  if (!validTimeZone(value.location.timezone)) return { code: 'invalid-timezone' };
  if (typeof value.localDate !== 'string') return { code: 'invalid-date' };
  const choiceUtc = typeof value.choiceUtc === 'string' ? value.choiceUtc : undefined;
  const discardedChoice = value.choiceUtc !== undefined && typeof value.choiceUtc !== 'string';
  const common = {
    state: 'draft' as const,
    location: { ...value.location },
    localDate: value.localDate,
    ...(choiceUtc === undefined ? {} : { choiceUtc }),
  };
  if (value.kind === 'exact') {
    if (typeof value.localTime !== 'string') return { code: 'invalid-time' };
    return { draft: { ...common, kind: 'exact', localTime: value.localTime }, discardedChoice };
  }
  if (!value.reference || typeof value.reference !== 'object') return { code: 'invalid-time' };
  const reference = value.reference as Record<string, unknown>;
  if (typeof reference.localTime !== 'string') return { code: 'invalid-time' };
  if (
    (reference.source !== 'default' && reference.source !== 'user') ||
    (reference.source === 'default' && reference.localTime !== DEFAULT_REFERENCE_TIME)
  ) {
    return { code: 'invalid-choice' };
  }
  return {
    draft: {
      ...common,
      kind: 'reference',
      reference: { localTime: reference.localTime, source: reference.source },
    },
    discardedChoice,
  };
}

export type MemorialDraftRestoration =
  | { status: 'restored'; draft: MemorialTimeDraft }
  | { status: 'needs-confirmation'; draft: MemorialTimeDraft; code: MemorialTimeErrorCode }
  | { status: 'error'; code: MemorialTimeErrorCode };

/**
 * Restore unfinished user input. No DST selection is trusted until it is rechecked
 * against the current location, local clock, IANA rules and UTC boundary.
 * Recoverable invalid civil values remain editable; invalid choices are cleared.
 */
export async function restoreMemorialDraft(input: unknown): Promise<MemorialDraftRestoration> {
  const parsed = readMemorialDraft(input);
  if ('code' in parsed) return { status: 'error', code: parsed.code };

  const outcome = await resolveMemorialTime(parsed.draft);
  if (outcome.status === 'error') {
    return {
      status: 'needs-confirmation',
      code: outcome.code,
      draft: { ...parsed.draft, choiceUtc: undefined },
    };
  }
  if (parsed.discardedChoice) {
    return {
      status: 'needs-confirmation',
      code: 'invalid-choice',
      draft: { ...parsed.draft, choiceUtc: undefined },
    };
  }
  return { status: 'restored', draft: parsed.draft };
}

/**
 * Recover an archived instant without consulting current time-zone offset rules.
 * Reject contradictory saved fields; preserve the historical UTC, zone and offset.
 */
export function restoreMemorialInstant(input: unknown): MemorialTime {
  assertMemorialTimeConsistency(input as MemorialTime);
  const saved = input as MemorialTime;
  const common = {
    state: 'resolved' as const,
    location: { ...saved.location },
    localDate: saved.localDate,
    utc: saved.utc,
    offset: saved.offset,
    disambiguation: saved.disambiguation,
  };
  return saved.kind === 'exact'
    ? { ...common, kind: 'exact', localTime: saved.localTime }
    : { ...common, kind: 'reference', reference: { ...saved.reference } };
}

/**
 * Editing deliberately starts a new wall-clock resolution. Do not reuse an archived
 * DST choice or offset; the archived record itself remains unchanged.
 */
export function editMemorialTime(saved: unknown): MemorialTimeDraft {
  const restored = restoreMemorialInstant(saved);
  return changeMemorialLocation(restored, restored.location);
}
