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
