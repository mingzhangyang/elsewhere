import type { ChangeEvent } from 'react';
import { Bookmark, HelpCircle } from 'lucide-react';
import type { LayerSettings, Preferences } from '../lib/persistence';
import { LOCALES, useI18n, type LanguageSetting, type Locale } from '../i18n';

interface Props {
  layers: LayerSettings;
  preferences: Preferences;
  /** The system asks for reduced motion; the in-app switch then follows it. */
  systemMotion: boolean;
  placeSaved: boolean;
  onLayer: (key: keyof LayerSettings, value: boolean) => void;
  onPreferences: (change: (value: Preferences) => Preferences) => void;
  onToggleSaved: () => void;
  onLanguage: (setting: LanguageSetting) => void;
}

const LAYERS: (keyof LayerSettings)[] = ['stars', 'lines', 'labels'];
/** Each language is offered under its own name, whatever the interface language. */
const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', 'zh-Hans': '简体中文' };

export default function SettingsPanel({
  layers,
  preferences,
  systemMotion,
  placeSaved,
  onLayer,
  onPreferences,
  onToggleSaved,
  onLanguage,
}: Props) {
  const { m } = useI18n();
  const t = m.settings;
  const choose =
    <K extends 'quality' | 'skyBrightness' | 'horizon'>(key: K) =>
    (event: ChangeEvent<HTMLSelectElement>) =>
      onPreferences((p) => ({ ...p, [key]: event.target.value as Preferences[K] }));
  return (
    <>
      <p className="panel-intro">{t.intro}</p>
      <div className="setting-group">
        <h3>{t.layers}</h3>
        {LAYERS.map((key) => (
          <button
            className="setting-toggle"
            key={key}
            aria-pressed={layers[key]}
            onClick={() => onLayer(key, !layers[key])}
          >
            <span>{t.layerNames[key]}</span>
            <span className="switch" />
          </button>
        ))}
      </div>
      <div className="setting-group">
        <h3>{t.comfort}</h3>
        <button
          className="setting-toggle"
          aria-pressed={preferences.reducedMotion || systemMotion}
          disabled={systemMotion}
          onClick={() => onPreferences((p) => ({ ...p, reducedMotion: !p.reducedMotion }))}
        >
          <span>{t.reduceMotion}</span>
          <span className="switch" />
        </button>
        {systemMotion && <p className="muted">{t.systemMotion}</p>}
        <label className="quality-setting">
          {t.quality}
          <select value={preferences.quality} onChange={choose('quality')}>
            <option value="auto">{t.qualityOptions.auto}</option>
            <option value="low">{t.qualityOptions.low}</option>
            <option value="high">{t.qualityOptions.high}</option>
          </select>
        </label>
      </div>
      <div className="setting-group">
        <h3>{t.appearance}</h3>
        <label className="quality-setting">
          {t.lightPollution}
          <select value={preferences.skyBrightness} onChange={choose('skyBrightness')}>
            <option value="dark">{t.brightnessOptions.dark}</option>
            <option value="suburban">{t.brightnessOptions.suburban}</option>
            <option value="city">{t.brightnessOptions.city}</option>
          </select>
        </label>
        <label className="quality-setting">
          {t.horizon}
          <select value={preferences.horizon} onChange={choose('horizon')}>
            <option value="flat">{t.horizonOptions.flat}</option>
            <option value="ridge">{t.horizonOptions.ridge}</option>
          </select>
        </label>
        <p className="muted">{t.appearanceNote}</p>
      </div>
      <div className="setting-group">
        <h3>{t.language}</h3>
        <label className="quality-setting">
          {t.languageLabel}
          <select
            value={preferences.language}
            onChange={(event) => onLanguage(event.target.value as LanguageSetting)}
          >
            <option value="auto">{t.languageAuto}</option>
            {LOCALES.map((locale) => (
              <option key={locale} value={locale} lang={locale}>
                {LANGUAGE_NAMES[locale]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="setting-group">
        <h3>{t.places}</h3>
        <button className="secondary-button full" onClick={onToggleSaved}>
          <Bookmark size={16} />
          {placeSaved ? t.removeSaved : t.savePlace}
        </button>
      </div>
      <div className="about-note">
        <HelpCircle size={19} />
        <div>
          <h3>{t.aboutTitle}</h3>
          <p>{t.about}</p>
          <p>
            <a href={import.meta.env.BASE_URL + t.creditsPage} target="_blank" rel="noreferrer">
              {t.credits}
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
