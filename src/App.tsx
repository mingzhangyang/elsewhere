import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Cloud,
  Compass,
  Crosshair,
  Eye,
  Layers,
  Minus,
  Plus,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import SkyScene, { type SkySceneHandle } from './components/SkyScene';
import LocationPicker from './components/LocationPicker';
import TimeConsole from './components/TimeConsole';
import WeatherPanel from './components/WeatherPanel';
import ObjectPanel from './components/ObjectPanel';
import SkyCompass from './components/SkyCompass';
import SettingsPanel from './components/SettingsPanel';
import ShareDialog, { type ShareDialogHandle } from './components/ShareDialog';
import FocusSummary from './components/FocusSummary';
import { createCameraViewStore } from './lib/cameraViewStore';
import type { AppNotice, BodyId, LocationInfo } from './types';
import { useSimulation } from './hooks/useSimulation';
import { useWeather } from './hooks/useWeather';
import { useDrawerFocus } from './hooks/useDrawerFocus';
import { MAX_INSTANT } from './domain/time';
import { calculateSky, nextBodyRise } from './domain/astronomy';
import {
  aboveHorizon,
  findSkyObject,
  framingFov,
  isCentered,
  objectVisibility,
  type SkyObject,
} from './lib/exploration';
import { explorationReducer, initialExploration, presentedWeather, type Panel } from './lib/explorationState';
import { fetchWeatherForDate } from './services/openMeteo';
import { renderingWeather } from './domain/weather';
import { weatherSourceLabel } from './lib/weatherText';
import { isDeviceLocation, PRESETS } from './lib/locations';
import {
  arrivalStart,
  centeredPattern,
  momentProvenance,
  subjectField,
  type MomentSubject,
} from './lib/moment';
import {
  DEFAULT_FOV,
  loadPreferences,
  parseExploration,
  savePreferences,
  ZOOM_STEP,
  type LayerSettings,
  type Preferences,
} from './lib/persistence';
import type { RenderStats } from './renderer/performance';
import { currentLanguage, resolveLocale, setLanguage, useI18n, type LanguageSetting } from './i18n';
import { objectName, placeLabel } from './i18n/names';
import { memorialMessages } from './i18n/memorial';

export interface AppProps {
  initialLocation?: LocationInfo;
  initialTime?: Date;
  weatherLoader?: typeof fetchWeatherForDate;
  diagnostics?: boolean;
  onCreate?: () => void;
  onReturnToCreator?: () => void;
}
export default function App({
  initialLocation,
  initialTime,
  weatherLoader = fetchWeatherForDate,
  diagnostics = false,
  onCreate,
  onReturnToCreator,
}: AppProps) {
  const i18n = useI18n();
  const { m } = i18n;
  const creatorText = memorialMessages(i18n.locale);
  const [launch] = useState(() => ({
    preferences: loadPreferences(),
    shared:
      initialTime || initialLocation ? { value: null, notice: null } : parseExploration(window.location.hash),
  }));
  const [preferences, setPreferences] = useState<Preferences>(() => launch.preferences.value);
  const latestPreferences = useRef(preferences);
  const languageChoice = useRef(0);
  const [state, dispatch] = useReducer(explorationReducer, undefined, () =>
    initialExploration(launch.shared.value, launch.shared.notice || launch.preferences.notice),
  );
  const { panel, selectedId, focusedId, custom, customWeather, clearSky, immersive, notice } = state;
  const simulation = useSimulation(
    initialLocation ?? launch.shared.value?.location ?? launch.preferences.value.recent[0] ?? PRESETS[0],
    initialTime ?? (launch.shared.value ? new Date(launch.shared.value.instant) : undefined),
  );
  const {
    location,
    setLocation,
    simTime,
    setSimTime,
    playing,
    setPlaying,
    following,
    followNow,
    speed,
    setSpeed,
    sky,
    dayBounds,
    stars,
    retryStars,
  } = simulation;
  const { selection, refresh } = useWeather(location, simTime, weatherLoader);
  const atmosphere = useMemo(() => renderingWeather(selection), [selection]);
  const baseWeather = custom ? customWeather : atmosphere;
  const weather = useMemo(() => presentedWeather(baseWeather, clearSky), [baseWeather, clearSky]);
  const [view] = useState(() =>
    createCameraViewStore(launch.shared.value?.camera ?? { heading: 0, altitude: 18, fov: DEFAULT_FOV }),
  );
  // A shared link with a subject opens turned away from it and turns to it, unless motion is reduced.
  const [arrival] = useState(() => {
    const shared = launch.shared.value;
    const still =
      launch.preferences.value.reducedMotion ||
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    return shared?.subject && !still ? { from: arrivalStart(shared.camera), to: shared.camera } : undefined;
  });
  const [stats, setStats] = useState<RenderStats | null>(null);
  const [audit, setAudit] = useState('');
  const [systemMotion, setSystemMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const skyRef = useRef<SkySceneHandle>(null);
  const shareDialog = useRef<ShareDialogHandle>(null);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const inspector = useRef<HTMLElement>(null);
  useDrawerFocus(inspector, panel !== null);
  const restoreFocus = useRef(false);
  const panelTrigger = useRef<HTMLElement | null>(null);
  const objectsTrigger = useRef<HTMLButtonElement>(null);
  const layers = state.sharedLayers ?? preferences.layers;
  const setNotice = (notice: AppNotice) => dispatch({ type: 'notice', notice });
  const setClearSky = (value: boolean) => dispatch({ type: 'clear-sky', value });
  const sourceText = clearSky
    ? m.atmosphere.clearPreview
    : custom
      ? m.atmosphere.custom
      : weatherSourceLabel(selection, m);
  const focused = findSkyObject(sky, focusedId);
  const planetsUp = sky.planets
    .filter((planet) => planet.visible)
    .map((planet) => objectName({ ...planet, kind: 'planet' }, i18n));
  const focusedVisibility = focused && objectVisibility(focused, sky, weather, preferences);
  const place = placeLabel(location, i18n);
  const skyMood =
    sky.sunAltitude > 6
      ? m.sky.mood.day
      : sky.sunAltitude > -0.8
        ? m.sky.mood.changing
        : sky.sunAltitude > -18
          ? m.sky.mood.twilight
          : m.sky.mood.night;
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setSystemMotion(media?.matches ?? false);
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (panel) {
      panelTitle.current?.focus({ preventScroll: true });
      return;
    }
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    const trigger = panelTrigger.current;
    const usable = trigger?.isConnected && trigger.checkVisibility?.() !== false;
    (usable ? trigger : objectsTrigger.current)?.focus();
  }, [panel]);
  useEffect(() => {
    if (stars === 'error') setNotice({ code: 'stars-unavailable' });
    // Once a retry succeeds, withdraw the failure notice (but never someone else's).
    else if (stars === 'ready') dispatch({ type: 'dismiss-notice', code: 'stars-unavailable' });
  }, [stars]);
  useEffect(() => {
    const unavailable = () => setNotice({ code: 'offline-unavailable' });
    window.addEventListener('elsewhere-offline-unavailable', unavailable);
    return () => window.removeEventListener('elsewhere-offline-unavailable', unavailable);
  }, []);
  // Following the browser, a change of its language applies at once. It takes its turn in the same
  // sequence as choices made in Settings, so it supersedes one still loading (see chooseLanguage).
  useEffect(() => {
    if (preferences.language !== 'auto') return;
    const follow = () => {
      ++languageChoice.current;
      setLanguage(resolveLocale('auto')).catch(() => {});
    };
    window.addEventListener('languagechange', follow);
    return () => window.removeEventListener('languagechange', follow);
  }, [preferences.language]);
  /**
   * Changes apply to the latest preferences, not the render that scheduled them: a language choice
   * completes after its catalog downloads, and must not write back settings changed meanwhile.
   */
  const changePreferences = (change: (value: Preferences) => Preferences) => {
    const next = change(latestPreferences.current);
    latestPreferences.current = next;
    setPreferences(next);
    if (!savePreferences(next)) setNotice({ code: 'preferences-not-saved' });
  };
  /**
   * The language is saved once it has loaded; a failed download leaves the current one in place.
   * Only the latest request counts, whether a choice here or a change of the browser's language: one
   * superseded while loading is neither saved nor reported. What is saved is always what is shown.
   */
  const chooseLanguage = (setting: LanguageSetting) => {
    const ticket = ++languageChoice.current;
    const locale = resolveLocale(setting);
    setLanguage(locale).then(
      () => {
        if (ticket === languageChoice.current && currentLanguage().locale === locale)
          changePreferences((p) => ({ ...p, language: setting }));
      },
      () => {
        if (ticket === languageChoice.current) setNotice({ code: 'language-unavailable' });
      },
    );
  };
  const setLayer = (key: keyof LayerSettings, value: boolean) => {
    dispatch({ type: 'layer', key, value });
    changePreferences((p) => ({ ...p, layers: { ...p.layers, [key]: value } }));
  };
  const closePanel = () => {
    // Focus is returned after the close commits: some triggers (e.g. the phone source pill) are hidden while open.
    if (panel) restoreFocus.current = true;
    dispatch({ type: 'close-panel' });
  };
  const openPanel = (next: Panel, trigger: HTMLElement) => {
    if (panel === next) {
      closePanel();
      return;
    }
    panelTrigger.current = trigger;
    dispatch({ type: 'toggle-panel', panel: next });
  };
  /** Opens the Objects panel on an object chosen outside it (a tap in the sky, the hint). */
  const inspect = (id: string, trigger: HTMLElement | null) => {
    panelTrigger.current = trigger;
    dispatch({ type: 'inspect', id });
  };
  const chooseLocation = (next: LocationInfo) => {
    setLocation(next);
    setPlaying(false);
    dispatch({ type: 'location-changed' });
    if (!isDeviceLocation(next))
      changePreferences((prefs) => ({
        ...prefs,
        recent: [next, ...prefs.recent.filter((place) => place.id !== next.id)].slice(0, 6),
      }));
  };
  const saveLocation = (place: LocationInfo) =>
    changePreferences((prefs) => ({
      ...prefs,
      saved: prefs.saved.some((p) => p.id === place.id)
        ? prefs.saved.filter((p) => p.id !== place.id)
        : [...prefs.saved, place].slice(-30),
    }));
  /** `frame` zooms the Sun or Moon to fill the view; a jump to a rise keeps the horizon in context. */
  const focusObject = (object: SkyObject, frame = true) => {
    if (panel) restoreFocus.current = true;
    dispatch({ type: 'focus', id: object.id });
    skyRef.current?.focus(object.altitude, object.azimuth, frame ? framingFov(object) : undefined);
  };
  const jumpToRise = (id: BodyId) => {
    try {
      const rise = nextBodyRise(location, id, simTime);
      if (!rise) {
        setNotice({ code: 'no-rise' });
        return;
      }
      const time = new Date(Math.min(MAX_INSTANT, rise.getTime() + 15 * 60000));
      setPlaying(false);
      setSimTime(time);
      focusObject(findSkyObject(calculateSky(location, time), id)!, false);
    } catch {
      setNotice({ code: 'rise-failed' });
    }
  };
  const share = () => {
    setPlaying(false);
    const camera = view.get();
    // The link opens centered on the selected object only if the view still is; otherwise its
    // subject may be a line pattern the view is turned to.
    const centered = focused && aboveHorizon(focused) && isCentered(focused, camera) ? focused : undefined;
    const pattern = centered ? undefined : centeredPattern(sky, camera, layers);
    const subject: MomentSubject | undefined = centered
      ? { kind: 'object', object: centered }
      : pattern
        ? { kind: 'pattern', id: pattern }
        : undefined;
    const subjectId = subjectField(subject);
    const host = skyRef.current?.size();
    shareDialog.current?.open({
      exploration: {
        version: 1,
        location,
        instant: simTime.toISOString(),
        camera,
        layers,
        custom: custom ? customWeather : null,
        clearSky,
        ...(centered ? { focus: centered.id } : {}),
        ...(subjectId ? { subject: subjectId } : {}),
      },
      snapshot: {
        sky,
        weather,
        view: camera,
        aspect: host && host.height ? host.width / host.height : 16 / 10,
        layers,
        location,
        instant: simTime,
        skyBrightness: preferences.skyBrightness,
        provenance: momentProvenance(selection, custom, clearSky),
        subject,
      },
    });
  };
  return (
    <div className={`app-shell ${immersive ? 'immersive' : ''}`}>
      <header className="topbar">
        <a
          className="brand-lockup"
          href="#"
          aria-label={m.brand.home}
          onClick={(event) => {
            event.preventDefault();
            closePanel();
            dispatch({ type: 'immersive', value: false });
          }}
        >
          <span className="brand-mark">
            <Compass size={22} />
          </span>
          <span className="brand-name">
            elsewhere<span>.</span>
            <small>{m.brand.tagline}</small>
          </span>
        </a>
        <LocationPicker
          location={location}
          saved={preferences.saved}
          recent={preferences.recent}
          onSelect={chooseLocation}
          onSave={saveLocation}
        />
        <div className="header-actions">
          <button className="icon-button" aria-label={m.controls.share} onClick={share}>
            <Share2 size={19} />
          </button>
        </div>
      </header>
      <main
        className={`stage ${focused ? 'has-target' : ''} ${panel ? 'panel-open' : ''}`}
        aria-label={m.sky.exploration}
      >
        <SkyScene
          ref={skyRef}
          sky={sky}
          weather={weather}
          showStars={layers.stars}
          showConstellations={layers.lines}
          showLabels={layers.labels}
          initialView={arrival?.from ?? launch.shared.value?.camera}
          arriveAt={arrival?.to}
          reducedMotion={preferences.reducedMotion || systemMotion}
          quality={preferences.quality}
          horizon={preferences.horizon}
          skyBrightness={preferences.skyBrightness}
          moonDisplayAid={preferences.moonDisplayAid}
          targetId={immersive ? null : focusedId}
          playbackRate={playing && simTime.getTime() < MAX_INSTANT ? speed : 0}
          onAssetError={() => setNotice({ code: 'moon-map-unavailable' })}
          onCameraChange={view.set}
          onDiagnostics={import.meta.env.DEV && diagnostics ? setStats : undefined}
          onStarSelect={(star) => {
            if (star) inspect(star.id, document.activeElement as HTMLElement);
          }}
          onBodySelect={(body) => inspect(body, document.activeElement as HTMLElement)}
        />
        <div
          className="stage-vignette"
          style={{
            opacity: 1 - 0.78 * Math.min(1, Math.max(0, (sky.sunAltitude + 6) / 8)),
          }}
        />
        {import.meta.env.DEV && diagnostics && (
          <div className="dev-diagnostics" data-occludes-sky role="region" aria-label="Renderer diagnostics">
            <strong>Development profile</strong>
            <output>
              {stats
                ? `Frames ${stats.frames} · p95 interval ${stats.frameP95.toFixed(1)} ms · CPU draw ${stats.drawP95.toFixed(1)} ms · DPR ${stats.pixelRatio.toFixed(2)} · geometry ${stats.geometries} · textures ${stats.textures} · calls ${stats.calls}`
                : 'Waiting for renderer…'}
            </output>
            <button onClick={() => skyRef.current?.simulateContextLoss()}>Simulate graphics loss</button>
            <button
              onClick={async () => {
                if (import.meta.env.DEV) {
                  setAudit('Auditing…');
                  setAudit(await (await import('./dev/audit')).auditInterface());
                }
              }}
            >
              Audit accessibility
            </button>
            {audit && <pre role="status">{audit}</pre>}
          </div>
        )}
        <div className="sky-context" data-occludes-sky>
          <p className="eyebrow">{skyMood}</p>
          <h1>{place.name}</h1>
          {/* The clock lives in the time dock; here, only where that clock is set. */}
          <p className="context-place">
            {[place.country, m.f.zone(location.timezone, simTime)].filter(Boolean).join(' · ')}
          </p>
          <button className="source-pill" onClick={(event) => openPanel('weather', event.currentTarget)}>
            <span className={`status-dot ${clearSky || custom || !selection.values ? 'amber' : ''}`} />
            {sourceText}
            {!clearSky && !custom && !selection.values ? m.atmosphere.neutral : ''}
            <ArrowUpRight size={13} />
          </button>
          <div className="sky-create-actions">
            {onReturnToCreator ? (
              <button className="sky-create-link" type="button" onClick={onReturnToCreator}>
                <Sparkles size={17} aria-hidden="true" />
                {creatorText.returnToArtwork}
              </button>
            ) : (
              <a
                className="sky-create-link"
                href="#create"
                onClick={(event) => {
                  if (onCreate) {
                    event.preventDefault();
                    onCreate();
                  }
                }}
              >
                <Sparkles size={17} aria-hidden="true" />
                {creatorText.createEntry}
              </a>
            )}
          </div>
          {/* Only when no panel or object card already offers its own Restore button. */}
          {clearSky && !panel && !focusedVisibility && (
            <button className="restore-atmosphere" onClick={() => setClearSky(false)}>
              {custom ? m.atmosphere.restoreCustom : m.atmosphere.restoreWeather}
            </button>
          )}
        </div>
        <SkyCompass view={view} />
        <div className="view-controls" data-occludes-sky>
          <button
            className="icon-button"
            aria-label={m.controls.zoomIn}
            onClick={() => skyRef.current?.zoom(ZOOM_STEP)}
          >
            <Plus size={19} />
          </button>
          <button
            className="icon-button"
            aria-label={m.controls.zoomOut}
            onClick={() => skyRef.current?.zoom(1 / ZOOM_STEP)}
          >
            <Minus size={19} />
          </button>
          <span />
          <button
            className="icon-button"
            aria-label={m.controls.resetView}
            onClick={() => skyRef.current?.resetView()}
          >
            <Crosshair size={19} />
          </button>
          <button
            className="icon-button"
            aria-label={immersive ? m.controls.showControls : m.controls.hideControls}
            aria-pressed={immersive}
            onClick={() => dispatch({ type: 'immersive', value: !immersive })}
          >
            <Eye size={19} />
          </button>
        </div>
        {!preferences.hintDismissed && !focused && !panel && (
          <div className="scene-hint" data-occludes-sky>
            <div>
              <strong>{m.hint.title}</strong>
              <small>{m.hint.gestures}</small>
            </div>
            <button className="hint-action" onClick={(event) => inspect('moon', event.currentTarget)}>
              {m.hint.findMoon}
            </button>
            <button
              className="icon-button"
              aria-label={m.hint.dismiss}
              onClick={() => changePreferences((p) => ({ ...p, hintDismissed: true }))}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {focused && focusedVisibility && !panel && !immersive && (
          <FocusSummary
            object={focused}
            visibility={focusedVisibility}
            clearSky={clearSky}
            onClear={() => {
              dispatch({ type: 'clear-focus' });
              objectsTrigger.current?.focus();
            }}
            onRecenter={() => focusObject(focused)}
            onToggleClearSky={() => setClearSky(!clearSky)}
            onEnableStars={() => setLayer('stars', true)}
            onJumpToRise={jumpToRise}
          />
        )}
        <nav className="explore-toolbar" data-occludes-sky aria-label={m.controls.explore}>
          <button
            ref={objectsTrigger}
            aria-expanded={panel === 'objects'}
            onClick={(event) => openPanel('objects', event.currentTarget)}
          >
            <Sparkles size={17} />
            {m.controls.objects}
          </button>
          <button
            aria-expanded={panel === 'weather'}
            onClick={(event) => openPanel('weather', event.currentTarget)}
          >
            <Cloud size={17} />
            {m.controls.weather}
          </button>
          <button
            aria-expanded={panel === 'settings'}
            onClick={(event) => openPanel('settings', event.currentTarget)}
          >
            <Layers size={17} />
            {m.controls.layers}
          </button>
        </nav>
        {panel && (
          <section
            ref={inspector}
            className="inspector"
            data-occludes-sky
            aria-label={m.inspector.region[panel]}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                closePanel();
              }
            }}
          >
            <div className="inspector-heading">
              <div>
                <h2 ref={panelTitle} tabIndex={-1}>
                  {m.inspector.title[panel]}
                </h2>
              </div>
              <button className="icon-button" aria-label={m.inspector.close} onClick={closePanel}>
                <X size={20} />
              </button>
            </div>
            <div className="inspector-content">
              {panel === 'objects' && (
                <ObjectPanel
                  sky={sky}
                  timeZone={location.timezone}
                  selectedId={selectedId}
                  preferences={preferences}
                  weather={weather}
                  clearSky={clearSky}
                  onSelect={(id) => dispatch({ type: 'select', id })}
                  onFocus={focusObject}
                  onRise={jumpToRise}
                  onClearSky={() => setClearSky(!clearSky)}
                  stars={stars}
                  onRetryStars={retryStars}
                />
              )}
              {panel === 'weather' && (
                <>
                  {clearSky && (
                    <div className="preview-notice">
                      <p>{m.atmosphere.previewNotice}</p>
                      <button className="secondary-button" onClick={() => setClearSky(false)}>
                        {m.atmosphere.restore}
                      </button>
                    </div>
                  )}
                  <WeatherPanel
                    selection={selection}
                    custom={custom}
                    values={baseWeather}
                    timeZone={location.timezone}
                    onMode={(next) => dispatch({ type: 'weather-mode', custom: next, atmosphere })}
                    onField={(field, value) => dispatch({ type: 'weather-field', field, value })}
                    onRefresh={refresh}
                  />
                </>
              )}
              {panel === 'settings' && (
                <SettingsPanel
                  layers={layers}
                  preferences={preferences}
                  systemMotion={systemMotion}
                  clearSky={clearSky}
                  onClearSky={setClearSky}
                  placeSaved={preferences.saved.some((p) => p.id === location.id)}
                  onLayer={setLayer}
                  onPreferences={changePreferences}
                  onToggleSaved={() => saveLocation(location)}
                  onLanguage={chooseLanguage}
                />
              )}
            </div>
          </section>
        )}
      </main>
      <div className="bottom-dock">
        <TimeConsole
          key={location.timezone}
          instant={simTime}
          timeZone={location.timezone}
          bounds={dayBounds}
          events={sky.events}
          playing={playing}
          following={following}
          speed={speed}
          onTime={setSimTime}
          onPlaying={setPlaying}
          onSpeed={setSpeed}
          onNow={followNow}
        />
      </div>
      <footer className="bottom-bar">
        <span>{m.brand.footer}</span>
        <span>
          {m.sky.footerReadout({ sunAltitude: sky.sunAltitude, illumination: sky.moon.illumination * 100 })}
        </span>
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          {m.sky.weatherCredit}
        </a>
      </footer>
      <div className="sr-only" role="region" aria-label={m.sky.summaryRegion}>
        {m.sky.summary({
          place: place.name,
          time: m.f.time(simTime, location.timezone),
          sunAltitude: sky.sunAltitude,
          phase: m.phases[sky.moon.phase],
          illumination: sky.moon.illumination * 100,
          planets: planetsUp,
          source: sourceText,
        })}
      </div>
      {notice && (
        <div className="notice" data-occludes-sky role="status">
          <span>{m.notices[notice.code]}</span>
          <button
            className="icon-button"
            aria-label={m.controls.dismissNotice}
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <ShareDialog
        ref={shareDialog}
        includesCustomWeather={custom}
        onNotice={setNotice}
        capture={(options) => skyRef.current?.capture(options) ?? null}
      />
    </div>
  );
}
