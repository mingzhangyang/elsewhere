export interface RenderStats {
  frames: number;
  frameP95: number;
  drawP95: number;
  geometries: number;
  textures: number;
  calls: number;
  pixelRatio: number;
}
export function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}
export function adaptiveRatio(current: number, p95: number, cap: number): number {
  if (p95 > 27) return Math.max(0.75, current - 0.25);
  if (p95 > 0 && p95 < 18) return Math.min(cap, current + 0.25);
  return current;
}
