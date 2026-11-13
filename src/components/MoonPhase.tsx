/** Orthographic projection of a sphere's terminator; illumination is its lit area fraction. */
export default function MoonPhase({ illumination, angle, label }: { illumination: number; angle: number; label: string }) {
  const k = Math.max(0, Math.min(1, illumination));
  const terminator = 1 - 2 * k;
  // Right limb from top to bottom, then the projected terminator back to the top.
  const path = `M 0 -1 A 1 1 0 0 1 0 1 A ${Math.max(0.00001, Math.abs(terminator))} 1 0 0 ${terminator < 0 ? 1 : 0} 0 -1 Z`;
  return <svg className="moon-phase" viewBox="-1.08 -1.08 2.16 2.16" role="img" aria-label={label}>
    <circle r="1" fill="#172334" />
    <path d={path} fill="#dce0db" transform={`rotate(${angle - 90})`} />
    <circle r="1" fill="none" stroke="#91a0b2" strokeWidth="0.02" />
  </svg>;
}
