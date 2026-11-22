import { describe, expect, it } from 'vitest';
import {
  assertDrawableSkyChartSnapshot,
  createSkyArtwork,
  skyArtworkGraphemeCount,
  type SkyArtworkInput,
} from '../src/lib/skyArtwork';
import type { SkyChartSnapshot } from '../src/domain/skyChartSnapshot';
import type { MemorialTime } from '../src/lib/memorialTime';
import { NEW_YORK, SYDNEY } from './fixtures/locations';

// All events are fictional test fixtures; none are personal birth records.
export const exactEvent: MemorialTime = {
  state: 'resolved',
  kind: 'exact',
  location: NEW_YORK,
  localDate: '2026-06-21',
  localTime: '12:00',
  utc: '2026-06-21T16:00:00.000Z',
  offset: '-04:00',
  disambiguation: null,
};

export function fixtureSnapshot(event: MemorialTime = exactEvent): SkyChartSnapshot {
  return {
    formatVersion: 1,
    utc: event.utc,
    time: {
      kind: event.kind,
      offset: event.offset,
      disambiguation: event.disambiguation,
      ...(event.kind === 'reference' ? { referenceSource: event.reference.source } : {}),
    },
    location: { ...event.location },
    options: { limitingMagnitude: 6 },
    provenance: {
      catalog: 'HYG v4.1 derivative',
      catalogStarCount: 5070,
      calculation: 'calculateSky / astronomy-engine',
      refraction: 'normal',
      projection: 'azimuthal-equidistant',
      selection: 'SM2-B',
      catalogHash: null,
    },
    objects: [
      { id: 'sun', kind: 'sun', altitude: 45, azimuth: 0, x: 0, y: -0.5, distanceKm: 150000000 },
      {
        id: 'moon',
        kind: 'moon',
        altitude: 0,
        azimuth: 90,
        x: -1,
        y: 0,
        phase: 'first-quarter',
        phaseAngle: 90,
        illumination: 0.5,
        waxing: true,
        distanceKm: 385000,
      },
      {
        id: 'venus',
        kind: 'planet',
        altitude: 45,
        azimuth: 180,
        x: 0,
        y: 0.5,
        name: 'Venus',
        magnitude: -4,
        illumination: 0.75,
        phaseAngle: 30,
        distanceKm: 90000000,
        radiusKm: 6051,
        elongation: 50,
        apparition: 'evening',
      },
      {
        id: 'hyg-42',
        kind: 'star',
        altitude: 45,
        azimuth: 270,
        x: 0.5,
        y: 0,
        name: 'Fictional test star',
        magnitude: 3.1,
        colorIndex: 0.75,
      },
    ],
  };
}

export function referenceEvent(localTime = '21:15'): MemorialTime {
  return {
    state: 'resolved',
    kind: 'reference',
    location: NEW_YORK,
    localDate: '2026-06-21',
    reference: { localTime, source: 'user' },
    utc: localTime === '21:15' ? '2026-06-22T01:15:00.000Z' : '2026-06-22T02:00:00.000Z',
    offset: '-04:00',
    disambiguation: null,
  };
}

export function artworkInput(overrides: Partial<SkyArtworkInput> = {}): SkyArtworkInput {
  return {
    event: exactEvent,
    snapshot: fixtureSnapshot(),
    locale: 'en',
    theme: 'midnight',
    ...overrides,
  };
}

describe('SM3-A artwork model and SM1 civil-time contract', () => {
  it('builds a versioned English artwork with all permanent scientific credits', () => {
    const artwork = createSkyArtwork(artworkInput());
    expect(artwork.formatVersion).toBe(1);
    expect(artwork.title).toBe('The sky remembers');
    expect(artwork.location).toContain('New York');
    expect(artwork.dateTime).toContain('June 21, 2026 · 12:00 (UTC−04:00)');
    expect(artwork.timeNote).toContain('Known exact');
    expect(artwork.scienceNote).toContain('weather');
    expect(artwork.daylightNote).toContain('Daytime');
    expect(artwork.starCredit).toContain('CC BY-SA 4.0');
    expect(artwork.starCredit).toContain('David Nash / Astronexus');
    expect(artwork.astronomyCredit).toContain('Astronomy Engine (MIT)');
  });

  it('uses the selected Chinese artwork language, not the host language', () => {
    const zh = createSkyArtwork(artworkInput({ locale: 'zh-Hans', theme: 'paper' }));
    expect(zh.title).toBe('星光记得这一刻');
    expect(zh.dateTime).toContain('2026年6月21日');
    expect(zh.timeNote).toContain('具体时刻');
    expect(zh.scienceNote).toContain('天气');
    expect(zh.starCredit).toContain('HYG v4.1');
  });

  it('counts Unicode graphemes rather than UTF-16 code units', () => {
    expect(skyArtworkGraphemeCount('e\u0301')).toBe(1);
    expect(skyArtworkGraphemeCount('👩‍👩‍👧‍👦')).toBe(1);
    expect(skyArtworkGraphemeCount('🇺🇸')).toBe(1);
    expect(skyArtworkGraphemeCount('汉字')).toBe(2);
    expect(createSkyArtwork(artworkInput({ title: '👩‍👩‍👧‍👦'.repeat(40) })).title).toHaveLength(440);
  });

  it('rejects overlong title and phrase without silently clipping', () => {
    expect(() => createSkyArtwork(artworkInput({ title: '汉'.repeat(41) }))).toThrow('40');
    expect(() => createSkyArtwork(artworkInput({ phrase: '👩‍🚀'.repeat(81) }))).toThrow('80');
    expect(createSkyArtwork(artworkInput({ title: '漢'.repeat(40), phrase: 'W'.repeat(80) })).phrase).toBe(
      'W'.repeat(80),
    );
  });

  it('accepts empty optional text, normalizes whitespace and treats HTML as literal text', () => {
    const blank = createSkyArtwork(artworkInput({ title: '', phrase: '  ' }));
    expect(blank.title).toBe('The sky remembers');
    expect(blank.phrase).toBe('');
    const literal = createSkyArtwork(artworkInput({ title: '<script>alert(1)</script>' }));
    expect(literal.title).toBe('<script>alert(1)</script>');
    expect(literal.title).not.toContain('&lt;');
  });

  it('rejects controls and bidi overrides rather than interpreting or hiding them', () => {
    expect(() => createSkyArtwork(artworkInput({ phrase: 'abc\u202edef' }))).toThrow();
    expect(() => createSkyArtwork(artworkInput({ phrase: 'a\nb' }))).toThrow();
    expect(() => createSkyArtwork(artworkInput({ title: 42 as never }))).toThrow(TypeError);
  });

  it('preserves an actual custom reference clock and the next UTC day', () => {
    const event = referenceEvent();
    const artwork = createSkyArtwork(artworkInput({ event, snapshot: fixtureSnapshot(event) }));
    expect(artwork.dateTime).toContain('June 21, 2026 · 21:15');
    expect(artwork.civilTime.utc).toBe('2026-06-22T01:15:00.000Z');
    expect(artwork.civilTime.referenceSource).toBe('user');
    expect(artwork.timeNote).toContain('not a known exact event time');
    expect(artwork.title).toBe('The sky remembers this day');
  });

  it('keeps default 22:00 only when already resolved and saved by SM1', () => {
    const event = {
      ...referenceEvent('22:00'),
      reference: { localTime: '22:00', source: 'default' },
    } as MemorialTime;
    const artwork = createSkyArtwork(artworkInput({ event, snapshot: fixtureSnapshot(event) }));
    expect(artwork.dateTime).toContain('22:00');
    expect(artwork.civilTime.referenceSource).toBe('default');
  });

  it('does not silently replace an exact moment with a reference, or vice versa', () => {
    const event = referenceEvent();
    expect(() => createSkyArtwork(artworkInput({ event }))).toThrow('disagree');
    expect(() =>
      createSkyArtwork(
        artworkInput({
          event: exactEvent,
          snapshot: { ...fixtureSnapshot(), time: { kind: 'utc', disambiguation: null } },
        }),
      ),
    ).toThrow('disagree');
  });

  it('rejects incorrect offset, UTC, DST choice, location and reference origin', () => {
    const reference = referenceEvent();
    for (const event of [
      { ...exactEvent, offset: '-05:00' },
      { ...exactEvent, utc: '2026-06-21T16:01:00.000Z' },
      { ...exactEvent, disambiguation: 'later' as const },
      { ...exactEvent, location: SYDNEY },
    ]) {
      expect(() => createSkyArtwork(artworkInput({ event }))).toThrow();
    }
    expect(() =>
      createSkyArtwork(
        artworkInput({
          event: reference,
          snapshot: {
            ...fixtureSnapshot(reference),
            time: { ...fixtureSnapshot(reference).time, referenceSource: 'default' },
          },
        }),
      ),
    ).toThrow('disagree');
  });

  it('preserves a selected DST fold and its saved historical offset', () => {
    const event: MemorialTime = {
      ...exactEvent,
      localDate: '2026-11-01',
      localTime: '01:30',
      utc: '2026-11-01T06:30:00.000Z',
      offset: '-05:00',
      disambiguation: 'later',
    };
    const artwork = createSkyArtwork(artworkInput({ event, snapshot: fixtureSnapshot(event) }));
    expect(artwork.civilTime.disambiguation).toBe('later');
    expect(artwork.dateTime).toContain('01:30 (UTC−05:00)');
  });

  it('uses local calendar information across UTC boundaries, without device-time conversion', () => {
    const event = referenceEvent();
    const snapshot = fixtureSnapshot(event);
    const result = createSkyArtwork(artworkInput({ event, snapshot }));
    expect(result.civilTime.localDate).toBe('2026-06-21');
    expect(result.dateTime).not.toContain('June 22');
  });

  it('marks daylight scenes, but keeps the visibility limitation on night scenes', () => {
    const withoutSun = {
      ...fixtureSnapshot(),
      objects: fixtureSnapshot().objects.filter((o) => o.kind !== 'sun'),
    };
    const night = createSkyArtwork(artworkInput({ snapshot: withoutSun }));
    expect(night.daylightNote).toBeNull();
    expect(night.scienceNote).toContain('naked-eye visibility');
  });

  it('rejects incomplete, damaged and unsupported snapshots instead of blank success', () => {
    const base = fixtureSnapshot();
    const broken = [
      { status: 'loading' },
      { ...base, formatVersion: 2 },
      { ...base, objects: null },
      { ...base, provenance: { ...base.provenance, catalogStarCount: 0 } },
      { ...base, provenance: { ...base.provenance, catalogHash: 'invented' } },
      { ...base, objects: [...base.objects, base.objects[0]] },
      { ...base, objects: [{ ...base.objects[0], x: 1.5 }] },
      { ...base, objects: [{ ...base.objects[0], altitude: -1 }] },
    ];
    for (const snapshot of broken) {
      expect(() => assertDrawableSkyChartSnapshot(snapshot as SkyChartSnapshot)).toThrow();
    }
  });

  it('accepts zero above-horizon objects only for a complete loaded catalog provenance', () => {
    const snapshot = { ...fixtureSnapshot(), objects: [] };
    expect(() => createSkyArtwork(artworkInput({ snapshot }))).not.toThrow();
  });

  it('rejects theme and language values not represented by the saved design', () => {
    expect(() => createSkyArtwork(artworkInput({ locale: 'fr' as never }))).toThrow();
    expect(() => createSkyArtwork(artworkInput({ theme: 'neon' as never }))).toThrow();
  });

  it('does not mutate external inputs and produces repeatable models', () => {
    const input = artworkInput({ title: 'An imaginary event', phrase: 'A quiet sky' });
    const before = JSON.stringify(input);
    const first = createSkyArtwork(input);
    expect(createSkyArtwork(input)).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.civilTime)).toBe(true);
  });
});
