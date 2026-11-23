import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import * as prettier from 'prettier';

// Temporary CI-side formatting diagnostic; removed after applying canonical Prettier bytes.
test('print SM3-C canonical source for consistent formatting', async () => {
  for (const path of [
    'docs/SKY-CHART-CREATOR.md',
    'src/components/MemorialTimeForm.tsx',
    'src/components/skyArtworkCreator.css',
    'src/components/SkyArtworkCreator.tsx',
    'src/i18n/memorial.ts',
    'src/RouteShell.tsx',
    'tests/browser/sky-artwork-creator.spec.ts',
    'tests/skyArtworkCreator.test.tsx',
  ]) {
    const before = await readFile(path, 'utf8');
    const formatted = await prettier.format(before, {
      ...(await prettier.resolveConfig(path)),
      filepath: path,
    });
    if (formatted === before) continue;
    const base64 = Buffer.from(formatted, 'utf8').toString('base64');
    const chunks = Math.ceil(base64.length / 2400);
    for (let i = 0; i < chunks; i += 1) {
      console.log(`SM3CFMT|${path}|${i}|${chunks}|${base64.slice(i * 2400, i * 2400 + 2400)}`);
    }
  }
});
