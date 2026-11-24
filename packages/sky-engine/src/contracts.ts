import type { LocationInfo, Planet, SkyState, Star, WeatherSource, WeatherValues } from './types';
import type { PatternId } from './domain/stars';
import type { SkyBrightness } from './domain/starVisibility';

export interface LayerSettings {
  stars: boolean;
  lines: boolean;
  labels: boolean;
}
export interface CameraView {
  heading: number;
  altitude: number;
  fov: number;
}

export type SkyObject =
  | (SkyState['sun'] & { id: 'sun'; name: string; kind: 'sun' })
  | (SkyState['moon'] & { id: 'moon'; name: string; kind: 'moon' })
  | (Planet & { kind: 'planet' })
  | (Star & { kind: 'star' });

/**
 * A sky moment (ROADMAP phase 3 prototype): everything a keepsake image is drawn from, captured when
 * the share dialog opens. Text is not stored here; the image is worded when it is drawn, in the
 * language shown then (the sender's).
 */
export interface MomentSnapshot {
  sky: SkyState;
  weather: WeatherValues;
  view: CameraView;
  /** Width over height of the sky view the snapshot was taken from. */
  aspect: number;
  layers: LayerSettings;
  location: LocationInfo;
  instant: Date;
  skyBrightness: SkyBrightness;
  provenance: MomentProvenance;
  subject?: MomentSubject;
}
export type MomentSubject = { kind: 'object'; object: SkyObject } | { kind: 'pattern'; id: PatternId };

/** Where the conditions in a moment come from, for the provenance line on the image. */
export type MomentProvenance =
  | { kind: 'source'; source: WeatherSource }
  | { kind: 'custom' }
  | { kind: 'clear' }
  | { kind: 'none' };

/** Host-defined chalk line pattern, using actual HYG star IDs (not invented sky coordinates). */
export interface IllustrationPattern {
  id: string;
  lines: readonly (readonly [string, string])[];
  label?: string;
}

export type IllustrationComposition = 'current' | 'auto' | { pattern: string };
