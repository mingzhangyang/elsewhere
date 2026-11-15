import { X } from 'lucide-react';
import type { SkyObject, Visibility } from '../lib/exploration';
import type { BodyId } from '../types';
import { useI18n } from '../i18n';
import { objectName, objectNameLang } from '../i18n/names';

interface Props {
  object: SkyObject;
  visibility: Visibility;
  clearSky: boolean;
  onClear: () => void;
  onRecenter: () => void;
  onToggleClearSky: () => void;
  onEnableStars: () => void;
  onJumpToRise: (body: BodyId) => void;
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
  const i18n = useI18n();
  const { m } = i18n;
  const name = objectName(object, i18n);
  const text = m.visibility(visibility, name);
  const obscured = ['cloud', 'haze', 'partial-cloud'].includes(visibility.reason);
  return (
    <section className="focus-summary" data-occludes-sky aria-label={m.focus.region}>
      <div>
        <strong lang={objectNameLang(object, i18n)}>{name}</strong>
        <span>{text.label}</span>
        <button className="icon-button" aria-label={m.focus.clear} onClick={onClear}>
          <X size={16} />
        </button>
      </div>
      <p>{text.detail}</p>
      <div className="focus-actions">
        <button onClick={onRecenter}>{m.focus.recenter}</button>
        {(clearSky || obscured) && (
          <button onClick={onToggleClearSky}>
            {clearSky ? m.atmosphere.restore : m.atmosphere.previewClear}
          </button>
        )}
        {visibility.reason === 'layer' && <button onClick={onEnableStars}>{m.focus.enableStars}</button>}
        {visibility.reason === 'horizon' && object.kind !== 'star' && (
          <button onClick={() => onJumpToRise(object.id)}>{m.focus.jumpToRise}</button>
        )}
      </div>
    </section>
  );
}
