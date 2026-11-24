// Public source entry point; M3 bundles this same module for browser and npm consumers.
export type * from './types';
export type * from './contracts';
export { calculateDailyEvents, calculateSky, getPhase, nextBodyRise } from './domain/astronomy';
export { galacticFromEquatorial, createSceneToGalactic, MILKY_WAY_SHAPE } from './domain/galactic';
import { ensureTemporal as initializeTemporal } from './domain/temporal';

// Keep the public declaration independent of the polyfill's internal Temporal type.
export function ensureTemporal(): Promise<void> {
  return initializeTemporal();
}
export { validateObserver } from './domain/observer';
export { validateInstant } from './domain/time';
export { defaultWeatherValues } from './domain/weather';
export { decodeStarColumns } from './domain/starCatalogEncoding';
export {
  awaitStarCatalog,
  loadStarCatalog,
  starCatalogInstallation,
  starCatalogLoaded,
  STAR_CATALOG,
  CONSTELLATIONS,
  type CatalogRow,
  type CatalogStar,
  type Constellation,
  type PatternId,
  type StarField,
} from './domain/stars';
export type { SkyBrightness } from './domain/starVisibility';
export {
  createCoverProjection,
  createProjection,
  createSkyRay,
  type Projected,
  type Projection,
} from './moment/projection';
export {
  drawIllustration,
  lettering,
  type IllustrationDetails,
  type IllustrationText,
  type ToCanvas,
} from './moment/illustration';
export { frameMoment, type MomentFraming } from './moment/framing';
export { paintFinish } from './moment/paintFinish';
export { HORIZON_VARIANTS, horizonAltitude, type HorizonVariant } from './moment/scenery';
export { landscapeLight, landscapeSeason, type LandscapeSeason } from './moment/seasons';
export { createSkyScene, type SkySceneOptions } from './scene';
export {
  prepareIllustrationScene,
  renderIllustration,
  type RenderIllustrationOptions,
  type LandscapeRequest,
} from './render';
export { paintIllustrationPanel, type IllustrationPanelOptions } from './moment/panel';
export { projectSkyChart, type SkyChartPoint } from './domain/skyChartProjection';
export {
  selectSkyChartObjects,
  type SkyChartCandidates,
  type SkyChartSelectedObject,
  type SkyChartSelection,
  type SkyChartSelectionOptions,
} from './domain/skyChartSelection';
export {
  buildSkyChartSnapshot,
  type SkyChartSnapshot,
  type SkyChartSnapshotInput,
  type SkyChartSnapshotObject,
} from './domain/skyChartSnapshot';
export type { SkyArtworkTheme } from './moment/chartPaint';
export {
  renderSkyChart,
  renderMinimalSkyMap,
  type SkyChartOptions,
  type MinimalSkyMapOptions,
} from './moment/diagram';
