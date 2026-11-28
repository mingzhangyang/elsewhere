// Sky Engine's own test setup: civil time (the polyfill where the runtime has no Temporal) and the
// default star catalog, decoded from the same columnar file the release ships.
import { readFile } from 'node:fs/promises';
import { ensureTemporal } from '../src/domain/temporal';
import { loadStarCatalog } from '../src/domain/stars';
import { decodeStarColumns } from '../src/domain/starCatalogEncoding';

await Promise.all([
  ensureTemporal(),
  loadStarCatalog(async () =>
    decodeStarColumns(
      JSON.parse(await readFile(new URL('../../../src/data/stars.json', import.meta.url), 'utf8')),
    ),
  ),
]);
