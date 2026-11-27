import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { decodeStarColumns } from '../src/domain/starCatalogEncoding';

it('reconstructs the exact HYG v4.1 row data, including high-precision positions', async () => {
  const encoded: unknown = JSON.parse(await readFile('src/data/stars.json', 'utf8'));
  const rows = decodeStarColumns(encoded);
  expect(rows).toHaveLength(5070);
  expect(rows.filter((row) => row[1])).toHaveLength(347);
  // Digest of canonical row-major JSON before lossless re-encoding (PR #34).
  // Protects every ID, name, coordinate, magnitude, colour and proper-motion value in order.
  const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  expect(digest).toBe('0d079f39f6ae31ead9dd9968d8974801266934272b7013f4fe7b3baf83c1e172');
  expect(rows[0]).toEqual([32263, 'Sirius', 6.752481, -16.716116, -1.44, 0.009, -546.01, -1223.08]);
});

it('rejects truncated columns and non-numeric data instead of installing a damaged catalog', () => {
  expect(() => decodeStarColumns([])).toThrow(/eight columns/);
  expect(() => decodeStarColumns([[], [], [], [], [], [], [], []])).toThrow(/lengths/);
  expect(() => decodeStarColumns([[1], ['star'], [1], [1], ['NaN'], [null], [1], [1]])).toThrow(
    /numeric value/,
  );
});
