import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const sdk = join(root, 'packages/sky-engine');
const output = join(root, 'dist-sdk');
const stage = join(output, 'package');
const landscapeStage = join(output, 'landscape-package');
const moonStage = join(output, 'moon-texture-package');
const release = join(output, 'release');
const manifest = JSON.parse(await readFile(join(sdk, 'package.json'), 'utf8'));
const version = manifest.version;
assert.match(version, /^\d+\.\d+\.\d+$/);
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
const npm = process.env.npm_execpath;
assert(npm, 'Run npm run sdk:build to use the lockfile npm toolchain.');
const run = (script, args, cwd = root) =>
  execFileSync(process.execPath, [script, ...args], { cwd, stdio: 'pipe', encoding: 'utf8' });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const copy = (from, to) => copyFile(join(root, from), to);
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

await rm(output, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await mkdir(release, { recursive: true });

// Isolated library builds. Never load the host Vite config or its offline plugin. The full build
// bundles the Temporal polyfill; the lite build replaces it with a stub that has no Temporal, so it
// needs a native Temporal or one installed by the host with installTemporal().
async function buildModule(fileName, { alias = {}, define = {} } = {}) {
  const built = await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: 'warn',
    resolve: { alias },
    define,
    build: {
      outDir: stage,
      emptyOutDir: false,
      target: 'es2022',
      minify: 'esbuild',
      sourcemap: false,
      modulePreload: false,
      lib: { entry: join(sdk, 'src/index.ts'), formats: ['es'], fileName: () => fileName },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const outputs = Array.isArray(built) ? built : [built];
  assert.equal(outputs.length, 1);
  const chunks = outputs.flatMap((item) => item.output);
  assert.equal(chunks.length, 1);
  const chunk = chunks[0];
  assert.equal(chunk.type, 'chunk');
  assert.equal(chunk.fileName, fileName);
  assert.deepEqual(chunk.imports, [], fileName + ' must not require external module imports.');
  assert.deepEqual(chunk.dynamicImports, [], fileName + ' must not fetch additional JavaScript chunks.');
  const bytes = await readFile(join(stage, fileName));
  return { bytes, gzip: gzipSync(bytes).length, modules: Object.keys(chunk.modules) };
}
const temporalPolyfill = /[\\/]@js-temporal[\\/]polyfill[\\/]/;
const full = await buildModule('sky-engine.mjs');
const lite = await buildModule('sky-engine.lite.mjs', {
  alias: { '@js-temporal/polyfill': join(sdk, 'src/temporalUnavailable.ts') },
  define: { __SKY_ENGINE_LITE__: 'true' },
});
assert(
  full.modules.some((id) => temporalPolyfill.test(id)),
  'The full build must bundle the Temporal polyfill.',
);
assert(
  !lite.modules.some((id) => temporalPolyfill.test(id)),
  'The lite build must not bundle the Temporal polyfill.',
);
const bundle = full.bytes;
const bundleGzip = full.gzip;
// Independent SDK budgets; the app's existing 500,000 B aggregate limit is untouched.
assert(bundle.length < 750000, 'SDK JavaScript exceeds 750,000 raw bytes.');
assert(bundleGzip < 250000, 'SDK JavaScript exceeds 250,000 gzip bytes.');
assert(lite.bytes.length < 275000, 'Lite SDK JavaScript exceeds 275,000 raw bytes.');
assert(lite.gzip < 100000, 'Lite SDK JavaScript exceeds 100,000 gzip bytes.');
assert.deepEqual(
  (await readdir(stage)).sort(),
  ['sky-engine.lite.mjs', 'sky-engine.mjs'],
  'SDK must be two self-contained browser modules (full and lite).',
);

run(tsc, ['--project', join(sdk, 'tsconfig.build.json')]);

// Emit only the declarations reachable from the package root. Use explicit .js specifiers so
// TypeScript NodeNext consumers can resolve them as well as bundler-based consumers.
const types = join(stage, 'types');
const visited = new Set();
async function declaration(file) {
  if (visited.has(file)) return;
  visited.add(file);
  let text = await readFile(file, 'utf8');
  const references = [...text.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)];
  for (const [, specifier] of references) {
    assert(specifier.startsWith('.'), 'Unexpected external public declaration dependency: ' + specifier);
    const target = resolve(dirname(file), specifier + '.d.ts');
    assert(target.startsWith(types + sep));
    await declaration(target);
  }
  text = text.replace(/((?:from\s+|import\s*\(\s*)['"])(\.[^'"]+)(['"])/g, '$1$2.js$3');
  await writeFile(file, text);
}
await declaration(join(types, 'index.d.ts'));
async function prune(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await prune(path);
      if (!(await readdir(path)).length) await rm(path, { recursive: true });
    } else if (!visited.has(path)) await rm(path);
  }
}
await prune(types);

await copy('packages/sky-engine/package.json', join(stage, 'package.json'));
await copy('packages/sky-engine/README.md', join(stage, 'README.md'));
await copy('packages/sky-engine/MOON-TEXTURE.md', join(stage, 'MOON-TEXTURE.md'));
await copy('packages/sky-engine/API.md', join(stage, 'API.md'));
await copy('packages/sky-engine/CHANGELOG.md', join(stage, 'CHANGELOG.md'));
await copy('LICENSE', join(stage, 'LICENSE'));
await copy('public/licenses/THIRD-PARTY.txt', join(stage, 'THIRD-PARTY.txt'));
await copy('public/licenses/HYG.txt', join(stage, 'HYG.txt'));
await copy('packages/sky-engine/CATALOG-ATTRIBUTION.md', join(stage, 'CATALOG-ATTRIBUTION.md'));
await copy('src/data/stars.json', join(stage, 'stars.json'));
const catalog = await readFile(join(stage, 'stars.json'));
assert(gzipSync(catalog).length < 120000, 'SDK catalog exceeds 120,000 gzip bytes.');

await mkdir(landscapeStage, { recursive: true });
await writeFile(
  join(landscapeStage, 'package.json'),
  JSON.stringify({
    name: '@orangely/sky-engine-landscapes',
    version,
    description: 'Optional Sky Engine city and mountain landscape artwork',
    license: 'MIT',
    files: ['landscapes', 'LICENSE', 'README.md'],
  }),
);
await copy('LICENSE', join(landscapeStage, 'LICENSE'));
await copy('packages/sky-engine/LANDSCAPES.md', join(landscapeStage, 'README.md'));
for (const folder of ['valley', 'waterfront']) {
  const destination = join(landscapeStage, 'landscapes', folder);
  await mkdir(destination, { recursive: true });
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    for (const light of ['dawn', 'day', 'dusk', 'night']) {
      const file = season + '-' + light + '.webp';
      await copy('src/assets/' + folder + '/' + file, join(destination, file));
    }
  }
}
// The lunar texture is never embedded in the core module or core npm archive.
await mkdir(moonStage, { recursive: true });
await writeFile(
  join(moonStage, 'package.json'),
  JSON.stringify({
    name: '@orangely/sky-engine-moon-texture',
    version,
    description: 'Optional NASA LROC lunar surface texture for Sky Engine',
    license: 'SEE LICENSE IN README.md',
    files: ['moon-lroc.jpg', 'README.md'],
    exports: { './moon-lroc.jpg': './moon-lroc.jpg' },
  }),
);
await copy('src/assets/moon-lroc.jpg', join(moonStage, 'moon-lroc.jpg'));
await copy('packages/sky-engine/MOON-TEXTURE.md', join(moonStage, 'README.md'));
const lunarTexture = await readFile(join(moonStage, 'moon-lroc.jpg'));
const lunarChecksum = 'f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170';
assert.equal(sha256(lunarTexture), lunarChecksum, 'NASA lunar texture checksum mismatch.');

// The installed runtime export names must match the committed list: the root exports and, as
// "advanced.<name>", the members of the experimental advanced namespace. Removing or renaming an
// export breaks consumers, so any change must be deliberate: SKY_ENGINE_UPDATE_API=1 rewrites it.
async function checkExports(actual) {
  const file = join(sdk, 'api-exports.json');
  if (process.env.SKY_ENGINE_UPDATE_API === '1') {
    await writeFile(file, JSON.stringify(actual, null, 2) + '\n');
    console.log('Updated packages/sky-engine/api-exports.json (' + actual.length + ' names).');
    return;
  }
  const expected = JSON.parse(await readFile(file, 'utf8'));
  const added = actual.filter((name) => !expected.includes(name));
  const removed = expected.filter((name) => !actual.includes(name));
  if (added.length || removed.length) {
    throw new Error(
      'Sky Engine runtime exports differ from packages/sky-engine/api-exports.json.\n' +
        (added.length ? '  Added:   ' + added.join(', ') + '\n' : '') +
        (removed.length ? '  Removed: ' + removed.join(', ') + '\n' : '') +
        'If the change is intended, run SKY_ENGINE_UPDATE_API=1 npm run sdk:build and commit the file.',
    );
  }
  assert.deepEqual(actual, [...expected].sort(), 'api-exports.json must be sorted.');
}

function pack(directory) {
  const [packed] = JSON.parse(
    run(npm, ['pack', directory, '--json', '--offline', '--ignore-scripts', '--pack-destination', release]),
  );
  assert.equal(packed.version, version);
  return packed;
}
const core = pack(stage);
const landscapes = pack(landscapeStage);
const lunar = pack(moonStage);
assert(core.size < 400000, 'SDK npm archive exceeds 400,000 bytes.');
assert(landscapes.size < 5000000, 'Optional landscape archive exceeds 5 MB.');
assert(lunar.size < 600000, 'Optional Moon texture archive exceeds 600,000 bytes.');
assert(lunar.files.some((file) => file.path === 'moon-lroc.jpg'));
assert(!core.files.some((file) => file.path.endsWith('.jpg')), 'Moon texture must remain optional.');
await copyFile(join(moonStage, 'moon-lroc.jpg'), join(release, 'moon-lroc.jpg'));
assert.equal(landscapes.files.filter((file) => file.path.endsWith('.webp')).length, 32);
for (const file of [
  'sky-engine.mjs',
  'sky-engine.lite.mjs',
  'types/index.d.ts',
  'stars.json',
  'LICENSE',
  'HYG.txt',
  'THIRD-PARTY.txt',
  'CATALOG-ATTRIBUTION.md',
  'MOON-TEXTURE.md',
  'README.md',
  'API.md',
  'CHANGELOG.md',
]) {
  assert(
    core.files.some((entry) => entry.path === file),
    'Missing npm archive file: ' + file,
  );
}
for (const file of ['sky-engine.mjs', 'sky-engine.lite.mjs', 'stars.json']) {
  await copyFile(join(stage, file), join(release, file));
}
const notices = await Promise.all(
  ['LICENSE', 'THIRD-PARTY.txt', 'HYG.txt', 'CATALOG-ATTRIBUTION.md'].map((file) =>
    readFile(join(stage, file), 'utf8'),
  ),
);
await writeFile(join(release, 'sky-engine-NOTICES.txt'), notices.join('\n\n' + '='.repeat(72) + '\n\n'));

// Install the actual archive in an isolated offline consumer. No root node_modules may satisfy
// imports. Type-check NodeNext, load the real module and calculate with the real catalog.
const consumer = await mkdtemp(join(tmpdir(), 'sky-engine-consumer-'));
try {
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'sdk-smoke', private: true, type: 'module' }),
  );
  run(
    npm,
    [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      join(release, core.filename),
      join(release, landscapes.filename),
      join(release, lunar.filename),
    ],
    consumer,
  );
  const installedMoon = join(consumer, 'node_modules/@orangely/sky-engine-moon-texture/moon-lroc.jpg');
  assert.equal(sha256(await readFile(installedMoon)), lunarChecksum);
  const installedArtwork = join(consumer, 'node_modules/@orangely/sky-engine-landscapes/landscapes');
  for (const folder of ['valley', 'waterfront']) {
    const expected = await readdir(join(landscapeStage, 'landscapes', folder));
    assert.deepEqual((await readdir(join(installedArtwork, folder))).sort(), expected.sort());
    for (const file of expected) {
      const original = await readFile(join(landscapeStage, 'landscapes', folder, file));
      const installed = await readFile(join(installedArtwork, folder, file));
      assert.equal(sha256(installed), sha256(original));
    }
  }
  await writeFile(
    join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'ES2022',
        module: 'NodeNext',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        types: [],
      },
      // The Worker example is type-checked against the installed declarations as well.
      files: ['consumer.ts', 'worker-main.ts', 'worker-protocol.ts'],
    }),
  );
  for (const file of ['worker-render.ts', 'worker-main.ts', 'worker-protocol.ts']) {
    await copyFile(join(sdk, 'examples', file), join(consumer, file));
  }
  await writeFile(
    join(consumer, 'consumer.ts'),
    `import * as lite from '@orangely/sky-engine/lite';
import {
  advanced, createSkyScene, renderIllustration, renderSkyChart, renderMinimalSkyMap, renderMoonPhase,
  installMoonTexture, loadMoonTexture, getStarCatalog, getPatterns, SkyEngineError, installTemporal,
  type CatalogStar, type Constellation, type MoonPhaseOptions, type MomentSnapshot,
  type SkyEngineErrorCode,
} from '@orangely/sky-engine';
// The lite build has the same declarations as the package root.
lite.installTemporal({});
const liteScene: MomentSnapshot = await lite.createSkyScene({
  latitude: 0, longitude: 0, timezone: 'UTC', instant: new Date(),
});
lite.renderSkyChart(new OffscreenCanvas(400, 400), liteScene);
const scene: MomentSnapshot = await createSkyScene({
  latitude: 40, longitude: -74, timezone: 'UTC', instant: new Date(),
  assetTimeoutMs: 15000, signal: new AbortController().signal,
});
const catalog: readonly CatalogStar[] = getStarCatalog();
const patterns: readonly Constellation[] = getPatterns();
// @ts-expect-error The installed catalog is read-only.
catalog.push(catalog[0]);
// @ts-expect-error Catalog entries are frozen too.
getStarCatalog()[0].magnitude = 0;
// @ts-expect-error Pattern arrays are read-only.
patterns.push(patterns[0]);
// @ts-expect-error Pattern entries are frozen too.
getPatterns()[0].id = 'orion';
// @ts-expect-error Pattern lines cannot be replaced.
getPatterns()[0].lines = [];
// @ts-expect-error Pattern lines are read-only arrays.
getPatterns()[0].lines.push(['a', 'b']);
// @ts-expect-error Individual pattern pairs are read-only.
getPatterns()[0].lines[0][0] = 'a';
console.log(patterns.length);
const projection: advanced.Projection = advanced.createProjection(scene.view, scene.aspect);
const point: advanced.Projected = projection(scene.sky.sun.altitude, scene.sky.sun.azimuth);
console.log(point.front, advanced.calculateSky(scene.location, scene.instant).sunAltitude);
await advanced.ensureTemporal();
try {
  await renderMoonPhase(document.createElement('canvas'), scene);
} catch (error) {
  if (error instanceof SkyEngineError) {
    const code: SkyEngineErrorCode = error.code;
    if (code === 'MISSING_ASSET' || code === 'CANCELLED') console.log(error.name, error.cause);
  }
}
// @ts-expect-error Unknown error codes are rejected.
const wrong: SkyEngineErrorCode = 'NOT_A_CODE';
console.log(wrong);
await renderIllustration(document.createElement('canvas'), scene, { composition: 'auto' });
renderSkyChart(document.createElement('canvas'), scene, { theme: 'paper' });
renderMinimalSkyMap(document.createElement('canvas'), scene, { composition: 'current' });
const texture = await loadMoonTexture('/moon-lroc.jpg');
installMoonTexture(texture);
const moonOptions: MoonPhaseOptions = { orientation: 'north-up', background: 'transparent' };
await renderMoonPhase(document.createElement('canvas'), scene, moonOptions);
// Worker rendering: an OffscreenCanvas and ImageBitmap artwork are accepted everywhere.
const offscreen = new OffscreenCanvas(800, 600);
await renderIllustration(offscreen, scene, {
  landscape: 'city',
  loadLandscape: async () => createImageBitmap(new Blob()),
});
renderSkyChart(offscreen, scene);
renderMinimalSkyMap(offscreen, scene);
await renderMoonPhase(offscreen, scene, { texture: await createImageBitmap(new Blob()) });
installTemporal({});
`,
  );
  run(tsc, ['--project', join(consumer, 'tsconfig.json')], consumer);
  // A Worker-only project: no DOM library, strict, and the package declarations checked too
  // (skipLibCheck stays false). It compiles the Worker example and uses both builds.
  await writeFile(
    join(consumer, 'tsconfig.worker.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        target: 'ES2022',
        module: 'NodeNext',
        lib: ['ES2022', 'WebWorker', 'WebWorker.Iterable'],
        types: [],
      },
      files: ['worker-consumer.ts', 'worker-render.ts', 'worker-protocol.ts'],
    }),
  );
  await writeFile(
    join(consumer, 'worker-consumer.ts'),
    `import {
  createSkyScene, installMoonTexture, installTemporal, loadMoonTexture, paintIllustrationPanel,
  renderIllustration, renderMinimalSkyMap, renderMoonPhase, renderSkyChart,
  type MoonTexture, type RenderCanvas, type RenderImage,
} from '@orangely/sky-engine';
import * as lite from '@orangely/sky-engine/lite';
lite.installTemporal({});
installTemporal({});
const scene = await createSkyScene({ latitude: 0, longitude: 0, timezone: 'UTC', instant: new Date() });
const canvas: RenderCanvas = new OffscreenCanvas(800, 600);
const art: RenderImage = await createImageBitmap(new Blob());
await renderIllustration(canvas, scene, { landscape: 'city', landscapeArt: art });
await renderIllustration(canvas, scene, { landscape: 'mountains', loadLandscape: async () => art });
paintIllustrationPanel(new OffscreenCanvas(10, 10).getContext('2d')!, 10, 10, scene);
renderSkyChart(canvas, scene);
renderMinimalSkyMap(canvas, scene);
const texture: MoonTexture = await loadMoonTexture('/moon-lroc.jpg');
installMoonTexture(texture);
await renderMoonPhase(canvas, scene, { texture: art });
await lite.renderMoonPhase(new OffscreenCanvas(64, 64), scene);
// @ts-expect-error Without the DOM library only an OffscreenCanvas is a canvas.
renderSkyChart({ width: 400, height: 400 }, scene);
`,
  );
  run(tsc, ['--project', join(consumer, 'tsconfig.worker.json')], consumer);
  await writeFile(
    join(consumer, 'smoke.mjs'),
    `import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
Object.defineProperty(globalThis, 'Temporal', { value: undefined, configurable: true });
const sdk = await import('@orangely/sky-engine');
const catalogUrl = new URL(import.meta.resolve('@orangely/sky-engine/stars.json'));
const data = JSON.parse(await readFile(catalogUrl, 'utf8'));
const observer = {
  latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York',
  instant: new Date('2026-03-20T17:00:00Z'),
};
const coded = (code, module = sdk) => (error) => {
  assert(error instanceof module.SkyEngineError);
  assert(error instanceof Error);
  assert.equal(error.code, code);
  assert.equal(error.name, code === 'CANCELLED' ? 'AbortError' : 'SkyEngineError');
  return true;
};
// Before any catalog exists: read-only accessors are empty, and every failure is a coded error.
assert.deepEqual(sdk.getStarCatalog(), []);
assert.deepEqual(sdk.getPatterns(), []);
assert.throws(() => sdk.validateObserver({ ...observer, latitude: 91, elevation: 0 }), coded('INVALID_INPUT'));
await assert.rejects(sdk.createSkyScene(observer), coded('MISSING_ASSET'));
const aborted = AbortSignal.abort();
await assert.rejects(
  sdk.createSkyScene({ ...observer, signal: aborted, loadCatalog: async () => [] }),
  coded('CANCELLED'),
);
await assert.rejects(
  sdk.createSkyScene({ ...observer, assetTimeoutMs: 1, loadCatalog: () => new Promise(() => {}) }),
  coded('TIMEOUT'),
);
const offline = new Error('offline');
await assert.rejects(
  sdk.createSkyScene({ ...observer, loadCatalog: async () => { throw offline; } }),
  (error) => coded('ASSET_FAILED')(error) && error.cause === offline,
);
assert.equal(sdk.starCatalogLoaded(), false);
const scene = await sdk.createSkyScene({
  latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York',
  instant: new Date('2026-03-20T17:00:00Z'), weather: 'clear',
  loadCatalog: async () => sdk.decodeStarColumns(data),
});
assert.equal(scene.sky.stars.length, 5070);
assert.equal(sdk.getStarCatalog().length, 5070);
assert(Object.isFrozen(sdk.getStarCatalog()) && Object.isFrozen(sdk.getStarCatalog()[0]));
assert.equal(sdk.getStarCatalog(), sdk.getStarCatalog());
assert(sdk.getPatterns().length > 0 && Object.isFrozen(sdk.getPatterns()[0].lines));
assert.equal(sdk.advanced.calculateSky(scene.location, scene.instant).stars.length, 5070);
assert.equal(typeof sdk.advanced.createProjection(scene.view, scene.aspect), 'function');
const noCanvas = { width: 400, height: 400, getContext: () => null };
assert.throws(() => sdk.renderSkyChart(noCanvas, scene), coded('UNSUPPORTED'));
assert.equal(scene.sky.planets.length, 5);
assert(Number.isFinite(scene.sky.moon.altitude));
assert.equal(sdk.prepareIllustrationScene(scene, 800, 600).aspect, 800 / 600);
const chart = sdk.buildSkyChartSnapshot({
  time: { kind: 'utc', utc: scene.instant.toISOString() },
  location: { ...scene.location, name: 'New York', country: 'US' },
}, scene.sky);
assert(chart.objects.length > 100);
assert(chart.objects.every((object) => object.altitude >= 0 && Math.hypot(object.x, object.y) <= 1 + 1e-12));
assert.equal(typeof sdk.renderSkyChart, 'function');
assert.equal(typeof sdk.renderMinimalSkyMap, 'function');
assert.equal(typeof sdk.renderMoonPhase, 'function');
assert.equal(typeof sdk.installMoonTexture, 'function');
assert.equal(typeof sdk.loadMoonTexture, 'function');
const moonUrl = new URL(import.meta.resolve('@orangely/sky-engine-moon-texture/moon-lroc.jpg'));
assert.equal((await readFile(moonUrl)).length, 457942);

// The lite build: a separate module instance without the Temporal polyfill.
const lite = await import('@orangely/sky-engine/lite');
assert.notEqual(lite, sdk);
assert.deepEqual(lite.getStarCatalog(), []);
const unsupported = (error) => {
  coded('UNSUPPORTED', lite)(error);
  assert.match(error.message, /installTemporal\\(\\)/);
  assert.match(error.message, /full Sky Engine build/);
  return true;
};
await assert.rejects(lite.advanced.ensureTemporal(), unsupported);
// Fails before starting the catalog load.
let catalogRequested = false;
await assert.rejects(
  lite.createSkyScene({ ...observer, loadCatalog: async () => { catalogRequested = true; return []; } }),
  unsupported,
);
assert.equal(catalogRequested, false);
assert.equal(lite.starCatalogLoaded(), false);
assert.throws(() => lite.advanced.calculateDailyEvents(scene.location, observer.instant), unsupported);
assert.throws(() => lite.installTemporal({}), coded('INVALID_INPUT', lite));
assert.throws(() => lite.installTemporal(null), coded('INVALID_INPUT', lite));
const { Temporal: hostTemporal } = await import(process.env.SKY_ENGINE_TEMPORAL_POLYFILL);
lite.installTemporal(hostTemporal);
await lite.advanced.ensureTemporal();
const liteScene = await lite.createSkyScene({
  latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York',
  instant: new Date('2026-03-20T17:00:00Z'), weather: 'clear',
  loadCatalog: async () => lite.decodeStarColumns(data),
});
assert.deepEqual(JSON.parse(JSON.stringify(liteScene)), JSON.parse(JSON.stringify(scene)));
assert.throws(() => lite.renderSkyChart(noCanvas, liteScene), coded('UNSUPPORTED', lite));
const dayStart = new Date('2026-11-01T12:00:00Z');
assert.deepEqual(
  JSON.parse(JSON.stringify(lite.advanced.calculateDailyEvents(scene.location, dayStart))),
  JSON.parse(JSON.stringify(sdk.advanced.calculateDailyEvents(scene.location, dayStart))),
);
const names = (module) =>
  [...Object.keys(module), ...Object.keys(module.advanced).map((name) => 'advanced.' + name)].sort();
assert.deepEqual(names(lite), names(sdk), 'The full and lite builds must export the same names.');
// Last line of output: the installed package's runtime export names, for the API lock below.
console.log(JSON.stringify(names(sdk)));
`,
  );
  const smokeOutput = execFileSync(process.execPath, [join(consumer, 'smoke.mjs')], {
    cwd: consumer,
    stdio: 'pipe',
    encoding: 'utf8',
    // The host's own Temporal implementation for the lite build, from outside the consumer.
    env: { ...process.env, SKY_ENGINE_TEMPORAL_POLYFILL: import.meta.resolve('@js-temporal/polyfill') },
  })
    .trim()
    .split('\n');
  await checkExports(JSON.parse(smokeOutput[smokeOutput.length - 1]));
} finally {
  await rm(consumer, { recursive: true, force: true });
}

const files = [];
for (const name of (await readdir(release)).sort()) {
  const bytes = await readFile(join(release, name));
  files.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
}
const releaseManifest = {
  name: manifest.name,
  version,
  tag: 'sky-engine-v' + version,
  sourceCommit,
  bundle: { rawBytes: bundle.length, gzipBytes: bundleGzip },
  liteBundle: { rawBytes: lite.bytes.length, gzipBytes: lite.gzip },
  catalog: { rawBytes: catalog.length, gzipBytes: gzipSync(catalog).length, license: 'CC-BY-SA-4.0' },
  moonTexture: {
    rawBytes: lunarTexture.length,
    sha256: lunarChecksum,
    license: 'NASA public-domain imagery',
  },
  files,
};
const json = JSON.stringify(releaseManifest, null, 2) + '\n';
await writeFile(join(release, 'manifest.json'), json);
const sums = [...files, { name: 'manifest.json', sha256: sha256(json) }];
await writeFile(
  join(release, 'SHA256SUMS'),
  sums.map((file) => file.sha256 + '  ' + file.name).join('\n') + '\n',
);
console.log(json);
console.log('Sky Engine package, declarations, offline install and astronomy smoke verified.');
