import { requireTemporal } from './temporal';
import { invalidInput } from '../errors';

export const MIN_INSTANT = Date.UTC(1900, 0, 1);
export const MAX_INSTANT = Date.UTC(2101, 0, 1) - 1;

export function validateInstant(date: Date): Date {
  let time: number;
  try {
    // Check the Date internal slot, including Dates from another realm.
    time = Date.prototype.getTime.call(date);
  } catch {
    throw invalidInput('Choose a date between 1900 and 2100.');
  }
  if (!Number.isFinite(time) || time < MIN_INSTANT || time > MAX_INSTANT) {
    throw invalidInput('Choose a date between 1900 and 2100.');
  }
  return date;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  date: string;
  time: string;
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
  };
}

export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
  disambiguation: 'reject' | 'earlier' | 'later' = 'reject',
): Date {
  return validateInstant(
    new Date(
      requireTemporal().ZonedDateTime.from(
        { year, month, day, hour, minute, timeZone },
        { disambiguation, overflow: 'reject' },
      ).epochMilliseconds,
    ),
  );
}

/**
 * The creator may inspect all real candidates before applying its final UTC range.
 * Explorer callers retain the existing fail-closed range check by default.
 */
export function wallTimeCandidates(date: string, time: string, timeZone: string, checkRange = true): Date[] {
  const plain = requireTemporal().PlainDateTime.from(`${date}T${time}`, { overflow: 'reject' });
  const candidates = ['earlier', 'later'].map((disambiguation) =>
    plain.toZonedDateTime(timeZone, { disambiguation: disambiguation as 'earlier' | 'later' }),
  );
  return [
    ...new Set(
      candidates
        .filter((zoned) => zoned.toPlainDateTime().equals(plain))
        .map((zoned) => zoned.epochMilliseconds),
    ),
  ].map((ms) => {
    const instant = new Date(ms);
    return checkRange ? validateInstant(instant) : instant;
  });
}
export function localDayBounds(date: Date, timeZone: string): { start: Date; end: Date; minutes: number } {
  const zoned = requireTemporal().Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone);
  const start = zoned.startOfDay();
  const end = start.add({ days: 1 }).startOfDay();
  return {
    start: new Date(start.epochMilliseconds),
    end: new Date(end.epochMilliseconds),
    minutes: (end.epochMilliseconds - start.epochMilliseconds) / 60000,
  };
}

export function civilDayStart(day: string, timeZone: string): Date {
  return new Date(requireTemporal().PlainDate.from(day).toZonedDateTime(timeZone).epochMilliseconds);
}

export function formatOffset(date: Date, timeZone: string): string {
  return `UTC${requireTemporal().Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone).offset}`;
}

/**
 * Display formatting takes the locale as a BCP 47 tag ("en-US", "zh-Hans"): the domain has no notion
 * of the interface language, only of how to format for one.
 */
export function formatTime(
  date: Date | null,
  timeZone: string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  }).format(date);
}

export function formatDate(
  date: Date,
  timeZone: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' },
): string {
  return new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(date);
}

/**
 * A time zone's name for display: the IANA identifier ("America/New York") or, with `generic`, the
 * locale's own name for it ("北美东部时间"), falling back to the identifier where the browser has none.
 */
export function formatTimeZoneName(
  timeZone: string,
  locale: string,
  style: 'id' | 'generic',
  date: Date = new Date(),
): string {
  const id = timeZone.replaceAll('_', ' ');
  if (style === 'id') return id;
  try {
    return (
      new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'longGeneric' })
        .formatToParts(date)
        .find((part) => part.type === 'timeZoneName')?.value ?? id
    );
  } catch {
    return id;
  }
}

export function localDayStart(date: Date, timeZone: string): Date {
  return localDayBounds(date, timeZone).start;
}

export function shiftLocalDate(date: Date, timeZone: string, days: number): Date {
  const zoned = requireTemporal().Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone);
  return validateInstant(new Date(zoned.add({ days }).epochMilliseconds));
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
