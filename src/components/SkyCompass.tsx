import { useSyncExternalStore } from 'react';
import { Compass } from 'lucide-react';
import type { CameraViewStore } from '../lib/cameraViewStore';
import { useI18n } from '../i18n';

/** Re-renders only when the whole-degree heading changes, not on every camera move. */
export default function SkyCompass({ view }: { view: CameraViewStore }) {
  const { m } = useI18n();
  const heading = useSyncExternalStore(view.subscribe, () => Math.round(view.get().heading) % 360);
  const direction = m.directions[Math.round(heading / 45) % 8];
  return (
    <div
      className="sky-compass"
      data-occludes-sky
      role="img"
      aria-label={m.facing({ direction, degrees: heading })}
    >
      <Compass size={24} style={{ transform: `rotate(${-heading}deg)` }} />
      <strong>{direction}</strong>
      <span>{heading}°</span>
    </div>
  );
}
