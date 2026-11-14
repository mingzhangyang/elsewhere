import type { ChangeEvent } from 'react';
import { Bookmark, HelpCircle } from 'lucide-react';
import type { LayerSettings, Preferences } from '../lib/persistence';

interface Props {
  layers: LayerSettings;
  preferences: Preferences;
  /** The system asks for reduced motion; the in-app switch then follows it. */
  systemMotion: boolean;
  placeSaved: boolean;
  onLayer: (key: keyof LayerSettings, value: boolean) => void;
  onPreferences: (change: (value: Preferences) => Preferences) => void;
  onToggleSaved: () => void;
}

const LAYER_NAMES: Record<keyof LayerSettings, string> = {
  stars: 'Stars',
  lines: 'Constellation lines',
  labels: 'Object labels',
};

export default function SettingsPanel({
  layers,
  preferences,
  systemMotion,
  placeSaved,
  onLayer,
  onPreferences,
  onToggleSaved,
}: Props) {
  const choose =
    <K extends 'quality' | 'skyBrightness' | 'horizon'>(key: K) =>
    (event: ChangeEvent<HTMLSelectElement>) =>
      onPreferences((p) => ({ ...p, [key]: event.target.value as Preferences[K] }));
  return (
    <>
      <p className="panel-intro">A clear view, with just the details you want.</p>
      <div className="setting-group">
        <h3>Sky layers</h3>
        {(Object.keys(LAYER_NAMES) as (keyof LayerSettings)[]).map((key) => (
          <button
            className="setting-toggle"
            key={key}
            aria-pressed={layers[key]}
            onClick={() => onLayer(key, !layers[key])}
          >
            <span>{LAYER_NAMES[key]}</span>
            <span className="switch" />
          </button>
        ))}
      </div>
      <div className="setting-group">
        <h3>Comfort & performance</h3>
        <button
          className="setting-toggle"
          aria-pressed={preferences.reducedMotion || systemMotion}
          disabled={systemMotion}
          onClick={() => onPreferences((p) => ({ ...p, reducedMotion: !p.reducedMotion }))}
        >
          <span>Reduce atmosphere motion</span>
          <span className="switch" />
        </button>
        {systemMotion && <p className="muted">Following your system’s reduced-motion preference.</p>}
        <label className="quality-setting">
          Rendering quality
          <select value={preferences.quality} onChange={choose('quality')}>
            <option value="auto">Automatic</option>
            <option value="low">Battery saver</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>
      <div className="setting-group">
        <h3>Sky appearance</h3>
        <label className="quality-setting">
          Light pollution
          <select value={preferences.skyBrightness} onChange={choose('skyBrightness')}>
            <option value="dark">Dark sky</option>
            <option value="suburban">Suburban sky</option>
            <option value="city">City sky</option>
          </select>
        </label>
        <label className="quality-setting">
          Horizon
          <select value={preferences.horizon} onChange={choose('horizon')}>
            <option value="flat">Unobstructed</option>
            <option value="ridge">Illustrative ridge</option>
          </select>
        </label>
        <p className="muted">
          Appearance settings are illustrative. They do not measure local light pollution or terrain. Patterns
          include the Big Dipper and Summer Triangle asterisms.
        </p>
      </div>
      <div className="setting-group">
        <h3>Your places</h3>
        <button className="secondary-button full" onClick={onToggleSaved}>
          <Bookmark size={16} />
          {placeSaved ? 'Remove saved place' : 'Save this place'}
        </button>
      </div>
      <div className="about-note">
        <HelpCircle size={19} />
        <div>
          <h3>A calculated sky</h3>
          <p>
            Positions use Astronomy Engine. The landscape and clouds are illustrative; local obstructions and
            actual cloud shapes can differ. Explore dates from 1900 through 2100.
          </p>
          <p>
            <a href={import.meta.env.BASE_URL + 'credits.html'} target="_blank" rel="noreferrer">
              Sources, privacy & limitations
            </a>
          </p>
          <p>
            <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noreferrer">
              Astronomy Engine
            </a>{' '}
            ·{' '}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
