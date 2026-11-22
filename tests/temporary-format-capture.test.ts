import { readFile } from 'node:fs/promises';
import { format } from 'prettier';
import { it } from 'vitest';

it('temporary Prettier diagnostics for SM1-B', async () => {
  for (const path of [
    'src/components/MemorialTimeForm.tsx',
    'src/i18n/memorial.ts',
    'tests/memorialTimeForm.test.tsx',
  ]) {
    const source = await readFile(path, 'utf8');
    const formatted = await format(source, {
      filepath: path,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 110,
    });
    console.log('FORMAT_CAPTURE ' + path + ' ' + Buffer.from(formatted, 'utf8').toString('base64'));
  }
});
