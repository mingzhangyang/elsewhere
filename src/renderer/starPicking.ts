import {
  MathUtils,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
  type PerspectiveCamera,
  type Points,
} from 'three';
import { magnitudeVisibility, starIntensity } from '../lib/starVisibility';
import type { Star } from '../types';

/** Screen radius, in CSS pixels, within which a tap selects a star at any zoom. */
export const STAR_PICK_RADIUS_PX = 20;

/** Used by both the point shader's alpha attribute and hit eligibility. */
export function starAlpha(star: Star, limit: number): number {
  return magnitudeVisibility(star, limit) * starIntensity(star.magnitude);
}

/**
 * Stars closer together than this on screen are one point to the eye (Mizar and its companion are
 * 19″ apart); among them a tap means the brighter one.
 */
export const STAR_TIE_PX = 2;

/**
 * Chooses the visible hit whose projected position is nearest the tap, rejecting hits farther than
 * `radiusPx`. Ranking by screen distance (not ray depth or world distance) keeps the radius exact
 * anywhere in the frame; a perspective camera magnifies the world-space threshold off-center.
 * Near-ties within STAR_TIE_PX go to the brighter star.
 */
export function pickStarIndex(
  hits: Intersection[],
  alpha: (index: number) => number,
  screenDistance: (index: number) => number,
  radiusPx = STAR_PICK_RADIUS_PX,
): number | undefined {
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
    ).index;
}

export interface PickViewport {
  left: number;
  top: number;
  width: number;
  height: number;
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

export function pickStarAt(
  points: Points,
  camera: PerspectiveCamera,
  x: number,
  y: number,
  viewport: PickViewport,
  distance: number,
  alpha: (index: number) => number,
  options: PickOptions = {},
): number | undefined {
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
  return pickStarIndex(raycaster.intersectObject(points, false), alpha, screenDistance);
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
