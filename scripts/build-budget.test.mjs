import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import { analyzeBuild, assertBuildBudgets, buildBudgetChanges, formatBuildReport, BUILD_LIMITS } from './build-budget.mjs';

async function fixture(order) {
  const directory = await mkdtemp(join(tmpdir(), 'elsewhere-budget-'));
  await mkdir(join(directory, 'assets'));
  const files = {
    'index-aaa11111.js': 'import "./shared-bbb22222.js";import("./lazy-ccc33333.js")',
    'shared-bbb22222.js': 'export const shared = 42;',
    'lazy-ccc33333.js': 'import "./shared-bbb22222.js";export const lazy = "dynamic chunk";',
    'en-ddd44444.js': 'import "./shared-bbb22222.js";export const en = "English";',
    'zh-Hans-eee55555.js': 'import "./shared-bbb22222.js";export const zh = "中文";',
    'stars-fff66666.json': '[[1, "Sirius", 6.75], [2, "Vega", 18.61]]',
    'moon-lroc-ggg77777.jpg': 'moon data',
  };
  for (const name of order ? Object.keys(files).reverse() : Object.keys(files)) {
    await writeFile(join(directory, 'assets', name), files[name]);
  }
  await writeFile(join(directory, 'index.html'), '<script type="module" src="/assets/index-aaa11111.js"></script>');
  return { directory, files };
}

test('all emitted dynamic JS and star data count toward total, but not startup', async () => {
  const { directory, files } = await fixture(false);
  try {
    const report = await analyzeBuild(directory);
    const zip = (name) => gzipSync(files[name]).length;
    const expectedTotal = Object.keys(files)
      .filter((name) => name.endsWith('.js') || name.endsWith('.json'))
      .reduce((sum, name) => sum + zip(name), 0);
    assert.equal(report.totalGzip, expectedTotal);
    assert.equal(report.startupGzip, zip('index-aaa11111.js') + zip('shared-bbb22222.js') + Math.max(zip('en-ddd44444.js'), zip('zh-Hans-eee55555.js')));
    assert(!report.entryStaticChunks.includes('lazy-ccc33333.js'));
    assert(report.dynamic.some((edge) => edge.target === 'lazy-ccc33333.js'));
    assert(report.chunks.some((asset) => asset.kind === 'data' && asset.name === 'stars-fff66666.json'));
    await assertBuildBudgets(report, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('file iteration order and filename hashes do not change logical comparisons', async () => {
  const first = await fixture(false);
  const second = await fixture(true);
  try {
    const a = await analyzeBuild(first.directory);
    const b = await analyzeBuild(second.directory);
    assert.deepEqual(a.byModule, b.byModule);
    assert.equal(a.totalGzip, b.totalGzip);
    assert.equal(formatBuildReport(a), formatBuildReport(b));
    assert.deepEqual(buildBudgetChanges(a, { byModule: b.byModule }), []);
  } finally {
    await rm(first.directory, { recursive: true, force: true });
    await rm(second.directory, { recursive: true, force: true });
  }
});

test('strict budgets compare exact bytes, and warning is separate from gate', async () => {
  const { directory } = await fixture(false);
  try {
    const good = await analyzeBuild(directory);
    const changed = { ...good, totalGzip: BUILD_LIMITS.totalGzip };
    await assert.rejects(() => assertBuildBudgets(changed, directory), /Total JS and data gzip/);
    const atLimit = { ...good, largest: { ...good.largest, rawBytes: BUILD_LIMITS.chunkRaw } };
    await assert.rejects(() => assertBuildBudgets(atLimit, directory), /Largest JS chunk/);
    const warning = { ...good, totalGzip: 480001 };
    assert.match(formatBuildReport(warning), /WARNING: JS and data gzip/);
    await assertBuildBudgets(warning, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
