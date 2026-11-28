import type {
  IllustrationComposition,
  IllustrationPattern,
  LayerSettings,
  MomentSnapshot,
} from './contracts';
import { catalogFor, CONSTELLATIONS } from './domain/stars';
import { frameMoment, framePattern } from './moment/framing';
import { paintIllustrationPanel, type IllustrationPanelOptions } from './moment/panel';
import { HORIZON_VARIANTS } from './moment/scenery';
import { landscapeLight, landscapeSeason, type LandscapeSeason } from './moment/seasons';
import { loadResource, validateTimeout } from './resources';
import { mergeLayers, validateAspect, validateView } from './validation';
import { cancelled, invalidInput, SkyEngineError } from './errors';
import { requireContext } from './moment/imageCanvas';
import { isDecodedImage, type RenderCanvas, type RenderImage } from './moment/scratchCanvas';

export interface LandscapeRequest {
  landscape: 'city' | 'mountains';
  season: LandscapeSeason;
  light: ReturnType<typeof landscapeLight>;
}

export interface RenderIllustrationOptions extends IllustrationPanelOptions {
  composition?: IllustrationComposition;
  layers?: Partial<LayerSettings>;
  /**
   * Return decoded artwork for the requested season and light, using host-owned URLs: a loaded
   * `<img>`, or an ImageBitmap (inside a Worker, where there is no `<img>`).
   */
  loadLandscape?: (request: LandscapeRequest, signal: AbortSignal) => Promise<RenderImage>;
  assetTimeoutMs?: number;
  signal?: AbortSignal;
}

function validatePatterns(patterns?: readonly IllustrationPattern[]): void {
  if (patterns === undefined) return;
  if (!Array.isArray(patterns) || patterns.length > 32) throw invalidInput('Too many patterns.');
  const ids = new Set<string>();
  let edges = 0;
  for (const pattern of patterns) {
    if (
      !pattern ||
      typeof pattern.id !== 'string' ||
      !pattern.id ||
      pattern.id.length > 100 ||
      ids.has(pattern.id) ||
      (pattern.label !== undefined && (typeof pattern.label !== 'string' || pattern.label.length > 200)) ||
      !Array.isArray(pattern.lines)
    ) {
      throw invalidInput('Invalid illustration pattern.');
    }
    ids.add(pattern.id);
    edges += pattern.lines.length;
    if (edges > 256) throw invalidInput('Too many pattern edges.');
    for (const pair of pattern.lines) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        !pair.every((id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= 100) ||
        pair[0] === pair[1]
      ) {
        throw invalidInput('Invalid illustration pattern edge.');
      }
    }
  }
}

function outputAspect(width: number, height: number): number {
  if (![width, height].every((n) => Number.isInteger(n) && n >= 1 && n <= 4096)) {
    throw invalidInput('Canvas dimensions must be integers between 1 and 4096.');
  }
  const aspect = width / height;
  validateAspect(aspect);
  return aspect;
}

/** Resolve composition against the actual output aspect without mutating the source scene. */
export function prepareIllustrationScene(
  scene: MomentSnapshot,
  width: number,
  height: number,
  options: Pick<
    RenderIllustrationOptions,
    'composition' | 'layers' | 'patterns' | 'milkyWay' | 'catalog'
  > = {},
): MomentSnapshot {
  const aspect = outputAspect(width, height);
  validateView(scene.view);
  validateAspect(scene.aspect);
  validatePatterns(options.patterns);
  // A genuine catalog that also fits the catalog this scene was calculated with.
  if (options.catalog !== undefined) catalogFor(scene.sky, options.catalog);
  const snapshot = { ...scene, layers: mergeLayers(scene.layers, options.layers) };
  const mode = options.composition ?? 'auto';
  if (mode === 'current') return snapshot;
  if (mode === 'auto') return frameMoment(snapshot, mode, { aspect, milkyWay: options.milkyWay });
  if (typeof mode !== 'object' || mode === null || typeof mode.pattern !== 'string') {
    throw invalidInput('Invalid illustration composition.');
  }
  const builtIn = catalogFor(scene.sky, options.catalog)?.patterns ?? CONSTELLATIONS;
  const pattern = (options.patterns ?? builtIn).find((candidate) => candidate.id === mode.pattern);
  if (!pattern) throw invalidInput('Unknown illustration pattern: ' + mode.pattern);
  return framePattern(snapshot, pattern.lines, aspect);
}

/**
 * Render a whole caller-owned canvas (a DOM canvas, or an OffscreenCanvas in a Worker); no network
 * requests except explicitly injected loaders.
 */
export async function renderIllustration(
  canvas: RenderCanvas,
  scene: MomentSnapshot,
  options: RenderIllustrationOptions = {},
): Promise<MomentSnapshot> {
  const { width, height } = canvas;
  const snapshot = prepareIllustrationScene(scene, width, height, options);
  const landscape = options.landscape ?? 'ridge';
  if (!HORIZON_VARIANTS.includes(landscape)) throw invalidInput('Invalid landscape.');
  const assetTimeoutMs = validateTimeout(options.assetTimeoutMs ?? 10000);
  if (options.signal?.aborted) throw cancelled('Illustration cancelled.');
  const ctx = requireContext(canvas);
  let landscapeArt = options.landscapeArt;
  if (landscape === 'city' || landscape === 'mountains') {
    const loader = options.loadLandscape;
    if (!landscapeArt && loader) {
      const request: LandscapeRequest = {
        landscape,
        season: landscapeSeason(snapshot),
        light: landscapeLight(snapshot.sky.sunAltitude, snapshot.sky.sun.azimuth),
      };
      landscapeArt = await loadResource(
        (signal) => loader(request, signal),
        assetTimeoutMs,
        'Landscape art',
        options.signal,
      );
    }
    if (!isDecodedImage(landscapeArt)) {
      throw new SkyEngineError('MISSING_ASSET', 'This landscape requires decoded artwork.');
    }
  }
  if (options.signal?.aborted) throw cancelled('Illustration cancelled.');
  if (canvas.width !== width || canvas.height !== height) {
    throw invalidInput('Canvas size changed while loading illustration resources.');
  }
  // Only reset after loading succeeds. Standalone calls must not inherit transforms, clips or alpha.
  canvas.width = width;
  paintIllustrationPanel(ctx, width, height, snapshot, { ...options, landscape, landscapeArt });
  return snapshot;
}
