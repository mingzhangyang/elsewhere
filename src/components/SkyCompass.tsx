import { useSyncExternalStore } from 'react';
import { Compass } from 'lucide-react';
import type { CameraViewStore } from '../lib/cameraViewStore';

const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Re-renders only when the whole-degree heading changes, not on every camera move. */
export default function SkyCompass({ view }: { view: CameraViewStore }) {
  const heading = useSyncExternalStore(view.subscribe, () => Math.round(view.get().heading) % 360);
  const direction = directions[Math.round(heading / 45) % 8];
  return (
    <div
      className="sky-compass"
      data-occludes-sky
      role="img"
      aria-label={`Facing ${direction}, ${heading} degrees`}
    >
      <Compass size={24} style={{ transform: `rotate(${-heading}deg)` }} />
      <strong>{direction}</strong>
      <span>{heading}°</span>
    </div>
  );
}
