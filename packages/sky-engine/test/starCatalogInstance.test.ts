import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import * as shared from '../src';
import type * as Engine from '../src';
import type { CatalogRow } from '../src';
import { INVALID_INPUT } from './errorMatchers';
import { NEW_YORK } from './fixtures/locations';

// createStarCatalog() builds an immutable catalog object that scenes and renderers can use instead
// of the module's default catalog, which they then neither need nor change.
// `shared` is the module instance the setup file installed the default catalog in.
const rows = async (): Promise<CatalogRow[]> =>
  shared.decodeStarColumns(JSON.parse(await readFile('src/data/stars.json', 'utf8')));
const observer = {
  latitude: NEW_YORK.latitude,
  longitude: NEW_YORK.longitude,
  timezone: NEW_YORK.timezone,
  instant: new Date('2026-09-18T04:00:00Z'),
  weather: 'clear' as const,
  view: { heading: 180, altitude: 25, fov: 66 },
};

/** A separate module instance with no default catalog installed. */
async function freshEngine(): Promise<typeof Engine> {
  vi.resetModules();
  return import('../src');
}

afterEach(() => {
  vi.resetModules();
});

it('validates rows and returns a frozen catalog with resolved built-in patterns', async () => {
  const engine = shared;
  const catalog = engine.createStarCatalog(await rows());
  expect(catalog.stars).toEqual(engine.getStarCatalog());
  expect(catalog.patterns).toEqual(engine.getPatterns());
  // A separate object from the installed default, frozen throughout.
  expect(catalog.stars).not.toBe(engine.getStarCatalog());
  for (const value of [
    catalog,
    catalog.stars,
    catalog.stars[0],
    catalog.patterns,
    catalog.patterns[0].lines,
  ]) {
    expect(Object.isFrozen(value)).toBe(true);
  }
  expect(() => engine.createStarCatalog([])).toThrow(INVALID_INPUT);
  const [first, ...rest] = await rows();
  expect(() => engine.createStarCatalog([[first[0], first[1], 25, ...first.slice(3)], ...rest])).toThrow(
    /right ascension/,
  );
  expect(() => engine.createStarCatalog([first, first, ...rest])).toThrow(/Duplicate/);
});

it('creates scenes from an explicit catalog without loading or installing the default', async () => {
  const engine = await freshEngine();
  const loadCatalog = vi.fn(async () => []);
  const catalog = engine.createStarCatalog(await rows());
  const scene = await engine.createSkyScene({ ...observer, catalog, loadCatalog });
  expect(loadCatalog).not.toHaveBeenCalled();
  expect(engine.starCatalogLoaded()).toBe(false);
  expect(engine.getStarCatalog()).toEqual([]);
  expect(scene.sky.stars).toHaveLength(catalog.stars.length);
});

it('calculates the same sky as the default catalog, and follows a catalog that differs', async () => {
  const decoded = await rows();
  const reference = await shared.createSkyScene(observer);
  const same = await shared.createSkyScene({ ...observer, catalog: shared.createStarCatalog(decoded) });
  expect(same.sky.stars).toEqual(reference.sky.stars);
  expect(same.sky.starField.vectors).toEqual(reference.sky.starField.vectors);
  // Reversed rows: the same stars in the opposite order, and the default catalog is untouched.
  const reversed = await shared.createSkyScene({
    ...observer,
    catalog: shared.createStarCatalog([...decoded].reverse()),
  });
  expect(reversed.sky.stars).toEqual([...reference.sky.stars].reverse());
  expect(shared.getStarCatalog()[0].id).toBe(reference.sky.stars[0].id);
  // advanced.calculateSky takes the catalog as its fourth argument.
  const direct = shared.advanced.calculateSky(
    NEW_YORK,
    observer.instant,
    undefined,
    shared.createStarCatalog(decoded),
  );
  expect(direct.stars).toEqual(shared.advanced.calculateSky(NEW_YORK, observer.instant).stars);
});

it('renders a scene with the catalog that made it, with no default installed', async () => {
  const engine = await freshEngine();
  const catalog = engine.createStarCatalog(await rows());
  const scene = await engine.createSkyScene({ ...observer, catalog });
  // The built-in patterns come from the scene's catalog: a built-in pattern is known.
  const framed = engine.prepareIllustrationScene(scene, 800, 600, { composition: { pattern: 'orion' } });
  // The chart data reads the same catalog (it would report a missing catalog otherwise).
  const input = { time: { kind: 'utc' as const, utc: observer.instant.toISOString() }, location: NEW_YORK };
  const chart = engine.buildSkyChartSnapshot(input, scene.sky);
  expect(chart.provenance.catalogStarCount).toBe(catalog.stars.length);
  // Passing the catalog explicitly gives the same result, also for a copy of the sky.
  expect(engine.buildSkyChartSnapshot(input, { ...scene.sky }, catalog)).toEqual(chart);
  // Without any catalog, the default (not installed here) is missing.
  const plain = { ...scene, sky: { ...scene.sky } };
  expect(() => engine.buildSkyChartSnapshot(input, plain.sky)).toThrow(
    expect.objectContaining({ code: 'MISSING_ASSET' }),
  );
  expect(() =>
    engine.prepareIllustrationScene(plain, 800, 600, { composition: { pattern: 'orion' } }),
  ).toThrow(/Unknown illustration pattern/);
  expect(
    engine.prepareIllustrationScene(plain, 800, 600, { composition: { pattern: 'orion' }, catalog }).view,
  ).toEqual(framed.view);
});

it('accepts only catalogs made by createStarCatalog()', async () => {
  const engine = shared;
  const forged = { stars: engine.getStarCatalog(), patterns: engine.getPatterns() };
  const scene = await engine.createSkyScene(observer);
  const canvas = { width: 400, height: 400, getContext: () => null } as unknown as OffscreenCanvas;
  await expect(engine.createSkyScene({ ...observer, catalog: forged as never })).rejects.toThrow(
    INVALID_INPUT,
  );
  expect(() => engine.advanced.calculateSky(NEW_YORK, observer.instant, undefined, forged as never)).toThrow(
    INVALID_INPUT,
  );
  expect(() => engine.prepareIllustrationScene(scene, 800, 600, { catalog: forged as never })).toThrow(
    INVALID_INPUT,
  );
  expect(() => engine.renderSkyChart(canvas, scene, { catalog: forged as never })).toThrow(INVALID_INPUT);
  expect(() =>
    engine.buildSkyChartSnapshot(
      { time: { kind: 'utc', utc: observer.instant.toISOString() }, location: NEW_YORK },
      scene.sky,
      forged as never,
    ),
  ).toThrow(INVALID_INPUT);
});
