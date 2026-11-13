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
  hour: number, minute: number, timeZone: string,
): Date {
  // Iteratively solve UTC = requested wall time - zone offset. This handles DST
  // offsets without relying on the browser's own time zone.
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = targetAsUtc;
  for (let i = 0; i < 4; i += 1) {
    const offset = getZoneOffset(new Date(guess), timeZone);
    const next = targetAsUtc - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function getZoneOffset(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const representedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return representedAsUtc - date.getTime();
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
  const p = getZonedParts(date, timeZone);
  return zonedDateTimeToUtc(p.year, p.month, p.day, 0, 0, timeZone);
}

export function shiftLocalDate(date: Date, timeZone: string, days: number): Date {
  const p = getZonedParts(date, timeZone);
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days, 12));
  return zonedDateTimeToUtc(
    shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(),
    p.hour, p.minute, timeZone,
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
