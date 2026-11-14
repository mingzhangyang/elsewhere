import { ensureTemporal } from '../src/domain/temporal';

// Node has no native Temporal yet; the app loads the polyfill at boot in the same way.
await ensureTemporal();
