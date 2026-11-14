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
import type { LocationInfo } from './types';
import { useSimulation } from './hooks/useSimulation';
import { useWeather } from './hooks/useWeather';
import { formatTime, MAX_INSTANT } from './lib/time';
import { calculateSky, nextBodyRise } from './lib/astronomy';
import { findSkyObject, framingFov, objectVisibility, type SkyObject } from './lib/exploration';
import { explorationReducer, initialExploration, presentedWeather, type Panel } from './lib/explorationState';
import { fetchWeatherForDate, renderingWeather, weatherSourceLabel } from './lib/weather';
import { isDeviceLocation, PRESETS } from './lib/locations';
import {
  DEFAULT_FOV,
  explorationUrl,
  loadPreferences,
  parseExploration,
  savePreferences,
  ZOOM_STEP,
  type LayerSettings,
  type Preferences,
} from './lib/persistence';
import type { RenderStats } from './renderer/performance';

export interface AppProps {
  initialLocation?: LocationInfo;
  initialTime?: Date;
  weatherLoader?: typeof fetchWeatherForDate;
  diagnostics?: boolean;
}
export default function App({
  initialLocation,
  initialTime,
  weatherLoader = fetchWeatherForDate,
  diagnostics = false,
}: AppProps) {
  const [launch] = useState(() => ({
    preferences: loadPreferences(),
    shared:
      initialTime || initialLocation ? { value: null, notice: '' } : parseExploration(window.location.hash),
  }));
  const [preferences, setPreferences] = useState<Preferences>(() => launch.preferences.value);
  const [state, dispatch] = useReducer(explorationReducer, undefined, () =>
    initialExploration(launch.shared.value, launch.shared.notice || launch.preferences.notice),
  );
  const { panel, selectedId, focusedId, custom, customWeather, clearSky, immersive, notice } = state;
  const simulation = useSimulation(
    initialLocation ?? launch.shared.value?.location ?? PRESETS[0],
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
    localParts,
    sky,
    dayBounds,
  } = simulation;
  const { selection, refresh } = useWeather(location, simTime, weatherLoader);
  const atmosphere = useMemo(() => renderingWeather(selection), [selection]);
  const baseWeather = custom ? customWeather : atmosphere;
  const weather = useMemo(() => presentedWeather(baseWeather, clearSky), [baseWeather, clearSky]);
  const [view] = useState(() =>
    createCameraViewStore(launch.shared.value?.camera ?? { heading: 0, altitude: 18, fov: DEFAULT_FOV }),
  );
  const [stats, setStats] = useState<RenderStats | null>(null);
  const [audit, setAudit] = useState('');
  const [systemMotion, setSystemMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const skyRef = useRef<SkySceneHandle>(null);
  const shareDialog = useRef<ShareDialogHandle>(null);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  const panelTrigger = useRef<HTMLElement | null>(null);
  const objectsTrigger = useRef<HTMLButtonElement>(null);
  const layers = state.sharedLayers ?? preferences.layers;
  const setNotice = (message: string) => dispatch({ type: 'notice', message });
  const setClearSky = (value: boolean) => dispatch({ type: 'clear-sky', value });
  const sourceText = clearSky
    ? 'Clear-sky preview'
    : custom
      ? 'Custom simulation'
      : weatherSourceLabel(selection);
  const focused = findSkyObject(sky, focusedId);
  const focusedVisibility = focused && objectVisibility(focused, sky, weather, preferences);
  const skyMood =
    sky.sunAltitude > 6
      ? 'A moment under the Sun'
      : sky.sunAltitude > -0.8
        ? 'The light is changing'
        : sky.sunAltitude > -18
          ? 'Between day and night'
          : 'A sky full of possibility';
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
    const unavailable = () =>
      setNotice(
        'Offline caching could not be enabled. This open sky remains usable; reloading offline may require a connection.',
      );
    window.addEventListener('elsewhere-offline-unavailable', unavailable);
    return () => window.removeEventListener('elsewhere-offline-unavailable', unavailable);
  }, []);
  const changePreferences = (change: (value: Preferences) => Preferences) => {
    const next = change(preferences);
    setPreferences(next);
    if (!savePreferences(next))
      setNotice('Changes are active, but this browser could not save your preferences.');
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
  const jumpToRise = (id: 'sun' | 'moon') => {
    try {
      const rise = nextBodyRise(location, id, simTime);
      if (!rise) {
        setNotice('No rise was found within the supported dates. Try another place or date.');
        return;
      }
      const time = new Date(Math.min(MAX_INSTANT, rise.getTime() + 15 * 60000));
      setPlaying(false);
      setSimTime(time);
      focusObject(findSkyObject(calculateSky(location, time), id)!, false);
    } catch {
      setNotice('This rise could not be calculated. Choose another date or place.');
    }
  };
  const share = () => {
    setPlaying(false);
    shareDialog.current?.open(
      explorationUrl({
        version: 1,
        location,
        instant: simTime.toISOString(),
        camera: view.get(),
        layers,
        custom: custom ? customWeather : null,
        clearSky,
      }),
    );
  };
  return (
    <div className={`app-shell ${immersive ? 'immersive' : ''}`}>
      <header className="topbar">
        <a
          className="brand-lockup"
          href="#"
          aria-label="Elsewhere home"
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
            <small>A LITTLE PERSPECTIVE</small>
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
          <button className="icon-button" aria-label="Share this sky" onClick={share}>
            <Share2 size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Open sky settings"
            onClick={(event) => openPanel('settings', event.currentTarget)}
          >
            <Layers size={19} />
          </button>
        </div>
      </header>
      <main
        className={`stage ${focused ? 'has-target' : ''} ${panel ? 'panel-open' : ''}`}
        aria-label="Sky exploration"
      >
        <SkyScene
          ref={skyRef}
          sky={sky}
          weather={weather}
          showStars={layers.stars}
          showConstellations={layers.lines}
          showLabels={layers.labels}
          initialView={launch.shared.value?.camera}
          reducedMotion={preferences.reducedMotion || systemMotion}
          quality={preferences.quality}
          horizon={preferences.horizon}
          skyBrightness={preferences.skyBrightness}
          targetId={immersive ? null : focusedId}
          playbackRate={playing && simTime.getTime() < MAX_INSTANT ? speed : 0}
          onAssetError={setNotice}
          onCameraChange={view.set}
          onDiagnostics={import.meta.env.DEV && diagnostics ? setStats : undefined}
          onStarSelect={(star) => {
            if (star) inspect(star.id, document.activeElement as HTMLElement);
          }}
          onBodySelect={(body) => inspect(body, document.activeElement as HTMLElement)}
        />
        <div className="stage-vignette" />
        {import.meta.env.DEV && diagnostics && (
          <div className="dev-diagnostics" role="region" aria-label="Renderer diagnostics">
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
        <div className="sky-context">
          <p className="eyebrow">{skyMood}</p>
          <h1>{location.name}</h1>
          <div className="context-time">
            {localParts.time}
            <span>{location.timezone.replaceAll('_', ' ')}</span>
          </div>
          <button className="source-pill" onClick={(event) => openPanel('weather', event.currentTarget)}>
            <span className={`status-dot ${clearSky || custom || !selection.values ? 'amber' : ''}`} />
            {sourceText}
            {!clearSky && !custom && !selection.values ? ' · neutral sky' : ''}
            <ArrowUpRight size={13} />
          </button>
          {clearSky && (
            <button className="restore-atmosphere" onClick={() => setClearSky(false)}>
              Restore {custom ? 'custom atmosphere' : 'weather atmosphere'}
            </button>
          )}
        </div>
        <SkyCompass view={view} />
        <div className="view-controls">
          <button
            className="icon-button"
            aria-label="Zoom in"
            onClick={() => skyRef.current?.zoom(ZOOM_STEP)}
          >
            <Plus size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Zoom out"
            onClick={() => skyRef.current?.zoom(1 / ZOOM_STEP)}
          >
            <Minus size={19} />
          </button>
          <span />
          <button className="icon-button" aria-label="Reset view" onClick={() => skyRef.current?.resetView()}>
            <Crosshair size={19} />
          </button>
          <button
            className="icon-button"
            aria-label={immersive ? 'Show controls' : 'Hide controls'}
            aria-pressed={immersive}
            onClick={() => dispatch({ type: 'immersive', value: !immersive })}
          >
            <Eye size={19} />
          </button>
        </div>
        {!preferences.hintDismissed && !focused && !panel && (
          <div className="scene-hint">
            <div>
              <strong>Where will you look?</strong>
              <small>Drag to explore · arrows to look · pinch or + / − to zoom</small>
            </div>
            <button className="hint-action" onClick={(event) => inspect('moon', event.currentTarget)}>
              Find the Moon
            </button>
            <button
              className="icon-button"
              aria-label="Dismiss viewing hint"
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
        <nav className="explore-toolbar" aria-label="Explore controls">
          <button
            ref={objectsTrigger}
            aria-expanded={panel === 'objects'}
            onClick={(event) => openPanel('objects', event.currentTarget)}
          >
            <Sparkles size={17} />
            Objects
          </button>
          <button
            aria-expanded={panel === 'weather'}
            onClick={(event) => openPanel('weather', event.currentTarget)}
          >
            <Cloud size={17} />
            Weather
          </button>
          <button
            aria-expanded={panel === 'settings'}
            onClick={(event) => openPanel('settings', event.currentTarget)}
          >
            <Layers size={17} />
            Layers
          </button>
        </nav>
        {panel && (
          <section
            className="inspector"
            aria-label={`${panel} inspector`}
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
                  {panel === 'objects'
                    ? 'Explore the sky'
                    : panel === 'weather'
                      ? 'Weather & atmosphere'
                      : 'Make it your view'}
                </h2>
              </div>
              <button className="icon-button" aria-label="Close inspector" onClick={closePanel}>
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
                />
              )}
              {panel === 'weather' && (
                <>
                  {clearSky && (
                    <div className="preview-notice">
                      <p>
                        The sky is temporarily clear for exploration. Original weather values are shown below.
                      </p>
                      <button className="secondary-button" onClick={() => setClearSky(false)}>
                        Restore atmosphere
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
                  placeSaved={preferences.saved.some((p) => p.id === location.id)}
                  onLayer={setLayer}
                  onPreferences={changePreferences}
                  onToggleSaved={() => saveLocation(location)}
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
        <span>THE SKY, FROM HERE</span>
        <span>
          Sun {sky.sunAltitude.toFixed(1)}° · Moon {Math.round(sky.moon.illumination * 100)}% lit
        </span>
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Weather by Open-Meteo
        </a>
      </footer>
      <div className="sr-only" role="region" aria-label="Sky summary">
        {location.name}. Local time {formatTime(simTime, location.timezone)}. Sun altitude{' '}
        {Math.round(sky.sunAltitude)} degrees. Moon {sky.moon.phaseName},{' '}
        {Math.round(sky.moon.illumination * 100)} percent illuminated. {sourceText}.
      </div>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button className="icon-button" aria-label="Dismiss notice" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <ShareDialog
        ref={shareDialog}
        location={location}
        includesCustomWeather={custom}
        onNotice={setNotice}
      />
    </div>
  );
}
