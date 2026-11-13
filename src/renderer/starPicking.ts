import { MathUtils, type Intersection } from 'three';
import type { Star } from '../types';

/** Used by both the point shader's alpha attribute and hit eligibility. */
export function starAlpha(star: Star, limit: number): number {
  if (star.altitude <= 0) return 0;
  const extinction = 0.2 / Math.max(0.08, Math.sin(MathUtils.degToRad(star.altitude))) - 0.2;
  return (
    (1 - MathUtils.smoothstep(star.magnitude + extinction, limit - 1, limit + 0.3)) *
    MathUtils.clamp(10 ** (-0.16 * star.magnitude), 0.15, 1)
  );
}

export function pickStarIndex(hits: Intersection[], alpha: (index: number) => number): number | undefined {
  let closest: number | undefined;
  let distance = Infinity;
  for (const hit of hits) {
    if (hit.index === undefined || alpha(hit.index) < 0.05) continue;
    // Raycaster sorts by depth, which favors off-center points on a spherical catalog.
    if (hit.distanceToRay !== undefined && hit.distanceToRay < distance) {
      closest = hit.index;
      distance = hit.distanceToRay;
    }
  }
  return closest;
}

/** Screen radius, in CSS pixels, within which a tap selects a star at any zoom. */
export const STAR_PICK_RADIUS_PX = 20;

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
