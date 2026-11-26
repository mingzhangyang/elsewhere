import type { CatalogRow } from './stars';
import { invalidInput } from '../errors';

/**
 * Lossless columnar HYG format: ID/name are unchanged; RA/Dec are scaled by 1e6,
 * magnitude by 1e2, colour index by 1e3, proper motion by 1e2. Four exceptional
 * eight-decimal coordinates are decimal strings to retain their full precision.
 * Each integer is checked by the import script for an exact double round-trip.
 */
export function decodeStarColumns(data: unknown): CatalogRow[] {
  if (!Array.isArray(data) || data.length !== 8 || !data.every(Array.isArray)) {
    throw invalidInput('Invalid star catalog: expected eight columns.');
  }
  const columns = data as unknown[][];
  const size = columns[0].length;
  if (!size || columns.some((column) => column.length !== size)) {
    throw invalidInput('Invalid star catalog: inconsistent column lengths.');
  }
  const number = (value: unknown, factor: number) => {
    const decoded =
      typeof value === 'string' ? Number(value) : typeof value === 'number' ? value / factor : NaN;
    if (!Number.isFinite(decoded)) throw invalidInput('Invalid star catalog numeric value.');
    return decoded;
  };
  return Array.from({ length: size }, (_, i) => {
    const id = columns[0][i];
    const name = columns[1][i];
    if (!Number.isSafeInteger(id) || typeof name !== 'string') {
      throw invalidInput('Invalid star catalog identifier or name.');
    }
    const colour = columns[5][i];
    return [
      id as number,
      name,
      number(columns[2][i], 1000000),
      number(columns[3][i], 1000000),
      number(columns[4][i], 100),
      colour === null ? null : number(colour, 1000),
      number(columns[6][i], 100),
      number(columns[7][i], 100),
    ];
  });
}
