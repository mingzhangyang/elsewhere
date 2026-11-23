import { ensureTemporal } from '../src/domain/temporal';
import { readFile } from 'node:fs/promises';
import { loadStarCatalog } from '../src/domain/stars';
import { decodeStarColumns } from '../src/domain/starCatalogEncoding';
import { setLanguage } from '../src/i18n';

// The app loads these at startup (the polyfill only where Temporal is missing; Node has none yet).
// Tests read the interface in English unless they switch language themselves.
await Promise.all([
  ensureTemporal(),
  loadStarCatalog(async () => decodeStarColumns(JSON.parse(await readFile('src/data/stars.json', 'utf8')))),
  setLanguage('en'),
]);
