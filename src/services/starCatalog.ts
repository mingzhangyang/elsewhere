import catalogUrl from '../data/stars.json?url';
import { loadStarCatalog, type CatalogRow } from '../domain/stars';
import { decodeStarColumns } from '../domain/starCatalogEncoding';

/**
 * The catalog is fetched as data rather than imported as a module: browsers may remember a failed
 * module import and keep rejecting it without a new request, while a failed fetch can simply be
 * repeated once the connection returns.
 */
export async function fetchStarCatalog(): Promise<CatalogRow[]> {
  const response = await fetch(catalogUrl);
  if (!response.ok) throw new Error(`Star catalog request failed (${response.status}).`);
  return decodeStarColumns(await response.json());
}

export const loadStars = () => loadStarCatalog(fetchStarCatalog);
