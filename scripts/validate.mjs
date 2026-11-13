import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
for (const [name, pkg, entry, args] of [
  ['TypeScript', 'typescript', 'bin/tsc', ['--noEmit']],
  ['Lint', 'eslint', 'bin/eslint.js', ['.']],
  ['Tests', 'vitest', 'vitest.mjs', ['run']],
  ['Production build', 'vite', 'bin/vite.js', ['build']],
]) {
  console.log(`\n${name}`);
  const result = spawnSync(process.execPath, [join(dirname(require.resolve(`${pkg}/package.json`)), entry), ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
