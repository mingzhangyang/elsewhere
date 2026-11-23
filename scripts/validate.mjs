import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const formatEvidenceFiles = [
  'docs/SKY-CHART-ARTWORK.md',
  'src/lib/skyArtworkDelivery.ts',
  'src/lib/skyArtworkExport.ts',
  'tests/browser/sky-artwork-export.spec.ts',
  'tests/skyArtworkExport.test.ts',
  'tests/skyChartDrawing.test.ts',
];
const prettierDiagnostic = spawnSync(
  process.execPath,
  [join(dirname(require.resolve('prettier/package.json')), 'bin/prettier.cjs'), '--write', ...formatEvidenceFiles],
  { stdio: 'inherit' },
);
if (prettierDiagnostic.status !== 0) process.exit(prettierDiagnostic.status ?? 1);
for (const file of formatEvidenceFiles) {
  const encoded = Buffer.from(readFileSync(file)).toString('base64');
  for (let offset = 0; offset < encoded.length; offset += 1024) {
    console.log('SM3B-FMT|' + file + '|' + offset + '|' + encoded.slice(offset, offset + 1024));
  }
}
const notices = spawnSync(process.execPath, ['scripts/generate-notices.mjs', '--check'], {
  stdio: 'inherit',
});
if (notices.error) throw notices.error;
if (notices.status !== 0) process.exit(notices.status ?? 1);
for (const [name, pkg, entry, args] of [
  ['TypeScript', 'typescript', 'bin/tsc', ['--noEmit']],
  ['Lint', 'eslint', 'bin/eslint.js', ['.']],
  ['Tests', 'vitest', 'vitest.mjs', ['run']],
  ['Production build', 'vite', 'bin/vite.js', ['build']],
]) {
  console.log(`\n${name}`);
  const result = spawnSync(
    process.execPath,
    [join(dirname(require.resolve(`${pkg}/package.json`)), entry), ...args],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const checked = spawnSync(process.execPath, ['scripts/check-build.mjs'], { stdio: 'inherit' });
if (checked.error) throw checked.error;
if (checked.status !== 0) process.exit(checked.status ?? 1);
