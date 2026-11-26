import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import type { CatalogRow } from '../src/domain/stars';
import { decodeStarColumns } from '../src/domain/starCatalogEncoding';

const rows = async (): Promise<CatalogRow[]> =>
  decodeStarColumns(JSON.parse(await readFile('src/data/stars.json', 'utf8')));

// A fresh module: the shared test setup has already installed the catalog in the usual one.
it('starts over after a failed download or a catalog that cannot be installed', async () => {
  vi.resetModules();
  const stars = await import('../src/domain/stars');
  expect(stars.starCatalogLoaded()).toBe(false);
  expect(stars.getStarCatalog()).toEqual([]);
  expect(Object.isFrozen(stars.getStarCatalog())).toBe(true);
  expect(stars.getPatterns()).toEqual([]);
  await expect(stars.loadStarCatalog(() => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
  expect(stars.starCatalogLoaded()).toBe(false);
  // Downloaded but unusable (the pattern stars are missing): installing throws, and is retryable too.
  await expect(stars.loadStarCatalog(async () => [['1', 'Nobody', 0, 0, 1, null, 0, 0]])).rejects.toThrow(
    /Missing pattern star/,
  );
  expect(stars.starCatalogLoaded()).toBe(false);
  await stars.loadStarCatalog(rows);
  expect(stars.STAR_CATALOG).toHaveLength(5070);
  expect(stars.CONSTELLATIONS.length).toBeGreaterThan(0);
  expect(stars.getStarCatalog()).toBe(stars.STAR_CATALOG);
  expect(stars.getPatterns()).toBe(stars.CONSTELLATIONS);
  // Once installed, later calls do not load again.
  const again = vi.fn(rows);
  await stars.loadStarCatalog(again);
  expect(again).not.toHaveBeenCalled();
});

it('ignores a second load function while one is in flight, warning once without changing the result', async () => {
  vi.resetModules();
  const stars = await import('../src/domain/stars');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  let release: (value: CatalogRow[]) => void = () => {};
  const first = vi.fn(
    () =>
      new Promise<CatalogRow[]>((resolve) => {
        release = resolve;
      }),
  );
  const pending = stars.loadStarCatalog(first);
  expect(stars.starCatalogInstallation()).toBe(pending);
  // The same function again joins silently.
  expect(stars.loadStarCatalog(first)).toBe(pending);
  expect(warn).not.toHaveBeenCalled();
  const second = vi.fn(rows);
  const third = vi.fn(rows);
  expect(stars.loadStarCatalog(second)).toBe(pending);
  expect(stars.loadStarCatalog(third)).toBe(pending);
  expect(second).not.toHaveBeenCalled();
  expect(third).not.toHaveBeenCalled();
  expect(first).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledOnce();
  expect(warn.mock.calls[0][0]).toMatch(/already in progress/);
  release(await rows());
  await pending;
  expect(stars.STAR_CATALOG).toHaveLength(5070);
  // After completion every load function is ignored silently and the completed promise returned.
  const late = vi.fn(rows);
  expect(stars.loadStarCatalog(late)).toBe(pending);
  expect(late).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledOnce();
});

it('propagates a synchronous loader throw without starting or retaining an installation', async () => {
  vi.resetModules();
  const stars = await import('../src/domain/stars');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const broken = (): Promise<CatalogRow[]> => {
    throw new Error('offline');
  };
  expect(() => stars.loadStarCatalog(broken)).toThrow('offline');
  expect(stars.starCatalogInstallation()).toBeNull();
  expect(stars.starCatalogLoaded()).toBe(false);
  // The next call starts over; the same failed function passed meanwhile is a different loader.
  let release: (value: CatalogRow[]) => void = () => {};
  const pending = stars.loadStarCatalog(
    () =>
      new Promise<CatalogRow[]>((resolve) => {
        release = resolve;
      }),
  );
  expect(stars.loadStarCatalog(broken)).toBe(pending);
  expect(warn).toHaveBeenCalledOnce();
  release(await rows());
  await pending;
  expect(stars.STAR_CATALOG).toHaveLength(5070);
});

it('releases the load function once the installation succeeds', async () => {
  const { setFlagsFromString } = await import('node:v8');
  const { runInNewContext } = await import('node:vm');
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc') as () => void;
  vi.resetModules();
  const stars = await import('../src/domain/stars');
  const data = await rows();
  let reference: WeakRef<object> | undefined;
  await (async () => {
    // A loader whose closure holds a host resource; only the SDK could keep it alive afterwards.
    const resource = { rows: data };
    const load = async () => resource.rows;
    reference = new WeakRef(load);
    await stars.loadStarCatalog(load);
  })();
  expect(stars.starCatalogLoaded()).toBe(true);
  for (let i = 0; i < 10 && reference?.deref(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
  }
  expect(reference?.deref()).toBeUndefined();
});
