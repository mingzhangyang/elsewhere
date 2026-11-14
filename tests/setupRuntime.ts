import { ensureTemporal } from '../src/domain/temporal';
import { readFile } from 'node:fs/promises';
import { loadStarCatalog } from '../src/domain/stars';

// The app loads both at startup (the polyfill only where Temporal is missing; Node has none yet).
await Promise.all([
  ensureTemporal(),
  loadStarCatalog(async () => JSON.parse(await readFile('src/data/stars.json', 'utf8'))),
]);
