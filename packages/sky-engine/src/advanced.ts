/**
 * Advanced, lower-level building blocks, reached as the `advanced` namespace of the package root:
 * `advanced.createProjection(...)` after importing `advanced` from the package root.
 *
 * @experimental Everything in this module may change in a minor version. The stable API (the
 * package root's other exports) does not depend on these names; use them only when the stable
 * functions cannot do the job, and pin the minor version when you do.
 *
 * It is a namespace of the single `sky-engine.mjs` module rather than a subpath file, so there is
 * still exactly one copy of the module state (the star catalog and the default Moon texture).
 */
/**
 * Load the Temporal polyfill if the runtime has none. `createSkyScene` already does this.
 * @experimental
 */
export function ensureTemporal(): Promise<void> {
  // Keep the public declaration independent of the polyfill's internal Temporal type.
  return initializeTemporal();
}

export {
  /** @experimental */
  calculateDailyEvents,
  /** @experimental */
  calculateSky,
  /** @experimental */
  getPhase,
  /** @experimental */
  nextBodyRise,
} from './domain/astronomy';
export {
  /** @experimental */
  galacticFromEquatorial,
  /** @experimental */
  createSceneToGalactic,
  /** @experimental */
  MILKY_WAY_SHAPE,
} from './domain/galactic';
export {
  /** @experimental */
  starCatalogInstallation,
} from './domain/stars';
export {
  /** @experimental */
  createCoverProjection,
  /** @experimental */
  createProjection,
  /** @experimental */
  createSkyRay,
  /** @experimental */
  type Projected,
  /** @experimental */
  type Projection,
} from './moment/projection';
export {
  /** @experimental */
  drawIllustration,
  /** @experimental */
  lettering,
  /** @experimental */
  type ToCanvas,
} from './moment/illustration';
export {
  /** @experimental */
  frameMoment,
  /** @experimental */
  type MomentFraming,
} from './moment/framing';
export {
  /** @experimental */
  paintFinish,
} from './moment/paintFinish';
export {
  /** @experimental */
  horizonAltitude,
} from './moment/scenery';
export {
  /** @experimental */
  landscapeLight,
  /** @experimental */
  landscapeSeason,
} from './moment/seasons';
export {
  /** @experimental */
  projectSkyChart,
  /** @experimental */
  type SkyChartPoint,
} from './domain/skyChartProjection';
export {
  /** @experimental */
  selectSkyChartObjects,
  /** @experimental */
  type SkyChartCandidates,
  /** @experimental */
  type SkyChartSelectedObject,
  /** @experimental */
  type SkyChartSelection,
  /** @experimental */
  type SkyChartSelectionOptions,
} from './domain/skyChartSelection';

// Last, so that the module comment above stays attached to the first declaration.
import { ensureTemporal as initializeTemporal } from './domain/temporal';
