import { ensureTemporal } from '../src/domain/temporal';
import { loadStarCatalog } from '../src/domain/stars';

// The app loads both at startup (the polyfill only where Temporal is missing; Node has none yet).
await Promise.all([ensureTemporal(), loadStarCatalog()]);
