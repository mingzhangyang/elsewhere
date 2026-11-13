import { Temporal } from '@js-temporal/polyfill';

export const MIN_INSTANT = Date.UTC(1900, 0, 1);
export const MAX_INSTANT = Date.UTC(2101, 0, 1) - 1;

export function validateInstant(date: Date): Date {
  if (!Number.isFinite(date.getTime()) || date.getTime() < MIN_INSTANT || date.getTime() > MAX_INSTANT) {
    throw new RangeError('Choose a date between 1900 and 2100.');
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
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
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
    year, month, day, hour, minute, second,
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
  };
}

export function zonedDateTimeToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, timeZone: string, disambiguation: 'reject' | 'earlier' | 'later' = 'reject',
): Date {
  return validateInstant(new Date(Temporal.ZonedDateTime.from(
    { year, month, day, hour, minute, timeZone }, { disambiguation, overflow: 'reject' },
  ).epochMilliseconds));
}

export function wallTimeCandidates(date: string, time: string, timeZone: string): Date[] {
  const plain = Temporal.PlainDateTime.from(`${date}T${time}`, { overflow: 'reject' });
  const candidates = ['earlier', 'later'].map((disambiguation) => plain.toZonedDateTime(timeZone,
    { disambiguation: disambiguation as 'earlier' | 'later' }));
  return [...new Set(candidates.filter((zoned) => zoned.toPlainDateTime().equals(plain))
    .map((zoned) => zoned.epochMilliseconds))].map((ms) => validateInstant(new Date(ms)));
}

export function localDayBounds(date: Date, timeZone: string): { start: Date; end: Date; minutes: number } {
  const zoned = Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone);
  const start = zoned.startOfDay();
  const end = start.add({ days: 1 }).startOfDay();
  return { start: new Date(start.epochMilliseconds), end: new Date(end.epochMilliseconds),
    minutes: (end.epochMilliseconds - start.epochMilliseconds) / 60000 };
}

export function civilDayStart(day: string, timeZone: string): Date {
  return new Date(Temporal.PlainDate.from(day).toZonedDateTime(timeZone).epochMilliseconds);
}

export function formatOffset(date: Date, timeZone: string): string {
  return `UTC${Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone).offset}`;
}

export function formatTime(date: Date | null, timeZone: string, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric', minute: '2-digit',
    ...options,
  }).format(date);
}

export function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).format(date);
}

export function formatTimeZoneLabel(timeZone: string, date: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', {
      timeZone, timeZoneName: 'short', hour: 'numeric',
    }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value;
    return part ? `${timeZone.replaceAll('_', ' ')} · ${part}` : timeZone;
  } catch {
    return timeZone;
  }
}

export function localDayStart(date: Date, timeZone: string): Date {
  return localDayBounds(date, timeZone).start;
}

export function shiftLocalDate(date: Date, timeZone: string, days: number): Date {
  const zoned = Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone);
  return validateInstant(new Date(zoned.add({ days }).epochMilliseconds));
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
