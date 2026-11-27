// Public source entry point; the build bundles this same module for browser and npm consumers.
// Everything exported here directly is the stable API. Lower-level building blocks are grouped in
// the `advanced` namespace and are @experimental (they may change in a minor version).
export type * from './types';
export type * from './contracts';
export * as advanced from './advanced';
export { SkyEngineError, type SkyEngineErrorCode } from './errors';
export { validateObserver } from './domain/observer';
export { validateInstant } from './domain/time';
export { installTemporal } from './temporal';
export { defaultWeatherValues } from './domain/weather';
export { decodeStarColumns } from './domain/starCatalogEncoding';
export {
  awaitStarCatalog,
  getPatterns,
  getStarCatalog,
  loadStarCatalog,
  starCatalogLoaded,
  type CatalogRow,
  type CatalogStar,
  type Constellation,
  type PatternId,
  type StarField,
} from './domain/stars';
export type { SkyBrightness } from './domain/starVisibility';
export type { IllustrationDetails, IllustrationText } from './moment/illustration';
export { HORIZON_VARIANTS, type HorizonVariant } from './moment/scenery';
export type { RenderCanvas, RenderContext2D, RenderImage } from './moment/scratchCanvas';
export type { LandscapeSeason } from './moment/seasons';
export { createSkyScene, type SkySceneOptions } from './scene';
export {
  prepareIllustrationScene,
  renderIllustration,
  type RenderIllustrationOptions,
  type LandscapeRequest,
} from './render';
export { paintIllustrationPanel, type IllustrationPanelOptions } from './moment/panel';
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
export {
  renderMoonPhase,
  loadMoonTexture,
  installMoonTexture,
  type MoonPhaseOptions,
  type MoonTexture,
} from './moment/moonPhase';
