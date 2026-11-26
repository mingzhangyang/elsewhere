import { calculateSky } from '../domain/astronomy';
import { assertMemorialTimeConsistency, type MemorialTime } from '../lib/memorialTime';
import {
  assertSkyChartCatalog,
  buildPreparedSkyChartSnapshot,
  EXPECTED_HYG_DERIVATIVE_STAR_COUNT,
  prepareSkyChartSnapshotInput,
  type SkyChartSnapshot,
  type SkyChartSnapshotInput,
  type PreparedSkyChartSnapshotInput,
} from '../domain/skyChartSnapshot';
import { STAR_CATALOG, starCatalogLoaded, type CatalogStar } from '../domain/stars';
import { SkyEngineError } from '../../packages/sky-engine/src/errors';
import type { LocationInfo, SkyState } from '../types';

/** The SM1 branch is validated here: domain code never imports from lib/. */
export type SkyChartSnapshotRequest =
  | SkyChartSnapshotInput
  | { readonly time: MemorialTime; readonly limitingMagnitude?: number };

/** Reuse SM1's saved UTC/offset/DST consistency check before handing off pure UTC domain input. */
export function prepareSkyChartSnapshotRequest(
  input: SkyChartSnapshotRequest,
): PreparedSkyChartSnapshotInput {
  if (!input || typeof input !== 'object' || !input.time || typeof input.time !== 'object') {
    throw new TypeError('Sky chart request must include an explicit time.');
  }
  const time = input.time;
  if (time.kind !== 'exact' && time.kind !== 'reference') {
    return prepareSkyChartSnapshotInput(input as SkyChartSnapshotInput);
  }
  assertMemorialTimeConsistency(time);
  const prepared = prepareSkyChartSnapshotInput({
    time: { kind: 'utc', utc: time.utc },
    location: time.location,
    limitingMagnitude: input.limitingMagnitude,
  });
  return Object.freeze({
    ...prepared,
    time: Object.freeze({
      kind: time.kind,
      disambiguation: time.disambiguation,
      offset: time.offset,
      ...(time.kind === 'reference' ? { referenceSource: time.reference.source } : {}),
    }),
  });
}

export type SkyChartSnapshotStatus =
  | { readonly status: 'loading'; readonly requestId: number }
  | { readonly status: 'ready'; readonly requestId: number; readonly snapshot: SkyChartSnapshot }
  | {
      readonly status: 'error';
      readonly requestId: number;
      readonly code: 'input' | 'catalog-load' | 'catalog-data' | 'calculation' | 'snapshot';
      readonly message: string;
    }
  | { readonly status: 'stale'; readonly requestId: number };

/** Testable adapter; the default catalog loader is imported only when the feature is requested. */
export interface SkyChartSnapshotDependencies {
  readonly catalogLoaded: () => boolean;
  readonly loadCatalog: () => Promise<void>;
  readonly getCatalog: () => readonly CatalogStar[];
  readonly calculate: (location: LocationInfo, date: Date) => SkyState;
}

const defaultDependencies: SkyChartSnapshotDependencies = {
  catalogLoaded: starCatalogLoaded,
  loadCatalog: async () => {
    const { loadStars } = await import('./starCatalog');
    await loadStars();
  },
  getCatalog: () => STAR_CATALOG,
  calculate: calculateSky,
};

function diagnostic(error: unknown): string {
  // Avoid copying URLs or location/time values from provider exceptions into diagnostic state.
  // Every Sky Engine failure is named SkyEngineError, so keep its code to tell them apart.
  if (error instanceof SkyEngineError) return error.name + ':' + error.code;
  if (error instanceof Error) return error.name;
  return 'UnknownError';
}

/**
 * Per-instance latest-request-wins coordinator; no React, network in pure functions, or global UI state.
 * Calls emit loading, then ready/error for only the newest request. Superseded requests resolve
 * as stale (never ready); invalidate() revokes pending results on caller unmount/navigation.
 * Call generate() again to retry catalog or computation errors. No personal inputs in diagnostics.
 */
export function createSkyChartSnapshotCoordinator(overrides: Partial<SkyChartSnapshotDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  let latestRequest = 0;
  let loadingCatalog: Promise<void> | null = null;
  const generate = async (
    input: SkyChartSnapshotRequest,
    onStatus?: (state: SkyChartSnapshotStatus) => void,
  ): Promise<SkyChartSnapshotStatus> => {
    const requestId = ++latestRequest;
    const emit = (state: SkyChartSnapshotStatus) => {
      if (requestId === latestRequest) onStatus?.(state);
      return state;
    };
    let prepared: PreparedSkyChartSnapshotInput;
    try {
      prepared = prepareSkyChartSnapshotRequest(input);
    } catch (error) {
      return emit({ status: 'error', requestId, code: 'input', message: diagnostic(error) });
    }
    emit({ status: 'loading', requestId });
    try {
      if (!dependencies.catalogLoaded()) {
        if (!loadingCatalog) {
          const attempt = Promise.resolve().then(() => dependencies.loadCatalog());
          loadingCatalog = attempt.finally(() => {
            loadingCatalog = null;
          });
        }
        await loadingCatalog;
      }
    } catch (error) {
      if (requestId !== latestRequest) return { status: 'stale', requestId };
      return emit({ status: 'error', requestId, code: 'catalog-load', message: diagnostic(error) });
    }
    if (requestId !== latestRequest) return { status: 'stale', requestId };
    let catalog: readonly CatalogStar[];
    try {
      if (!dependencies.catalogLoaded()) throw new Error('Catalog not installed.');
      catalog = dependencies.getCatalog();
      assertSkyChartCatalog(catalog);
      if (!overrides.getCatalog && catalog.length !== EXPECTED_HYG_DERIVATIVE_STAR_COUNT) {
        throw new RangeError('Incomplete bundled HYG derivative catalog.');
      }
    } catch (error) {
      return emit({ status: 'error', requestId, code: 'catalog-data', message: diagnostic(error) });
    }
    let sky: SkyState;
    try {
      sky = dependencies.calculate(prepared.location, new Date(prepared.utc));
    } catch (error) {
      return emit({ status: 'error', requestId, code: 'calculation', message: diagnostic(error) });
    }
    if (requestId !== latestRequest) return { status: 'stale', requestId };
    try {
      const snapshot = buildPreparedSkyChartSnapshot(prepared, sky, catalog);
      return emit({ status: 'ready', requestId, snapshot });
    } catch (error) {
      return emit({ status: 'error', requestId, code: 'snapshot', message: diagnostic(error) });
    }
  };
  return {
    generate,
    invalidate: () => {
      latestRequest += 1;
    },
  };
}
