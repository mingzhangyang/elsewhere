// Source-only entry point for the shared engine. Distribution is a separate milestone.
export type * from './types';
export type * from './contracts';
export { calculateDailyEvents, calculateSky, getPhase, nextBodyRise } from './domain/astronomy';
export { galacticFromEquatorial, createSceneToGalactic, MILKY_WAY_SHAPE } from './domain/galactic';
export { ensureTemporal } from './domain/temporal';
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
