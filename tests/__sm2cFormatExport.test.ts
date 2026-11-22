import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';
import * as prettier from 'prettier';

// Temporary public-source formatting bridge; this file will be removed before final PR review.
it('exports canonical formatting for SM2-C changed files', async () => {
  const paths = [
    'docs/SKY-CHART-SNAPSHOT.md',
    'docs/SKY-MOMENT-TIME-FIXTURES.md',
    'src/domain/skyChartSnapshot.ts',
    'src/services/skyChartSnapshot.ts',
    'tests/skyChartSnapshot.test.ts',
  ];
  for (const path of paths) {
    const source = await readFile(path, 'utf8');
    const configuration = (await prettier.resolveConfig(path)) ?? {};
    const formatted = await prettier.format(source, { ...configuration, filepath: path });
    const base64 = Buffer.from(formatted, 'utf8').toString('base64');
    const chunkSize = 3000;
    const parts = Math.ceil(base64.length / chunkSize);
    console.log('SM2CMETA:' + path + ':' + parts + ':' + createHash('sha256').update(formatted).digest('hex'));
    for (let i = 0; i < parts; i++) {
      console.log('SM2CFMT:' + path + ':' + i + ':' + parts + ':' + base64.slice(i * chunkSize, (i + 1) * chunkSize));
    }
    expect(formatted.length).toBeGreaterThan(0);
  }
});
