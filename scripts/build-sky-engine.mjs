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

// Isolated library build. Never load the host Vite config or its offline plugin.
const built = await build({
  configFile: false,
  root,
  publicDir: false,
  build: {
    outDir: stage,
    emptyOutDir: false,
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    modulePreload: false,
    lib: { entry: join(sdk, 'src/index.ts'), formats: ['es'], fileName: () => 'sky-engine.mjs' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const outputs = Array.isArray(built) ? built : [built];
assert.equal(outputs.length, 1);
const chunks = outputs.flatMap((item) => item.output);
assert.equal(chunks.length, 1);
const chunk = chunks[0];
assert.equal(chunk.type, 'chunk');
assert.deepEqual(chunk.imports, [], 'SDK must not require external module imports.');
assert.deepEqual(chunk.dynamicImports, [], 'SDK must not fetch additional JavaScript chunks.');
const bundle = await readFile(join(stage, 'sky-engine.mjs'));
const bundleGzip = gzipSync(bundle).length;
// Independent initial SDK budgets; the app's existing 500,000 B aggregate limit is untouched.
assert(bundle.length < 750000, 'SDK JavaScript exceeds 750,000 raw bytes.');
assert(bundleGzip < 250000, 'SDK JavaScript exceeds 250,000 gzip bytes.');
assert.deepEqual(await readdir(stage), ['sky-engine.mjs'], 'SDK must be one self-contained browser module.');

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
  'types/index.d.ts',
  'stars.json',
  'LICENSE',
  'HYG.txt',
  'THIRD-PARTY.txt',
  'CATALOG-ATTRIBUTION.md',
]) {
  assert(
    core.files.some((entry) => entry.path === file),
    'Missing npm archive file: ' + file,
  );
}
for (const file of ['sky-engine.mjs', 'stars.json']) await copyFile(join(stage, file), join(release, file));
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
        lib: ['ES2022', 'DOM'],
        types: [],
      },
      files: ['consumer.ts'],
    }),
  );
  await writeFile(
    join(consumer, 'consumer.ts'),
    `import {
  createSkyScene, renderIllustration, renderSkyChart, renderMinimalSkyMap, renderMoonPhase,
  installMoonTexture, loadMoonTexture, type MoonPhaseOptions, type MomentSnapshot,
} from '@orangely/sky-engine';
const scene: MomentSnapshot = await createSkyScene({
  latitude: 40, longitude: -74, timezone: 'UTC', instant: new Date(),
});
await renderIllustration(document.createElement('canvas'), scene, { composition: 'auto' });
renderSkyChart(document.createElement('canvas'), scene, { theme: 'paper' });
renderMinimalSkyMap(document.createElement('canvas'), scene, { composition: 'current' });
const texture = await loadMoonTexture('/moon-lroc.jpg');
installMoonTexture(texture);
const moonOptions: MoonPhaseOptions = { orientation: 'north-up', background: 'transparent' };
await renderMoonPhase(document.createElement('canvas'), scene, moonOptions);
`,
  );
  run(tsc, ['--project', join(consumer, 'tsconfig.json')], consumer);
  await writeFile(
    join(consumer, 'smoke.mjs'),
    `import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
Object.defineProperty(globalThis, 'Temporal', { value: undefined, configurable: true });
const sdk = await import('@orangely/sky-engine');
const catalogUrl = new URL(import.meta.resolve('@orangely/sky-engine/stars.json'));
const data = JSON.parse(await readFile(catalogUrl, 'utf8'));
const scene = await sdk.createSkyScene({
  latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York',
  instant: new Date('2026-03-20T17:00:00Z'), weather: 'clear',
  loadCatalog: async () => sdk.decodeStarColumns(data),
});
assert.equal(scene.sky.stars.length, 5070);
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
`,
  );
  run(join(consumer, 'smoke.mjs'), [], consumer);
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
