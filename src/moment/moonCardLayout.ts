/** Match the 4:5 share preview, rounding the short edge to a whole pixel. */
export function moonCardWidth(height: number): number {
  return Math.round((height * 4) / 5);
}
