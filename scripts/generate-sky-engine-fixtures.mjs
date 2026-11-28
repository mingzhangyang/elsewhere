// Regenerates packages/sky-engine/fixtures/sky-engine-fixtures.json from the current package
// source: reference astronomy results and lunar portrait pixels shared by every Sky Engine
// consumer (see packages/sky-engine/fixtures/verify.mjs). Run deliberately, after a change that is
// meant to alter results, then review the diff: `npm run sdk:fixtures`.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import {
  FIXTURE_STAR_NAMES,
  describeAstronomy,
  encodePixels,
  renderFixtureMoon,
} from '../packages/sky-engine/fixtures/verify.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const built = await build({
  configFile: false,
  root,
  publicDir: false,
  logLevel: 'warn',
  build: {
    write: false,
    target: 'es2022',
    minify: false,
    lib: {
      entry: join(root, 'packages/sky-engine/src/index.ts'),
      formats: ['es'],
      fileName: () => 'engine.mjs',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const directory = await mkdtemp(join(tmpdir(), 'sky-engine-fixtures-'));
let sdk;
try {
  const file = join(directory, 'engine.mjs');
  await writeFile(file, built[0].output[0].code);
  sdk = await import(pathToFileURL(file).href);
} finally {
  await rm(directory, { recursive: true, force: true });
}

const rows = sdk.decodeStarColumns(JSON.parse(await readFile(join(root, 'src/data/stars.json'), 'utf8')));
const catalog = sdk.createStarCatalog(rows);
const starIds = FIXTURE_STAR_NAMES.map((name) => {
  const star = catalog.stars.find((entry) => entry.name === name);
  if (!star) throw new Error('Fixture star missing: ' + name);
  return star.id;
});

const observers = {
  'new-york': { latitude: 40.7128, longitude: -74.006, elevation: 10, timezone: 'America/New_York' },
  sydney: { latitude: -33.8688, longitude: 151.2093, elevation: 58, timezone: 'Australia/Sydney' },
  tromso: { latitude: 69.6492, longitude: 18.9553, elevation: 10, timezone: 'Europe/Oslo' },
  quito: { latitude: -0.1807, longitude: -78.4678, elevation: 2850, timezone: 'America/Guayaquil' },
};
// A daylight-saving change in New York, both solstices (polar day and night in Tromsø), and four
// lunar phases for the portraits.
const instants = {
  'us-dst': '2026-03-08T12:00:00.000Z',
  'june-solstice': '2026-06-21T12:00:00.000Z',
  'december-solstice': '2026-12-21T12:00:00.000Z',
};
const phases = {
  crescent: '2026-03-21T18:00:00.000Z',
  'first-quarter': '2026-03-25T18:00:00.000Z',
  full: '2026-04-02T02:00:00.000Z',
  'last-quarter': '2026-04-10T05:00:00.000Z',
};
const astronomy = [];
const scenes = new Map();
async function addCase(name, observer, instant) {
  const scene = await sdk.createSkyScene({ ...observer, instant: new Date(instant), catalog });
  scenes.set(name, scene);
  astronomy.push({ name, observer, instant, starIds, expected: describeAstronomy(scene, starIds) });
}
for (const [place, observer] of Object.entries(observers)) {
  for (const [label, instant] of Object.entries(instants))
    await addCase(`${place}/${label}`, observer, instant);
}
for (const [label, instant] of Object.entries(phases))
  await addCase(`new-york/${label}`, observers['new-york'], instant);

const portraits = [
  ['crescent', { orientation: 'observer', background: 'transparent', earthshine: true }],
  ['first-quarter', { orientation: 'north-up', background: 'dark', earthshine: false }],
  ['full', { orientation: 'observer', background: 'light', earthshine: false }],
  ['last-quarter', { orientation: 'north-up', background: 'transparent', earthshine: true }],
];
const moon = [];
for (const [phase, options] of portraits) {
  const scene = `new-york/${phase}`;
  const size = 32;
  const rgba = encodePixels(await renderFixtureMoon(sdk, scenes.get(scene), options, size));
  moon.push({ name: `moon/${phase}`, scene, options, size, rgba });
}

const fixtures = {
  formatVersion: 1,
  description:
    'Sky Engine shared regression fixtures. Check with fixtures/verify.mjs; regenerate with npm run sdk:fixtures.',
  tolerance: { absolute: 1e-6, relative: 1e-9, eventMs: 1000, moonRgb: 1, moonAlpha: 0 },
  astronomy,
  moon,
};
const target = join(root, 'packages/sky-engine/fixtures/sky-engine-fixtures.json');
await writeFile(target, JSON.stringify(fixtures, null, 2) + '\n');
console.log(`Wrote ${astronomy.length} astronomy and ${moon.length} Moon fixtures to ${target}.`);
