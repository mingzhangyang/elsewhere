import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import type { CatalogRow } from '../src/domain/stars';

const rows = async (): Promise<CatalogRow[]> => JSON.parse(await readFile('src/data/stars.json', 'utf8'));

// A fresh module: the shared test setup has already installed the catalog in the usual one.
it('starts over after a failed download or a catalog that cannot be installed', async () => {
  vi.resetModules();
  const stars = await import('../src/domain/stars');
  expect(stars.starCatalogLoaded()).toBe(false);
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
  // Once installed, later calls do not load again.
  const again = vi.fn(rows);
  await stars.loadStarCatalog(again);
  expect(again).not.toHaveBeenCalled();
});
