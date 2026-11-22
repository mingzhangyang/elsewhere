import type { SkyChartSnapshot, SkyChartSnapshotObject } from '../domain/skyChartSnapshot';
import { assertMemorialTimeConsistency, type MemorialTime } from './memorialTime';
import type { Locale } from '../i18n/locale';

export type SkyArtworkTheme = 'midnight' | 'paper';

/** SM3-A has one deliberately fixed design, independent of the explorer and its weather. */
export interface SkyArtworkInput {
  readonly snapshot: SkyChartSnapshot;
  /** The resolved SM1 civil-time record, not a newly inferred time from the UTC snapshot. */
  readonly event: MemorialTime;
  readonly locale: Locale;
  readonly theme: SkyArtworkTheme;
  readonly title?: string;
  readonly phrase?: string;
}

export interface SkyArtwork {
  readonly formatVersion: 1;
  readonly snapshot: SkyChartSnapshot;
  readonly locale: Locale;
  readonly theme: SkyArtworkTheme;
  readonly title: string;
  readonly phrase: string;
  readonly location: string;
  readonly dateTime: string;
  readonly timeNote: string;
  readonly scienceNote: string;
  readonly daylightNote: string | null;
  readonly starCredit: string;
  readonly astronomyCredit: string;
  readonly civilTime: Readonly<{
    kind: 'exact' | 'reference';
    utc: string;
    localDate: string;
    localTime: string;
    offset: string;
    disambiguation: 'earlier' | 'later' | null;
    referenceSource: 'default' | 'user' | null;
  }>;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const;

/** Segment by visible graphemes, never UTF-16 code units (ZWJ emoji count as one). */
export function skyArtworkGraphemeCount(text: string): number {
  if (typeof text !== 'string') throw new TypeError('Artwork text must be a string.');
  return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].length;
}

function plainText(value: unknown, max: number, label: string): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new TypeError(label + ' must be plain text.');
  // No invisible controls, bidi overrides or HTML handling. Newlines are whitespace, not markup.
  if (
    [...value].some((character) => {
      const point = character.codePointAt(0)!;
      return (
        point < 0x20 ||
        (point >= 0x7f && point <= 0x9f) ||
        (point >= 0x202a && point <= 0x202e) ||
        (point >= 0x2066 && point <= 0x2069)
      );
    })
  ) {
    throw new RangeError(label + ' contains unsupported control characters.');
  }
  const clean = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (skyArtworkGraphemeCount(clean) > max) {
    throw new RangeError(label + ' exceeds ' + max + ' visible characters.');
  }
  return clean;
}

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(label + ' must be an object.');
  }
}

function finite(value: unknown, low: number, high: number, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
    throw new RangeError('Invalid ' + label + '.');
  }
}

function validSnapshotObject(object: SkyChartSnapshotObject, ids: Set<string>): void {
  record(object, 'Snapshot object');
  if (typeof object.id !== 'string' || !object.id.trim() || ids.has(object.id)) {
    throw new RangeError('Missing or duplicated snapshot object ID.');
  }
  ids.add(object.id);
  finite(object.altitude, 0, 90, 'snapshot altitude');
  finite(object.azimuth, -Infinity, Infinity, 'snapshot azimuth');
  finite(object.x, -1 - 1e-12, 1 + 1e-12, 'snapshot x');
  finite(object.y, -1 - 1e-12, 1 + 1e-12, 'snapshot y');
  if (Math.hypot(object.x, object.y) > 1 + 1e-12) {
    throw new RangeError('Snapshot object is outside the unit horizon.');
  }
  switch (object.kind) {
    case 'sun':
      if (object.id !== 'sun') throw new RangeError('Invalid Sun ID.');
      finite(object.distanceKm, Number.MIN_VALUE, Infinity, 'Sun distance');
      break;
    case 'moon':
      if (object.id !== 'moon') throw new RangeError('Invalid Moon ID.');
      finite(object.distanceKm, Number.MIN_VALUE, Infinity, 'Moon distance');
      finite(object.illumination, 0, 1, 'Moon illumination');
      if (typeof object.phase !== 'string' || typeof object.waxing !== 'boolean') {
        throw new RangeError('Incomplete Moon phase.');
      }
      break;
    case 'planet':
      if (!PLANETS.includes(object.id)) throw new RangeError('Invalid planet ID.');
      finite(object.magnitude, -Infinity, Infinity, 'planet magnitude');
      break;
    case 'star':
      if (!object.id.startsWith('hyg-') || typeof object.name !== 'string') {
        throw new RangeError('Invalid HYG star.');
      }
      finite(object.magnitude, -Infinity, Infinity, 'star magnitude');
      if (object.colorIndex !== null) {
        finite(object.colorIndex, -Infinity, Infinity, 'star color index');
      }
      break;
    default:
      throw new RangeError('Unknown snapshot object kind.');
  }
}

/**
 * Reject unready/partial or contradictory snapshots. This does not project, select or
 * recompute positions: x/y supplied by SM2-C are the only drawing coordinates.
 */
export function assertDrawableSkyChartSnapshot(snapshot: SkyChartSnapshot): void {
  record(snapshot, 'Sky chart snapshot');
  if (snapshot.formatVersion !== 1 || typeof snapshot.utc !== 'string') {
    throw new RangeError('Unsupported sky chart snapshot version or UTC.');
  }
  const date = new Date(snapshot.utc);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== snapshot.utc) {
    throw new RangeError('Snapshot UTC must be canonical.');
  }
  record(snapshot.time, 'Snapshot time');
  record(snapshot.location, 'Snapshot location');
  record(snapshot.options, 'Snapshot options');
  record(snapshot.provenance, 'Snapshot provenance');
  const p = snapshot.provenance;
  if (
    p.catalog !== 'HYG v4.1 derivative' ||
    p.calculation !== 'calculateSky / astronomy-engine' ||
    p.refraction !== 'normal' ||
    p.projection !== 'azimuthal-equidistant' ||
    p.selection !== 'SM2-B' ||
    p.catalogHash !== null
  ) {
    throw new RangeError('Snapshot provenance is incomplete or incompatible.');
  }
  finite(p.catalogStarCount, 1, Infinity, 'catalog row count');
  if (!Number.isSafeInteger(p.catalogStarCount)) throw new RangeError('Invalid catalog row count.');
  finite(snapshot.options.limitingMagnitude, -5, 20, 'limiting magnitude');
  if (!Array.isArray(snapshot.objects)) throw new RangeError('Snapshot objects must be an array.');
  const ids = new Set<string>();
  for (const object of snapshot.objects) validSnapshotObject(object, ids);
  // An empty above-horizon selection is allowed when the catalog really was loaded.
  // A loading/error/stale coordinator state is NOT a SkyChartSnapshot.
}

/** Explicitly compare the original event against snapshot metadata; never infer a DST fold. */
function assertMatchingCivilTime(snapshot: SkyChartSnapshot, event: MemorialTime): void {
  assertMemorialTimeConsistency(event);
  if (
    snapshot.utc !== event.utc ||
    snapshot.time.kind !== event.kind ||
    snapshot.time.disambiguation !== event.disambiguation ||
    snapshot.time.offset !== event.offset ||
    (event.kind === 'reference' && snapshot.time.referenceSource !== event.reference.source)
  ) {
    throw new RangeError('Resolved civil time and sky chart snapshot disagree.');
  }
  const place = snapshot.location;
  if (
    place.id !== event.location.id ||
    place.name !== event.location.name ||
    place.country !== event.location.country ||
    place.latitude !== event.location.latitude ||
    place.longitude !== event.location.longitude ||
    place.elevation !== event.location.elevation ||
    place.timezone !== event.location.timezone ||
    place.source !== event.location.source
  ) {
    throw new RangeError('Resolved civil-time location does not match the snapshot.');
  }
}

function localDateLabel(localDate: string, locale: Locale): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return locale === 'zh-Hans'
    ? year + '年' + month + '月' + day + '日'
    : MONTHS[month - 1] + ' ' + day + ', ' + year;
}

/**
 * Validated, display-ready model. Only accepts SM1-resolved exact/reference records
 * paired to their SM2-C snapshots; raw-UTC snapshots need an explicit resolved
 * memorial request before they can become an artwork.
 */
export function createSkyArtwork(input: SkyArtworkInput): SkyArtwork {
  record(input, 'Sky artwork input');
  assertDrawableSkyChartSnapshot(input.snapshot);
  if (input.locale !== 'en' && input.locale !== 'zh-Hans') {
    throw new RangeError('Unsupported artwork language.');
  }
  if (input.theme !== 'midnight' && input.theme !== 'paper') {
    throw new RangeError('Unsupported artwork theme.');
  }
  assertMatchingCivilTime(input.snapshot, input.event);
  const event = input.event;
  const isReference = event.kind === 'reference';
  const localTime = event.kind === 'exact' ? event.localTime : event.reference.localTime;
  const title = plainText(input.title, 40, 'Title');
  const phrase = plainText(input.phrase, 80, 'Phrase');
  const zh = input.locale === 'zh-Hans';
  const dateTime =
    localDateLabel(event.localDate, input.locale) +
    ' · ' +
    localTime +
    ' (UTC' +
    event.offset.replace('-', '−') +
    ')';
  const civilTime = Object.freeze({
    kind: event.kind,
    utc: event.utc,
    localDate: event.localDate,
    localTime,
    offset: event.offset,
    disambiguation: event.disambiguation,
    referenceSource: isReference ? event.reference.source : null,
  });
  return Object.freeze({
    formatVersion: 1,
    snapshot: input.snapshot,
    locale: input.locale,
    theme: input.theme,
    title:
      title ||
      (zh
        ? isReference
          ? '这一天的星空'
          : '此刻的星空'
        : isReference
          ? 'The sky on this day'
          : 'Under this sky'),
    phrase,
    location: plainText(
      input.snapshot.location.name + ' · ' + input.snapshot.location.country,
      200,
      'Location',
    ),
    dateTime,
    timeNote: zh
      ? isReference
        ? '计算参考时刻，非已知的事件确切时间'
        : '事件发生地的已知具体时刻'
      : isReference
        ? 'Reference time for calculation — not a known exact event time'
        : 'Known exact local event time',
    scienceNote: zh
      ? '天体位置计算示意；不模拟日光、天气遮挡或肉眼可见性。'
      : 'Calculated positions; daylight, weather and naked-eye visibility are not simulated.',
    daylightNote: input.snapshot.objects.some((object) => object.kind === 'sun')
      ? zh
        ? '白天星图：图中天体不代表当时肉眼可见。'
        : 'Daytime diagram: objects may not have been visible to the unaided eye.'
      : null,
    starCredit: zh
      ? '恒星：HYG v4.1 衍生数据 · David Nash / Astronexus · CC BY-SA 4.0'
      : 'Stars: HYG v4.1 derivative · David Nash / Astronexus · CC BY-SA 4.0',
    astronomyCredit: zh
      ? '位置：Astronomy Engine (MIT) · 标准折射 · 方位等距投影'
      : 'Positions: Astronomy Engine (MIT) · standard refraction · azimuthal equidistant',
    civilTime,
  });
}
