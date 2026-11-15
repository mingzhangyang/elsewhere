import { formatDate, formatTime, formatTimeZoneName } from '../domain/time';

/**
 * Locale-aware formatting shared by the message catalogs and components. Each catalog builds its own
 * with `formatters`, so numbers, dates, plurals and lists always follow the language being shown.
 */
export interface Formatters {
  /** BCP 47 tag passed to Intl. */
  readonly intl: string;
  /**
   * A number with exactly `digits` fraction digits (0 by default), grouped for the locale unless
   * `grouping` is false (readings such as 1013 hPa).
   */
  number(value: number, digits?: number, grouping?: boolean): string;
  /** Chooses a plural form for `count` with the locale's plural rules. */
  plural<T>(count: number, forms: { other: T } & Partial<Record<Intl.LDMLPluralRule, T>>): T;
  /** "a, b, and c" / "a、b和c". */
  list(items: readonly string[]): string;
  time(date: Date | null, timeZone: string, options?: Intl.DateTimeFormatOptions): string;
  /** Weekday, month, day and year. */
  date(date: Date, timeZone: string): string;
  /** Month, day and year. */
  shortDate(date: Date, timeZone: string): string;
  /** The time zone's display name. */
  zone(timeZone: string, date?: Date): string;
}

export function formatters(intl: string, zoneNames: 'id' | 'generic'): Formatters {
  const numbers = new Map<string, Intl.NumberFormat>();
  const rules = new Intl.PluralRules(intl);
  const lists = new Intl.ListFormat(intl, { type: 'conjunction' });
  return {
    intl,
    number(value, digits = 0, grouping = true) {
      const key = `${digits}:${grouping}`;
      let format = numbers.get(key);
      if (!format) {
        format = new Intl.NumberFormat(intl, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
          useGrouping: grouping,
        });
        numbers.set(key, format);
      }
      // Avoid "-0" for values that round to zero.
      return format.format(Object.is(Number(value.toFixed(digits)), -0) ? 0 : value);
    },
    plural: (count, forms) => forms[rules.select(count)] ?? forms.other,
    list: (items) => lists.format(items),
    time: (date, timeZone, options) => formatTime(date, timeZone, intl, options),
    date: (date, timeZone) => formatDate(date, timeZone, intl),
    shortDate: (date, timeZone) =>
      formatDate(date, timeZone, intl, { month: 'short', day: 'numeric', year: 'numeric' }),
    zone: (timeZone, date) => formatTimeZoneName(timeZone, intl, zoneNames, date),
  };
}
