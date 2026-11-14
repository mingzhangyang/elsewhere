import {
  MathUtils,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
  type PerspectiveCamera,
  type Points,
} from 'three';
import type { Star } from '../types';

/** Screen radius, in CSS pixels, within which a tap selects a star at any zoom. */
export const STAR_PICK_RADIUS_PX = 20;

/** Used by both the point shader's alpha attribute and hit eligibility. */
export function starAlpha(star: Star, limit: number): number {
  if (star.altitude <= 0) return 0;
  const extinction = 0.2 / Math.max(0.08, Math.sin(MathUtils.degToRad(star.altitude))) - 0.2;
  return (
    (1 - MathUtils.smoothstep(star.magnitude + extinction, limit - 1, limit + 0.3)) *
    MathUtils.clamp(10 ** (-0.16 * star.magnitude), 0.15, 1)
  );
}

/**
 * Chooses the visible hit whose projected position is nearest the tap, rejecting hits farther than
 * `radiusPx`. Ranking by screen distance (not ray depth or world distance) keeps the radius exact
 * anywhere in the frame; a perspective camera magnifies the world-space threshold off-center.
 */
export function pickStarIndex(
  hits: Intersection[],
  alpha: (index: number) => number,
  screenDistance: (index: number) => number,
  radiusPx = STAR_PICK_RADIUS_PX,
): number | undefined {
  let closest: number | undefined;
  let distance = radiusPx;
  for (const hit of hits) {
    if (hit.index === undefined || alpha(hit.index) < 0.05) continue;
    const d = screenDistance(hit.index);
    if (d <= distance) {
      closest = hit.index;
      distance = d;
    }
  }
  return closest;
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
export function pickStarAt(
  points: Points,
  camera: PerspectiveCamera,
  x: number,
  y: number,
  viewport: PickViewport,
  distance: number,
  alpha: (index: number) => number,
): number | undefined {
  const raycaster = new Raycaster();
  raycaster.params.Points = { threshold: pickThreshold(distance, camera.fov, viewport.height) };
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
    projected.fromBufferAttribute(position, index).applyMatrix4(points.matrixWorld).project(camera);
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
