import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const BUILD_LIMITS = Object.freeze({
  totalGzip: 500000,
  startupGzip: 115000,
  chunkRaw: 500000,
  languageGzip: 15000,
  moonRaw: 600000,
});
export const BUILD_WARNINGS = Object.freeze({ totalGzip: 480000, chunkRaw: 480000, growthGzip: 5000 });

const isCode = (name) => /\.(js|json)$/.test(name);
const logicalName = (name) => name.replace(/-[\w-]{8}(?=\.(?:js|json)$)/, '');
const staticImports = (code) =>
  [...code.matchAll(/(?:from|import)\s*["']\.\/([\w.-]+\.js)["']/g)].map((match) => match[1]);
const dynamicImports = (code) =>
  [...code.matchAll(/import\s*\(\s*["']\.\/([\w.-]+\.js)["']\s*\)/g)].map((match) => match[1]);

/** The production budget includes every emitted JS and JSON asset, not just entrypoint imports. */
export async function analyzeBuild(directory = 'dist') {
  const assetNames = (await readdir(join(directory, 'assets'))).sort();
  const assets = new Map();
  await Promise.all(
    assetNames.filter(isCode).map(async (name) => {
      const bytes = await readFile(join(directory, 'assets', name));
      assets.set(name, {
        name,
        logicalName: logicalName(name),
        rawBytes: bytes.length,
        gzipBytes: gzipSync(bytes).length,
        code: name.endsWith('.js') ? bytes.toString('utf8') : undefined,
      });
    }),
  );
  const chunks = [...assets.values()]
    .map(({ name, logicalName: logical, rawBytes, gzipBytes }) => ({
      name,
      logicalName: logical,
      rawBytes,
      gzipBytes,
      kind: name.endsWith('.json') ? 'data' : 'javascript',
    }))
    .sort((a, b) => b.gzipBytes - a.gzipBytes || a.name.localeCompare(b.name, 'en'));
  const jsChunks = chunks.filter((chunk) => chunk.kind === 'javascript');
  const totalGzip = chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
  const largest = [...jsChunks].sort((a, b) => b.rawBytes - a.rawBytes || a.name.localeCompare(b.name))[0];
  assert(largest, 'No JavaScript in production assets');

  const html = await readFile(join(directory, 'index.html'), 'utf8');
  const entry = html.match(/src="\/assets\/(index-[\w-]+\.js)"/)?.[1];
  assert(entry && assets.has(entry), 'Entry chunk not found in index.html');
  const graph = (name, seen = new Set()) => {
    if (seen.has(name)) return seen;
    const asset = assets.get(name);
    assert(asset?.code !== undefined, 'Missing static chunk: ' + name);
    seen.add(name);
    for (const dependency of staticImports(asset.code)) graph(dependency, seen);
    return seen;
  };
  const entryStatic = graph(entry);
  const startupBaseGzip = [...entryStatic].reduce((sum, name) => sum + assets.get(name).gzipBytes, 0);
  const languageNames = assetNames.filter((name) => /^(en|zh-Hans)-[\w-]{8}\.js$/.test(name));
  const languages = languageNames.map((name) => {
    const exclusive = [...graph(name)].filter((part) => !entryStatic.has(part));
    return {
      name,
      gzipBytes: assets.get(name).gzipBytes,
      startupIncrementGzip: exclusive.reduce((sum, part) => sum + assets.get(part).gzipBytes, 0),
      staticChunks: [...graph(name)].sort(),
    };
  });
  const startupGzip = startupBaseGzip + Math.max(0, ...languages.map((lang) => lang.startupIncrementGzip));
  const dynamic = jsChunks.flatMap((asset) =>
    dynamicImports(assets.get(asset.name).code).map((target) => ({
      importer: asset.logicalName,
      target,
      gzipBytes: assets.get(target)?.gzipBytes ?? null,
    })),
  ).sort((a, b) => a.importer.localeCompare(b.importer) || a.target.localeCompare(b.target));
  const moon = assetNames.find((name) => /^moon-lroc-[\w-]{8}\.jpg$/.test(name));
  const moonRaw = moon ? (await readFile(join(directory, 'assets', moon))).length : null;
  const byModule = {};
  for (const chunk of chunks) byModule[chunk.logicalName] = (byModule[chunk.logicalName] ?? 0) + chunk.gzipBytes;

  return {
    assetNames,
    chunks,
    byModule: Object.fromEntries(Object.entries(byModule).sort(([a], [b]) => a.localeCompare(b))),
    entry,
    entryStaticChunks: [...entryStatic].sort(),
    startupBaseGzip,
    startupGzip,
    languages,
    dynamic,
    totalGzip,
    largest,
    moon,
    moonRaw,
    remaining: {
      totalGzip: BUILD_LIMITS.totalGzip - totalGzip,
      startupGzip: BUILD_LIMITS.startupGzip - startupGzip,
      chunkRaw: BUILD_LIMITS.chunkRaw - largest.rawBytes,
    },
  };
}

/** Keep the existing strict (<, not <=) budget and offline/cache invariants. */
export async function assertBuildBudgets(report, directory = 'dist') {
  assert(report.totalGzip < BUILD_LIMITS.totalGzip, 'Total JS and data gzip ' + report.totalGzip + ' exceeds ' + BUILD_LIMITS.totalGzip);
  assert(report.largest.rawBytes < BUILD_LIMITS.chunkRaw, 'Largest JS chunk ' + report.largest.rawBytes + ' exceeds ' + BUILD_LIMITS.chunkRaw);
  assert(report.startupGzip < BUILD_LIMITS.startupGzip, 'Startup JavaScript ' + report.startupGzip + ' exceeds ' + BUILD_LIMITS.startupGzip);
  assert.equal(report.languages.length, 2, 'Each language must be its own chunk');
  const entry = await readFile(join(directory, 'assets', report.entry), 'utf8');
  assert(!/from\s*["']\.\/three-/.test(entry), 'three.js must not load at startup');
  for (const language of report.languages) {
    assert(language.gzipBytes < BUILD_LIMITS.languageGzip, language.name + ' is ' + language.gzipBytes + ' bytes gzip, over ' + BUILD_LIMITS.languageGzip);
  }
  for (const name of report.entryStaticChunks) {
    const code = await readFile(join(directory, 'assets', name), 'utf8');
    for (const sentence of ['Below the horizon', '天狼星'])
      assert(!code.includes(sentence), 'Catalog text in ' + name);
  }
  assert(report.moon, 'Moon map missing or not content-hashed');
  assert(report.moonRaw < BUILD_LIMITS.moonRaw, 'Moon asset exceeds 600 kB');
  for (const name of report.assetNames) {
    assert(/-[\w-]{8}\.\w+$/.test(name), 'Unhashed file under dist/assets: ' + name);
  }
  for (const asset of report.chunks.filter((item) => item.kind === 'javascript')) {
    const code = await readFile(join(directory, 'assets', asset.name), 'utf8');
    assert(!code.includes('Deterministic unavailable-weather scenario'), 'Development fixtures leaked into production');
    assert(!code.includes('Simulate graphics loss'), 'Development controls leaked into production');
  }
}

/** Compare logical chunk names rather than hashes; a split remains visible in total bytes. */
export function buildBudgetChanges(report, baseline) {
  const old = baseline.byModule ?? {};
  const current = report.byModule;
  return [...new Set([...Object.keys(old), ...Object.keys(current)])]
    .map((name) => ({ name, before: old[name] ?? 0, after: current[name] ?? 0, change: (current[name] ?? 0) - (old[name] ?? 0) }))
    .filter((item) => item.change !== 0)
    .sort((a, b) => b.change - a.change || a.name.localeCompare(b.name));
}

export function formatBuildReport(report, baseline) {
  const rows = [
    'Build budget report (exact bytes; gzipSync default settings; JS and JSON in dist/assets)',
    'TOTAL_JS_DATA_GZIP ' + report.totalGzip + ' / ' + BUILD_LIMITS.totalGzip + ' (remaining ' + report.remaining.totalGzip + ')',
    'STARTUP_JS_GZIP ' + report.startupGzip + ' / ' + BUILD_LIMITS.startupGzip + ' (remaining ' + report.remaining.startupGzip + ')',
    'LARGEST_JS_RAW ' + report.largest.rawBytes + ' / ' + BUILD_LIMITS.chunkRaw + ' (remaining ' + report.remaining.chunkRaw + '): ' + report.largest.name,
    'MOON_RAW ' + report.moonRaw + ' / ' + BUILD_LIMITS.moonRaw + ': ' + report.moon,
    'ENTRY_STATIC ' + report.entryStaticChunks.join(', '),
    'LANGUAGES (own gzip / additional startup static graph gzip)',
    ...report.languages.map((lang) => '  ' + lang.name + ': ' + lang.gzipBytes + ' / ' + lang.startupIncrementGzip),
    'CHUNKS (gzip / raw; all JS and JSON counted)',
    ...report.chunks.map((chunk) => '  ' + chunk.name + ': ' + chunk.gzipBytes + ' / ' + chunk.rawBytes),
    'DYNAMIC_IMPORT_EDGES (target gzip, not additional to total)',
    ...(report.dynamic.length ? report.dynamic.map((item) => '  ' + item.importer + ' -> ' + item.target + ': ' + item.gzipBytes) : ['  none']),
  ];
  if (baseline) {
    rows.push('BASELINE ' + baseline.source + ' (' + baseline.commit + ')');
    rows.push('  TOTAL_DELTA ' + (report.totalGzip - baseline.totalGzip));
    rows.push('  STARTUP_DELTA ' + (report.startupGzip - baseline.startupGzip));
    rows.push('  LARGEST_RAW_DELTA ' + (report.largest.rawBytes - baseline.largestRaw));
    rows.push('MODULE_DELTAS (gzip bytes; positive first, including new/removed modules)');
    const changes = buildBudgetChanges(report, baseline);
    rows.push(...(changes.length ? changes.map((item) => '  ' + item.name + ': ' + item.change + ' (' + item.before + ' -> ' + item.after + ')') : ['  none']));
    if (report.totalGzip - baseline.totalGzip > BUILD_WARNINGS.growthGzip)
      rows.push('WARNING: total growth from baseline exceeds ' + BUILD_WARNINGS.growthGzip + ' B');
  }
  if (report.totalGzip > BUILD_WARNINGS.totalGzip)
    rows.push('WARNING: JS and data gzip over ' + BUILD_WARNINGS.totalGzip + ' B; budget headroom is low');
  if (report.largest.rawBytes > BUILD_WARNINGS.chunkRaw)
    rows.push('WARNING: largest JS chunk over ' + BUILD_WARNINGS.chunkRaw + ' B; close to hard limit');
  return rows.join('\n');
}
