import {
  MathUtils,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
  type PerspectiveCamera,
  type Points,
} from 'three';
import { magnitudeVisibility, starIntensity } from '../domain/starVisibility';
import type { Star } from '../types';

/** Screen radius, in CSS pixels, within which a tap selects a star at any zoom. */
export const STAR_PICK_RADIUS_PX = 20;

/** Used by both the point shader's alpha attribute and hit eligibility, for stars and planets. */
export function starAlpha(star: Pick<Star, 'altitude' | 'magnitude'>, limit: number): number {
  return magnitudeVisibility(star, limit) * starIntensity(star.magnitude);
}

/**
 * Stars closer together than this on screen are one point to the eye (Mizar and its companion are
 * 19″ apart); among them a tap means the brighter one.
 */
export const STAR_TIE_PX = 2;

export interface PickHit {
  index: number;
  /** Screen distance from the tap, in CSS pixels. */
  distance: number;
  /** Drawn alpha; the tie-break between points that look like one. */
  brightness: number;
}

/**
 * The better of two hits, possibly from different point sets (planets and stars): the nearer on
 * screen, or within STAR_TIE_PX of each other, the brighter.
 */
export function betterHit<T extends PickHit>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a || !b) return a ?? b;
  if (Math.abs(a.distance - b.distance) <= STAR_TIE_PX) {
    if (a.brightness !== b.brightness) return a.brightness > b.brightness ? a : b;
  }
  return a.distance <= b.distance ? a : b;
}

/**
 * Chooses the visible hit whose projected position is nearest the tap, rejecting hits farther than
 * `radiusPx`. Ranking by screen distance (not ray depth or world distance) keeps the radius exact
 * anywhere in the frame; a perspective camera magnifies the world-space threshold off-center.
 * Near-ties within STAR_TIE_PX go to the brighter star.
 */
export function pickStarHit(
  hits: Intersection[],
  alpha: (index: number) => number,
  screenDistance: (index: number) => number,
  radiusPx = STAR_PICK_RADIUS_PX,
): PickHit | undefined {
  const candidates = hits.flatMap((hit) => {
    if (hit.index === undefined) return [];
    const brightness = alpha(hit.index);
    if (brightness < 0.05) return [];
    const distance = screenDistance(hit.index);
    return distance <= radiusPx ? [{ index: hit.index, distance, brightness }] : [];
  });
  if (!candidates.length) return undefined;
  const nearest = Math.min(...candidates.map((c) => c.distance));
  return candidates
    .filter((c) => c.distance <= nearest + STAR_TIE_PX)
    .reduce((best, c) =>
      c.brightness > best.brightness || (c.brightness === best.brightness && c.distance < best.distance)
        ? c
        : best,
    );
}

/** The index of pickStarHit's choice. */
export function pickStarIndex(
  hits: Intersection[],
  alpha: (index: number) => number,
  screenDistance: (index: number) => number,
  radiusPx = STAR_PICK_RADIUS_PX,
): number | undefined {
  return pickStarHit(hits, alpha, screenDistance, radiusPx)?.index;
}

export interface PickViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DiscPickHit extends PickHit {
  /** True if the tap landed inside the visible disc, not just its larger touch target. */
  insideDisc: boolean;
}

/**
 * The visible Moon is a foreground disc, so a direct disc tap wins over points behind it.
 * Outside the disc, compare the Moon's touch padding by center distance, just like
 * stars and planets. This avoids a bright Moon stealing taps on close point centers.
 */
export function betterDiscHit<T extends PickHit>(
  disc: (T & { insideDisc: boolean }) | undefined,
  point: T | undefined,
): T | undefined {
  if (disc?.insideDisc) return disc;
  return betterHit(disc, point);
}

/**
 * A rendered disc under a tap, in CSS screen pixels. A 20px minimum center tolerance
 * makes a wide-view Moon usable by touch, and zoomed discs remain selectable across
 * their visible area. The returned distance is always from the center, matching points.
 */
export function pickDiscAt(
  worldCenter: Vector3,
  camera: PerspectiveCamera,
  x: number,
  y: number,
  viewport: PickViewport,
  displayedDiameterPx: number,
): DiscPickHit | undefined {
  const point = worldCenter.clone().project(camera);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.z <= -1 || point.z >= 1)
    return undefined;
  const radius = Math.max(0, displayedDiameterPx / 2);
  const sx = viewport.left + ((point.x + 1) / 2) * viewport.width;
  const sy = viewport.top + ((1 - point.y) / 2) * viewport.height;
  const fromCenter = Math.hypot(sx - x, sy - y);
  if (fromCenter > Math.max(STAR_PICK_RADIUS_PX, radius)) return undefined;
  return { index: 0, distance: fromCenter, brightness: 1, insideDisc: fromCenter <= radius };
}

/**
 * Picks the star under a tap at client coordinates (`x`, `y`). The ray threshold is only a broad
 * phase: it matches the pick radius at the frame center, which is the largest angular radius 20px
 * can cover, so no star within the radius elsewhere is missed before the exact screen-space test.
 */
export interface PickOptions {
  /**
   * World position at which the star is drawn, when it differs from the geometry (stars are refracted
   * in the shader). Defaults to the position attribute through the object's world matrix.
   */
  position?: (index: number, target: Vector3) => Vector3;
  /** Extra world-space broad-phase radius covering any gap between the geometry and `position`. */
  margin?: number;
}

export function pickStarAt(...args: Parameters<typeof pickPointAt>): number | undefined {
  return pickPointAt(...args)?.index;
}

/** pickStarAt, with the hit's screen distance and brightness for ranking against another set. */
export function pickPointAt(
  points: Points,
  camera: PerspectiveCamera,
  x: number,
  y: number,
  viewport: PickViewport,
  distance: number,
  alpha: (index: number) => number,
  options: PickOptions = {},
): PickHit | undefined {
  const raycaster = new Raycaster();
  raycaster.params.Points = {
    threshold: pickThreshold(distance, camera.fov, viewport.height) + (options.margin ?? 0),
  };
  raycaster.setFromCamera(
    new Vector2(
      ((x - viewport.left) / viewport.width) * 2 - 1,
      (-(y - viewport.top) / viewport.height) * 2 + 1,
    ),
    camera,
  );
  const position = points.geometry.getAttribute('position');
  const projected = new Vector3();
  const screenDistance = (index: number) => {
    if (options.position) options.position(index, projected).project(camera);
    else projected.fromBufferAttribute(position, index).applyMatrix4(points.matrixWorld).project(camera);
    const sx = viewport.left + ((projected.x + 1) / 2) * viewport.width;
    const sy = viewport.top + ((1 - projected.y) / 2) * viewport.height;
    return Math.hypot(sx - x, sy - y);
  };
  return pickStarHit(raycaster.intersectObject(points, false), alpha, screenDistance);
}

/** Converts a screen-space pick radius into a world-space ray threshold at `distance`. */
export function pickThreshold(
  distance: number,
  fovDegrees: number,
  viewportHeight: number,
  radiusPx = STAR_PICK_RADIUS_PX,
): number {
  const visibleHeight = 2 * distance * Math.tan(MathUtils.degToRad(fovDegrees) / 2);
  return (radiusPx * visibleHeight) / Math.max(1, viewportHeight);
}
