import type { CameraView, LayerSettings, MomentSnapshot } from './contracts';
import type { LocationInfo, WeatherValues } from './types';
import { calculateSky } from './domain/astronomy';
import { validateObserver } from './domain/observer';
import { loadStarCatalog, starCatalogInstallation, starCatalogLoaded, type CatalogRow } from './domain/stars';
import type { SkyBrightness } from './domain/starVisibility';
import { ensureTemporal } from './domain/temporal';
import { validateInstant } from './domain/time';
import { defaultWeatherValues } from './domain/weather';
import { loadResource, validateTimeout } from './resources';
import { mergeLayers, validateAspect, validateView, validateWeather } from './validation';
import { cancelled, invalidInput, SkyEngineError } from './errors';

export interface SkySceneOptions {
  latitude: number;
  longitude: number;
  timezone: string;
  elevation?: number;
  locationName?: string;
  country?: string;
  instant: Date;
  weather?: WeatherValues | 'clear';
  skyBrightness?: SkyBrightness;
  view?: CameraView;
  aspect?: number;
  layers?: Partial<LayerSettings>;
  /** Supply decoded rows only when this module has no installed or in-flight catalog.
   * An in-flight installation is joined; this caller's timeout or signal does not cancel that work. */
  loadCatalog?: (signal: AbortSignal) => Promise<CatalogRow[]>;
  /** Bound on waiting for the star catalog, 1–30000 ms. Default 15000. */
  assetTimeoutMs?: number;
  /** Cancels this call (rejecting with a `CANCELLED` SkyEngineError) and a catalog load it started. */
  signal?: AbortSignal;
}

/** Calculate a complete scene without accessing geolocation, weather services or app state. */
export async function createSkyScene(options: SkySceneOptions): Promise<MomentSnapshot> {
  const location: LocationInfo = {
    id: 'sdk-observer',
    name: options.locationName ?? '',
    country: options.country ?? '',
    latitude: options.latitude,
    longitude: options.longitude,
    elevation: options.elevation ?? 0,
    timezone: options.timezone,
  };
  if (typeof location.timezone !== 'string' || !location.timezone) {
    throw invalidInput('An explicit observer time zone is required.');
  }
  validateObserver(location);
  const instant = validateInstant(new Date(options.instant.getTime()));
  const aspect = options.aspect ?? 1;
  validateAspect(aspect);
  const view = { ...(options.view ?? { heading: 0, altitude: 20, fov: 66 }) };
  validateView(view);
  const layers = mergeLayers({ stars: true, lines: false, labels: false }, options.layers);
  const skyBrightness = options.skyBrightness ?? 'dark';
  if (!['dark', 'suburban', 'city'].includes(skyBrightness)) throw invalidInput('Invalid sky brightness.');
  const weather =
    options.weather === 'clear'
      ? { ...defaultWeatherValues(), visibilityKm: 60 }
      : { ...(options.weather ?? defaultWeatherValues()) };
  validateWeather(weather);
  const assetTimeoutMs = validateTimeout(options.assetTimeoutMs ?? 15000);
  if (options.signal?.aborted) throw cancelled('Sky scene cancelled.');
  const provenance: MomentSnapshot['provenance'] =
    options.weather === 'clear' ? { kind: 'clear' } : options.weather ? { kind: 'custom' } : { kind: 'none' };
  const pending = starCatalogInstallation();
  const load = options.loadCatalog;
  if (!starCatalogLoaded() && !pending && !load) {
    throw new SkyEngineError('MISSING_ASSET', 'Supply a star catalog loader before creating a scene.');
  }
  // Join a host load that is already running (for example Elsewhere's loadStars) instead of
  // requiring another loader. The timeout and signal reject only this caller.
  const catalog = pending
    ? loadResource(() => pending, assetTimeoutMs, 'Star catalog', options.signal)
    : load
      ? loadStarCatalog(() => loadResource(load, assetTimeoutMs, 'Star catalog', options.signal))
      : Promise.resolve();
  await Promise.all([ensureTemporal(), catalog]);
  if (options.signal?.aborted) throw cancelled('Sky scene cancelled.');
  return {
    sky: calculateSky(location, instant),
    weather,
    view,
    aspect,
    layers,
    location,
    instant,
    skyBrightness,
    provenance,
  };
}
