import type { LocationInfo, SkyState, WeatherSelection, WeatherValues } from '../types';
import { CONSTELLATIONS, type PatternId } from '../domain/stars';
import type { SkyBrightness } from '../domain/starVisibility';
import type { CameraView, LayerSettings } from './persistence';
import type { SkyObject } from './exploration';

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
  | { kind: 'source'; source: NonNullable<WeatherSelection['source']> }
  | { kind: 'custom' }
  | { kind: 'clear' }
  | { kind: 'none' };

export function momentProvenance(
  selection: WeatherSelection,
  custom: boolean,
  clearSky: boolean,
): MomentProvenance {
  if (clearSky) return { kind: 'clear' };
  if (custom) return { kind: 'custom' };
  return selection.source && selection.values
    ? { kind: 'source', source: selection.source }
    : { kind: 'none' };
}

const RAD = Math.PI / 180;
const unit = (altitude: number, azimuth: number): [number, number, number] => [
  Math.sin(azimuth * RAD) * Math.cos(altitude * RAD),
  Math.sin(altitude * RAD),
  -Math.cos(azimuth * RAD) * Math.cos(altitude * RAD),
];
const separation = (a: [number, number, number], b: [number, number, number]) =>
  Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / RAD;

/** Direction of a line pattern's middle: the mean of its stars' directions, or null before the catalog. */
export function patternCenter(sky: SkyState, id: PatternId): { altitude: number; azimuth: number } | null {
  const pattern = CONSTELLATIONS.find((p) => p.id === id);
  if (!pattern) return null;
  const ids = new Set(pattern.lines.flat());
  const sum = [0, 0, 0];
  let count = 0;
  for (const star of sky.stars)
    if (ids.has(star.id)) {
      const v = unit(star.altitude, star.azimuth);
      for (let i = 0; i < 3; i++) sum[i] += v[i];
      count++;
    }
  if (!count) return null;
  const length = Math.hypot(sum[0], sum[1], sum[2]);
  return {
    altitude: Math.asin(sum[1] / length) / RAD,
    azimuth: (((Math.atan2(sum[0], -sum[2]) / RAD) % 360) + 360) % 360,
  };
}

/**
 * The line pattern a view is turned to, when lines are shown and no object is centered: one above
 * the horizon whose middle is within a quarter of the field of view from the center.
 */
export function centeredPattern(
  sky: SkyState,
  view: CameraView,
  layers: LayerSettings,
): PatternId | undefined {
  if (!layers.lines) return undefined;
  const center = unit(view.altitude, view.heading);
  let best: { id: PatternId; distance: number } | undefined;
  for (const { id } of CONSTELLATIONS) {
    const middle = patternCenter(sky, id);
    if (!middle || middle.altitude <= 0) continue;
    const distance = separation(center, unit(middle.altitude, middle.azimuth));
    if (distance <= view.fov * 0.25 && (!best || distance < best.distance)) best = { id, distance };
  }
  return best?.id;
}

/** A link's subject field from a moment's subject. */
export function subjectField(subject: MomentSubject | undefined): string | undefined {
  if (!subject) return undefined;
  return subject.kind === 'object' ? subject.object.id : `pattern:${subject.id}`;
}

/**
 * Where a shared link's camera starts before it turns to its subject: lower, wider and 70° to the
 * left, so the turn reads as arriving at it.
 */
export function arrivalStart(view: CameraView): CameraView {
  return {
    heading: (view.heading + 290) % 360,
    altitude: Math.max(4, Math.min(view.altitude - 12, 20)),
    fov: Math.min(92, Math.max(view.fov, 66)),
  };
}
