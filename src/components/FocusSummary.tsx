import { X } from 'lucide-react';
import type { objectVisibility, SkyObject } from '../lib/exploration';

interface Props {
  object: SkyObject;
  visibility: ReturnType<typeof objectVisibility>;
  clearSky: boolean;
  onClear: () => void;
  onRecenter: () => void;
  onToggleClearSky: () => void;
  onEnableStars: () => void;
  onJumpToRise: (body: 'sun' | 'moon') => void;
}

/** The card for the centered object: why it is or isn't visible, and the one action that helps. */
export default function FocusSummary({
  object,
  visibility,
  clearSky,
  onClear,
  onRecenter,
  onToggleClearSky,
  onEnableStars,
  onJumpToRise,
}: Props) {
  const obscured = ['cloud', 'haze', 'partial-cloud'].includes(visibility.reason);
  return (
    <section className="focus-summary" aria-label="Selected object">
      <div>
        <strong>{object.name}</strong>
        <span>{visibility.label}</span>
        <button className="icon-button" aria-label="Clear object selection" onClick={onClear}>
          <X size={16} />
        </button>
      </div>
      <p>{visibility.detail}</p>
      <div className="focus-actions">
        <button onClick={onRecenter}>Recenter</button>
        {(clearSky || obscured) && (
          <button onClick={onToggleClearSky}>
            {clearSky ? 'Restore atmosphere' : 'Preview a clear sky'}
          </button>
        )}
        {visibility.reason === 'layer' && <button onClick={onEnableStars}>Enable stars</button>}
        {visibility.reason === 'horizon' && object.kind !== 'star' && (
          <button onClick={() => onJumpToRise(object.kind)}>Jump to next rise</button>
        )}
      </div>
    </section>
  );
}
