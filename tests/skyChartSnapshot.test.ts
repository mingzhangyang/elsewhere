import { beforeAll, describe, expect, it } from 'vitest';
import { INVALID_INPUT } from './skyEngineErrorMatchers';
import rows from '../src/data/stars.json';
import { calculateSky } from '../src/domain/astronomy';
import {
  assertSkyChartCatalog,
  buildPreparedSkyChartSnapshot,
  buildSkyChartSnapshot,
  prepareSkyChartSnapshotInput,
  type SkyChartSnapshotInput,
} from '../src/domain/skyChartSnapshot';
import { SkyChartCatalogNotReadyError } from '../src/domain/skyChartSelection';
import { loadStarCatalog, STAR_CATALOG, type CatalogRow, type CatalogStar } from '../src/domain/stars';
import {
  createSkyChartSnapshotCoordinator,
  prepareSkyChartSnapshotRequest,
} from '../src/services/skyChartSnapshot';
import type { LocationInfo, PlanetId, SkyState } from '../src/types';
import { NEW_YORK, SYDNEY, TROMSO } from './fixtures/locations';

const input = (
  utc = '2026-06-21T16:00:00.000Z',
  location: LocationInfo = NEW_YORK,
): SkyChartSnapshotInput => ({
  time: { kind: 'utc', utc },
  location,
});
const catalog: CatalogStar[] = [
  {
    id: 'hyg-1',
    catalogId: 1,
    name: 'Sample',
    ra: 12,
    dec: 20,
    magnitude: 5.5,
    colorIndex: 0.6,
    pmra: 0,
    pmdec: 0,
  },
];
const planetIds: PlanetId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
function sampleSky() {
  const sky = {
    sun: { altitude: 25, azimuth: 0, geometricAltitude: 24.5, visible: true, distanceKm: 149600000 },
    moon: {
      altitude: 0,
      azimuth: 90,
      geometricAltitude: -0.5,
      visible: false,
      phase: 'waxing-crescent',
      phaseAngle: 45,
      illumination: 0.18,
      waxing: true,
      distanceKm: 384400,
      brightLimbAngle: 10,
      north: [0, 1, 0],
      prime: [1, 0, 0],
    },
    planets: planetIds.map((id, index) => ({
      id,
      name: id,
      altitude: index * 10,
      azimuth: index * 60,
      geometricAltitude: index * 10 - 0.5,
      visible: true,
      magnitude: -1,
      illumination: 0.8,
      phaseAngle: 40,
      distanceKm: 60000000,
      radiusKm: 3000,
      elongation: 65,
      apparition: 'evening',
      brightLimbAngle: 0,
    })),
    stars: catalog.map((star) => ({
      id: star.id,
      name: star.name,
      ra: star.ra,
      dec: star.dec,
      magnitude: star.magnitude,
      colorIndex: star.colorIndex,
      altitude: 30,
      azimuth: 270,
    })),
    starField: {
      vectors: new Float32Array(3),
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      precession: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    },
  };
  return sky as unknown as SkyState;
}
const snapshot = (sky: SkyState = sampleSky(), options: SkyChartSnapshotInput = input()) =>
  buildSkyChartSnapshot(options, sky, catalog);
const invalid = (x: unknown) => x as SkyChartSnapshotInput;

// These tests use a small fully described synthetic catalog. They are NOT real ephemeris references.
describe('SM2-C snapshot: pure calculation and data contracts (synthetic)', () => {
  it('rejects an unloaded star catalog, never returning a successful blank chart', () => {
    expect(() => buildSkyChartSnapshot(input(), sampleSky(), [])).toThrow(SkyChartCatalogNotReadyError);
  });
  it('includes seven solar-system bodies plus a star in selection order', () => {
    const objects = snapshot().objects;
    expect(objects.map((o) => o.id)).toEqual(['sun', 'moon', ...planetIds, 'hyg-1']);
    expect(objects.find((o) => o.id === 'hyg-1')).toMatchObject({ magnitude: 5.5, colorIndex: 0.6 });
    expect(objects.find((o) => o.kind === 'moon')).toMatchObject({
      illumination: 0.18,
      phase: 'waxing-crescent',
    });
    expect(objects.find((o) => o.kind === 'planet')).toMatchObject({ radiusKm: 3000, apparition: 'evening' });
    expect(snapshot().provenance).toMatchObject({
      catalogStarCount: 1,
      catalogHash: null,
      selection: 'SM2-B',
    });
  });
  it('puts an exact-horizon Moon on the rim; north up, east left', () => {
    const moon = snapshot().objects.find((o) => o.kind === 'moon');
    expect(moon?.x).toBeCloseTo(-1, 12);
    expect(moon?.y).toBeCloseTo(0, 12);
    const north = snapshot().objects.find((o) => o.kind === 'sun');
    expect(north?.x).toBeCloseTo(0, 12);
    expect(north?.y).toBeLessThan(0);
  });
  it('excludes below-horizon bodies and allows zero selected stars when catalog is complete', () => {
    const sky = sampleSky();
    sky.stars[0].altitude = -1;
    sky.planets[0].altitude = -1;
    const result = snapshot(sky);
    expect(result.objects.some((o) => o.kind === 'star')).toBe(false);
    expect(result.objects.some((o) => o.id === 'mercury')).toBe(false);
    expect(result.provenance.catalogStarCount).toBe(1);
  });
  it('enforces default magnitude 6.0 and records an explicit override', () => {
    const sky = sampleSky();
    sky.stars[0].magnitude = 6.5;
    const dimCatalog = [{ ...catalog[0], magnitude: 6.5 }];
    expect(buildSkyChartSnapshot(input(), sky, dimCatalog).objects.some((o) => o.kind === 'star')).toBe(
      false,
    );
    const custom = buildSkyChartSnapshot({ ...input(), limitingMagnitude: 7 }, sky, dimCatalog);
    expect(custom.options.limitingMagnitude).toBe(7);
    expect(custom.objects.some((o) => o.kind === 'star')).toBe(true);
    expect(snapshot().options.limitingMagnitude).toBe(6);
  });
  it('rejects empty, duplicated, invalid and incomplete catalog records', () => {
    expect(() => assertSkyChartCatalog([])).toThrow(SkyChartCatalogNotReadyError);
    for (const bad of [
      [{ ...catalog[0], ra: NaN }],
      [{ ...catalog[0], dec: 91 }],
      [{ ...catalog[0], colorIndex: Infinity }],
      [{ ...catalog[0], name: null as never }],
      [{ ...catalog[0], pmra: NaN }],
      [...catalog, { ...catalog[0] }],
    ])
      expect(() => assertSkyChartCatalog(bad)).toThrow();
  });
  it('rejects missing or corrupt stars even if no star would be selected', () => {
    const sky = sampleSky();
    sky.stars[0].altitude = -30;
    expect(() => snapshot({ ...sky, stars: [] })).toThrow();
    expect(() => snapshot({ ...sky, stars: [{ ...sky.stars[0], magnitude: NaN }] })).toThrow();
    expect(() => snapshot({ ...sky, stars: [{ ...sky.stars[0], id: 'hyg-999' }] })).toThrow();
    expect(() =>
      snapshot({ ...sky, starField: { ...sky.starField, vectors: new Float32Array() } }),
    ).toThrow();
  });
  it('rejects missing/duplicated planets and incomplete physical properties', () => {
    const sky = sampleSky();
    expect(() => snapshot({ ...sky, planets: sky.planets.slice(1) })).toThrow();
    expect(() => snapshot({ ...sky, planets: [...sky.planets.slice(0, 4), sky.planets[0]] })).toThrow();
    expect(() =>
      snapshot({ ...sky, planets: [{ ...sky.planets[0], radiusKm: NaN }, ...sky.planets.slice(1)] }),
    ).toThrow();
    expect(() => snapshot({ ...sky, moon: { ...sky.moon, illumination: NaN } })).toThrow();
    expect(() => snapshot({ ...sky, sun: { ...sky.sun, distanceKm: NaN } })).toThrow();
  });
  it('rejects invalid positions and star magnitudes through the unchanged SM2-B selector', () => {
    const sky = sampleSky();
    expect(() => snapshot({ ...sky, sun: { ...sky.sun, altitude: 95 } })).toThrow(INVALID_INPUT);
    expect(() => snapshot({ ...sky, moon: { ...sky.moon, azimuth: NaN } })).toThrow(INVALID_INPUT);
    expect(() => snapshot({ ...sky, stars: [{ ...sky.stars[0], altitude: Infinity }] })).toThrow();
    expect(() =>
      snapshot({ ...sky, planets: [{ ...sky.planets[0], altitude: NaN }, ...sky.planets.slice(1)] }),
    ).toThrow();
  });
  it('keeps all returned coordinates finite in the unit disc', () => {
    for (const object of snapshot().objects) {
      expect(Number.isFinite(object.x) && Number.isFinite(object.y)).toBe(true);
      expect(Math.hypot(object.x, object.y)).toBeLessThanOrEqual(1 + 1e-12);
    }
  });
  it('is repeatable, ignores irrelevant sky data and input order', () => {
    const first = snapshot();
    const reordered = sampleSky();
    reordered.planets.reverse();
    reordered.stars.reverse();
    const second = snapshot(reordered);
    expect(second).toEqual(first);
    expect(snapshot({ ...sampleSky(), events: { arbitrary: 1 } } as never)).toEqual(first);
    expect(snapshot({ ...sampleSky(), weather: { cloudCover: 100 } } as never)).toEqual(first);
  });
  it('isolates snapshot from subsequent input mutation and does not mutate frozen sources', () => {
    const place = { ...NEW_YORK };
    const sky = sampleSky();
    const result = snapshot(sky, input(undefined, place));
    sky.stars[0].altitude = -10;
    sky.moon.altitude = -20;
    place.latitude = 0;
    expect(result.location.latitude).toBe(NEW_YORK.latitude);
    expect(result.objects.some((o) => o.kind === 'star')).toBe(true);
    expect(Object.isFrozen(result.objects[0])).toBe(true);
    expect(Object.isFrozen(result.objects)).toBe(true);
    expect(() => snapshot(Object.freeze(sampleSky()))).not.toThrow();
  });
  it('different instants, places and options create different metadata', () => {
    const a = snapshot();
    expect(snapshot(sampleSky(), input('2026-06-21T17:00:00.000Z')).utc).not.toBe(a.utc);
    expect(snapshot(sampleSky(), input(undefined, SYDNEY)).location.latitude).not.toBe(a.location.latitude);
    expect(snapshot(sampleSky(), { ...input(), limitingMagnitude: 3 }).options).not.toEqual(a.options);
  });
  it('supports UTC edge instants and rejects out-of-range, local and invalid timestamps', () => {
    for (const utc of ['1900-01-01T00:00:00.000Z', '2100-12-31T23:59:59.999Z']) {
      expect(snapshot(sampleSky(), input(utc)).utc).toBe(utc);
    }
    for (const utc of [
      '1899-12-31T23:59:59.999Z',
      '2101-01-01T00:00:00.000Z',
      '2026-06-21T12:00:00-04:00',
      '2026-06-21T16:00:00Z',
      'not-a-date',
    ]) {
      expect(() => prepareSkyChartSnapshotInput(input(utc))).toThrow();
    }
  });
  it('preserves previously resolved SM1 exact versus reference time and DST fold choice', () => {
    const folded = {
      state: 'resolved',
      kind: 'exact',
      localTime: '01:30',
      localDate: '2026-11-01',
      utc: '2026-11-01T06:30:00.000Z',
      offset: '-05:00',
      disambiguation: 'later',
      location: NEW_YORK,
    } as const;
    const result = buildPreparedSkyChartSnapshot(
      prepareSkyChartSnapshotRequest({ time: folded }),
      sampleSky(),
      catalog,
    );
    expect(result.time).toEqual({ kind: 'exact', offset: '-05:00', disambiguation: 'later' });
    const reference = {
      ...folded,
      kind: 'reference',
      reference: { localTime: '01:30', source: 'user' },
    } as const;
    expect(prepareSkyChartSnapshotRequest({ time: reference }).time).toMatchObject({
      kind: 'reference',
      referenceSource: 'user',
    });
    expect(() => prepareSkyChartSnapshotRequest({ time: { ...folded, offset: '-04:00' } })).toThrow();
  });
  it('rejects invalid location, magnitude and wrong time type', () => {
    for (const location of [
      { ...NEW_YORK, latitude: 91 },
      { ...NEW_YORK, longitude: NaN },
      { ...NEW_YORK, timezone: 'Broken/Timezone' },
    ]) {
      expect(() => prepareSkyChartSnapshotInput(input(undefined, location))).toThrow();
    }
    for (const limitingMagnitude of [-6, 21, NaN, Infinity]) {
      expect(() => prepareSkyChartSnapshotInput({ ...input(), limitingMagnitude })).toThrow();
    }
    expect(() => prepareSkyChartSnapshotInput(invalid({ time: { kind: 'reference' } }))).toThrow();
  });
  it('uses the same north-up, east-left local geometry in both hemispheres', () => {
    const north = snapshot(sampleSky(), input(undefined, NEW_YORK)).objects;
    const south = snapshot(sampleSky(), input(undefined, SYDNEY)).objects;
    expect(south.map((o) => [o.x, o.y])).toEqual(north.map((o) => [o.x, o.y]));
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}

describe('SM2-C resource coordinator (synthetic injection)', () => {
  it('signals loading, coalesces simultaneous waits, and marks superseded requests stale', async () => {
    const pending = deferred<void>();
    let loaded = false;
    let attempts = 0;
    const coordinator = createSkyChartSnapshotCoordinator({
      catalogLoaded: () => loaded,
      loadCatalog: () => {
        attempts += 1;
        return pending.promise;
      },
      getCatalog: () => catalog,
      calculate: () => sampleSky(),
    });
    const observed: string[] = [];
    const older = coordinator.generate(input(), (s) => observed.push(`old:${s.status}`));
    const newer = coordinator.generate(input('2026-06-21T17:00:00.000Z'), (s) =>
      observed.push(`new:${s.status}`),
    );
    await Promise.resolve();
    expect(attempts).toBe(1);
    expect(observed).toEqual(['old:loading', 'new:loading']);
    loaded = true;
    pending.resolve();
    expect((await older).status).toBe('stale');
    expect((await newer).status).toBe('ready');
    expect(observed).toEqual(['old:loading', 'new:loading', 'new:ready']);
  });
  it('reports resource loader failure distinctly and permits retry', async () => {
    let loaded = false;
    let attempts = 0;
    const coordinator = createSkyChartSnapshotCoordinator({
      catalogLoaded: () => loaded,
      loadCatalog: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('private URL must not appear');
        loaded = true;
      },
      getCatalog: () => catalog,
      calculate: () => sampleSky(),
    });
    const failed = await coordinator.generate(input());
    expect(failed).toMatchObject({ status: 'error', code: 'catalog-load' });
    expect(JSON.stringify(failed)).not.toContain('private URL');
    expect((await coordinator.generate(input())).status).toBe('ready');
    expect(attempts).toBe(2);
  });
  it('rejects a loader resolving without actually making the catalog ready', async () => {
    const result = await createSkyChartSnapshotCoordinator({
      catalogLoaded: () => false,
      loadCatalog: async () => {},
      getCatalog: () => catalog,
      calculate: () => sampleSky(),
    }).generate(input());
    expect(result).toMatchObject({ status: 'error', code: 'catalog-data' });
  });
  it('rejects corrupted loaded resources and failed computation instead of ready', async () => {
    const base = { catalogLoaded: () => true, loadCatalog: async () => {}, calculate: () => sampleSky() };
    expect(
      await createSkyChartSnapshotCoordinator({ ...base, getCatalog: () => [] }).generate(input()),
    ).toMatchObject({ status: 'error', code: 'catalog-data', message: 'SkyEngineError:MISSING_ASSET' });
    expect(
      await createSkyChartSnapshotCoordinator({
        ...base,
        getCatalog: () => catalog,
        calculate: () => {
          throw new Error('fatal');
        },
      }).generate(input()),
    ).toMatchObject({ status: 'error', code: 'calculation', message: 'Error' });
    expect(
      await createSkyChartSnapshotCoordinator({
        ...base,
        getCatalog: () => catalog,
        calculate: () => ({ ...sampleSky(), stars: [] }),
      }).generate(input()),
    ).toMatchObject({ status: 'error', code: 'snapshot' });
  });
  it('captures time/location before awaiting loading and revokes unfinished requests', async () => {
    const pending = deferred<void>();
    let loaded = false;
    const coordinator = createSkyChartSnapshotCoordinator({
      catalogLoaded: () => loaded,
      loadCatalog: () => pending.promise,
      getCatalog: () => catalog,
      calculate: () => sampleSky(),
    });
    const place = { ...NEW_YORK };
    const original = coordinator.generate(input(undefined, place));
    place.latitude = 5;
    loaded = true;
    pending.resolve();
    const result = await original;
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.snapshot.location.latitude).toBe(NEW_YORK.latitude);
    const slow = deferred<void>();
    const next = createSkyChartSnapshotCoordinator({
      catalogLoaded: () => false,
      loadCatalog: () => slow.promise,
      getCatalog: () => catalog,
      calculate: () => sampleSky(),
    });
    const waiting = next.generate(input());
    next.invalidate();
    slow.resolve();
    expect((await waiting).status).toBe('stale');
  });
  it('rejects malformed raw-UTC time zones before loading or calculation', async () => {
    let loads = 0;
    let calculations = 0;
    const coordinator = createSkyChartSnapshotCoordinator({
      catalogLoaded: () => false,
      loadCatalog: async () => {
        loads += 1;
      },
      getCatalog: () => catalog,
      calculate: () => {
        calculations += 1;
        return sampleSky();
      },
    });
    for (const timezone of [undefined, null, '', '   ', 42]) {
      const malformed = invalid({ ...input(), location: { ...NEW_YORK, timezone } });
      expect(() => prepareSkyChartSnapshotInput(malformed)).toThrow(INVALID_INPUT);
      expect(await coordinator.generate(malformed)).toMatchObject({ status: 'error', code: 'input' });
    }
    expect(loads).toBe(0);
    expect(calculations).toBe(0);
  });
  it('reports invalid input without requesting resources', async () => {
    let loads = 0;
    const coordinator = createSkyChartSnapshotCoordinator({
      catalogLoaded: () => false,
      loadCatalog: async () => {
        loads++;
      },
      getCatalog: () => catalog,
      calculate: () => sampleSky(),
    });
    expect(await coordinator.generate(input('bad-utc'))).toMatchObject({ status: 'error', code: 'input' });
    expect(loads).toBe(0);
  });
});

// Runs the actual project loader, Astronomy Engine, SM2-B selector and SM2-A projection.
// The observations below are an in-project integration check, not JPL/USNO independent evidence.
describe('SM2-C real loaded HYG/astronomy integration', () => {
  beforeAll(async () => {
    await loadStarCatalog(async () => rows as CatalogRow[]);
  });
  it('loads real catalog rows, computes a real day sky and projects its above-horizon stars', async () => {
    const coordinator = createSkyChartSnapshotCoordinator();
    const result = await coordinator.generate(input());
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { snapshot: chart } = result;
    expect(chart.provenance.catalogStarCount).toBe(STAR_CATALOG.length);
    expect(chart.provenance.catalogStarCount).toBeGreaterThan(5000);
    const stars = chart.objects.filter((o) => o.kind === 'star');
    expect(stars.length).toBeGreaterThan(100);
    expect(stars.every((s) => s.altitude >= 0 && s.magnitude <= 6)).toBe(true);
    expect(
      chart.objects.every(
        (o) => Number.isFinite(o.x) && Number.isFinite(o.y) && Math.hypot(o.x, o.y) <= 1 + 1e-12,
      ),
    ).toBe(true);
    const again = await coordinator.generate(input());
    expect(again.status).toBe('ready');
    if (again.status === 'ready') expect(again.snapshot).toEqual(chart);
  });
  it('S03 uses real calculated horizon-near objects without claiming independent references', () => {
    const sky = calculateSky(NEW_YORK, new Date('2026-06-21T16:00:00.000Z'));
    const chart = buildSkyChartSnapshot(input(), sky);
    const near = sky.stars.filter((s) => Math.abs(s.altitude) < 2 && s.magnitude <= 6);
    expect(near.length).toBeGreaterThan(0);
    for (const star of near) {
      expect(chart.objects.some((o) => o.id === star.id)).toBe(star.altitude >= 0);
    }
  });
  it('S04 draws real computed New York daytime stars; no environment visibility applied', () => {
    const chart = buildSkyChartSnapshot(
      input(),
      calculateSky(NEW_YORK, new Date('2026-06-21T16:00:00.000Z')),
    );
    expect(chart.objects.find((o) => o.kind === 'sun')?.altitude).toBeGreaterThan(0);
    expect(chart.objects.some((o) => o.kind === 'star')).toBe(true);
  });
  it('S05 produces independent observer snapshots in both hemispheres and high latitudes', () => {
    for (const place of [SYDNEY, TROMSO]) {
      const moment = new Date('2026-06-21T16:00:00.000Z');
      const chart = buildSkyChartSnapshot(input(moment.toISOString(), place), calculateSky(place, moment));
      expect(chart.location.latitude).toBe(place.latitude);
      expect(chart.objects.length).toBeGreaterThan(20);
      expect(chart.objects.every((o) => Math.hypot(o.x, o.y) <= 1 + 1e-12)).toBe(true);
    }
  });
});
