import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Cloud,
  Compass,
  Crosshair,
  Eye,
  HelpCircle,
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
import type { LocationInfo, WeatherValues } from './types';
import { useSimulation } from './hooks/useSimulation';
import { useWeather } from './hooks/useWeather';
import { formatTime, MAX_INSTANT } from './lib/time';
import { calculateSky, nextBodyRise } from './lib/astronomy';
import { findSkyObject, objectVisibility, type SkyObject } from './lib/exploration';
import {
  customConditions,
  defaultWeatherValues,
  fetchWeatherForDate,
  renderingWeather,
  weatherSourceLabel,
} from './lib/weather';
import { PRESETS } from './lib/locations';
import {
  explorationUrl,
  loadPreferences,
  parseExploration,
  savePreferences,
  type CameraView,
  type Preferences,
} from './lib/persistence';
import type { RenderStats } from './renderer/performance';

export interface AppProps {
  initialLocation?: LocationInfo;
  initialTime?: Date;
  weatherLoader?: typeof fetchWeatherForDate;
  diagnostics?: boolean;
}
type Panel = 'objects' | 'weather' | 'settings';
const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

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
  const [preferences, setPreferences] = useState<Preferences>(() => ({
    ...launch.preferences.value,
    layers: launch.shared.value?.layers ?? launch.preferences.value.layers,
  }));
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
  const [custom, setCustom] = useState(!!launch.shared.value?.custom);
  const [customWeather, setCustomWeather] = useState<WeatherValues>(
    () => launch.shared.value?.custom ?? defaultWeatherValues(),
  );
  const baseWeather = custom ? customWeather : atmosphere;
  const [clearSky, setClearSky] = useState(launch.shared.value?.clearSky ?? false);
  const weather = useMemo(
    () =>
      clearSky
        ? {
            ...baseWeather,
            cloudCover: 0,
            cloudLow: 0,
            cloudMid: 0,
            cloudHigh: 0,
            haze: 0,
            precipitation: 0,
            visibilityKm: 60,
            weatherCode: 0,
          }
        : baseWeather,
    [baseWeather, clearSky],
  );
  const [panel, setPanel] = useState<Panel | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [view, setView] = useState<CameraView>(
    () => launch.shared.value?.camera ?? { heading: 0, altitude: 18, fov: 66 },
  );
  const [notice, setNotice] = useState(launch.shared.notice || launch.preferences.notice);
  const [immersive, setImmersive] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<RenderStats | null>(null);
  const [audit, setAudit] = useState('');
  const [systemMotion, setSystemMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const skyRef = useRef<SkySceneHandle>(null);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const panelTrigger = useRef<HTMLElement | null>(null);
  const objectsTrigger = useRef<HTMLButtonElement>(null);
  const shareDialog = useRef<HTMLDialogElement>(null);
  const shareInput = useRef<HTMLInputElement>(null);
  const layers = preferences.layers;
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
    if (panel) panelTitle.current?.focus({ preventScroll: true });
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
  const openPanel = (next: Panel, trigger: HTMLElement) => {
    if (panel === next) {
      closePanel();
      return;
    }
    panelTrigger.current = trigger;
    if (next === 'objects') setSelectedId(null);
    setPanel(next);
  };
  const closePanel = () => {
    setPanel(null);
    (panelTrigger.current?.isConnected ? panelTrigger.current : objectsTrigger.current)?.focus();
  };
  const chooseLocation = (next: LocationInfo) => {
    setLocation(next);
    setPlaying(false);
    setSelectedId(null);
    setFocusedId(null);
    if (next.id !== 'device-location')
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
  const mode = (next: boolean) => {
    setClearSky(false);
    if (next && !custom) setCustomWeather(customConditions(atmosphere));
    setCustom(next);
  };
  const field = (name: keyof WeatherValues, value: number) =>
    setCustomWeather((current) => customConditions(current, name, value));
  const focusObject = (object: SkyObject) => {
    setFocusedId(object.id);
    skyRef.current?.focus(object.altitude, object.azimuth);
    if (panel) closePanel();
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
      focusObject(findSkyObject(calculateSky(location, time), id)!);
    } catch {
      setNotice('This rise could not be calculated. Choose another date or place.');
    }
  };
  const share = () => {
    setPlaying(false);
    setCopied(false);
    setShareLink(
      explorationUrl({
        version: 1,
        location,
        instant: simTime.toISOString(),
        camera: view,
        layers,
        custom: custom ? customWeather : null,
        clearSky,
      }),
    );
    shareDialog.current?.showModal();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
    } catch {
      shareInput.current?.select();
      setNotice('Select the link and copy it with your keyboard.');
    }
  };
  return (
    <main className={`app-shell ${immersive ? 'immersive' : ''}`}>
      <header className="topbar">
        <a
          className="brand-lockup"
          href="#"
          aria-label="Elsewhere home"
          onClick={(event) => {
            event.preventDefault();
            setImmersive(false);
            closePanel();
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
      <section className={`stage ${focused ? 'has-target' : ''}`} aria-label="Sky exploration">
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
          onAssetError={setNotice}
          onCameraChange={setView}
          onDiagnostics={import.meta.env.DEV && diagnostics ? setStats : undefined}
          onStarSelect={(star) => {
            if (star) {
              setSelectedId(star.id);
              panelTrigger.current = document.activeElement as HTMLElement;
              setPanel('objects');
            }
          }}
          onBodySelect={(body) => {
            setSelectedId(body);
            panelTrigger.current = document.activeElement as HTMLElement;
            setPanel('objects');
          }}
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
        <div
          className="sky-compass"
          role="img"
          aria-label={`Facing ${directions[Math.round(view.heading / 45) % 8]}, ${Math.round(view.heading)} degrees`}
        >
          <Compass size={24} style={{ transform: `rotate(${-view.heading}deg)` }} />
          <strong>{directions[Math.round(view.heading / 45) % 8]}</strong>
          <span>{Math.round(view.heading)}°</span>
        </div>
        <div className="view-controls">
          <button className="icon-button" aria-label="Zoom in" onClick={() => skyRef.current?.zoom(-5)}>
            <Plus size={19} />
          </button>
          <button className="icon-button" aria-label="Zoom out" onClick={() => skyRef.current?.zoom(5)}>
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
            onClick={() => {
              setImmersive(!immersive);
              setPanel(null);
            }}
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
            <button
              className="hint-action"
              onClick={(event) => {
                panelTrigger.current = event.currentTarget;
                setSelectedId('moon');
                setPanel('objects');
              }}
            >
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
          <section className="focus-summary" aria-label="Selected object">
            <div>
              <strong>{focused.name}</strong>
              <span>{focusedVisibility.label}</span>
              <button
                className="icon-button"
                aria-label="Clear object selection"
                onClick={() => {
                  setFocusedId(null);
                  objectsTrigger.current?.focus();
                }}
              >
                <X size={16} />
              </button>
            </div>
            <p>{focusedVisibility.detail}</p>
            <div className="focus-actions">
              <button onClick={() => focusObject(focused)}>Recenter</button>
              {(clearSky || ['cloud', 'haze', 'partial-cloud'].includes(focusedVisibility.reason)) && (
                <button onClick={() => setClearSky((value) => !value)}>
                  {clearSky ? 'Restore atmosphere' : 'Preview a clear sky'}
                </button>
              )}
              {focusedVisibility.reason === 'layer' && (
                <button
                  onClick={() => changePreferences((p) => ({ ...p, layers: { ...p.layers, stars: true } }))}
                >
                  Enable stars
                </button>
              )}
              {focusedVisibility.reason === 'horizon' && focused.kind !== 'star' && (
                <button onClick={() => jumpToRise(focused.kind as 'sun' | 'moon')}>Jump to next rise</button>
              )}
            </div>
          </section>
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
                  onSelect={setSelectedId}
                  onFocus={focusObject}
                  onRise={jumpToRise}
                  onClearSky={() => setClearSky((value) => !value)}
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
                    onMode={mode}
                    onField={field}
                    onRefresh={refresh}
                  />
                </>
              )}
              {panel === 'settings' && (
                <>
                  <p className="panel-intro">A clear view, with just the details you want.</p>
                  <div className="setting-group">
                    <h3>Sky layers</h3>
                    {(['stars', 'lines', 'labels'] as const).map((key) => (
                      <button
                        className="setting-toggle"
                        key={key}
                        aria-pressed={layers[key]}
                        onClick={() =>
                          changePreferences((p) => ({ ...p, layers: { ...p.layers, [key]: !p.layers[key] } }))
                        }
                      >
                        <span>
                          {key === 'stars'
                            ? 'Stars'
                            : key === 'lines'
                              ? 'Constellation lines'
                              : 'Object labels'}
                        </span>
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
                      onClick={() => changePreferences((p) => ({ ...p, reducedMotion: !p.reducedMotion }))}
                    >
                      <span>Reduce atmosphere motion</span>
                      <span className="switch" />
                    </button>
                    {systemMotion && (
                      <p className="muted">Following your system’s reduced-motion preference.</p>
                    )}
                    <label className="quality-setting">
                      Rendering quality
                      <select
                        value={preferences.quality}
                        onChange={(e) =>
                          changePreferences((p) => ({
                            ...p,
                            quality: e.target.value as Preferences['quality'],
                          }))
                        }
                      >
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
                      <select
                        value={preferences.skyBrightness}
                        onChange={(e) =>
                          changePreferences((p) => ({
                            ...p,
                            skyBrightness: e.target.value as Preferences['skyBrightness'],
                          }))
                        }
                      >
                        <option value="dark">Dark sky</option>
                        <option value="suburban">Suburban sky</option>
                        <option value="city">City sky</option>
                      </select>
                    </label>
                    <label className="quality-setting">
                      Horizon
                      <select
                        value={preferences.horizon}
                        onChange={(e) =>
                          changePreferences((p) => ({
                            ...p,
                            horizon: e.target.value as Preferences['horizon'],
                          }))
                        }
                      >
                        <option value="flat">Unobstructed</option>
                        <option value="ridge">Illustrative ridge</option>
                      </select>
                    </label>
                    <p className="muted">
                      Appearance settings are illustrative. They do not measure local light pollution or
                      terrain. Patterns include the Big Dipper and Summer Triangle asterisms.
                    </p>
                  </div>
                  <div className="setting-group">
                    <h3>Your places</h3>
                    <button className="secondary-button full" onClick={() => saveLocation(location)}>
                      <Bookmark size={16} />
                      {preferences.saved.some((p) => p.id === location.id)
                        ? 'Remove saved place'
                        : 'Save this place'}
                    </button>
                  </div>
                  <div className="about-note">
                    <HelpCircle size={19} />
                    <div>
                      <h3>A calculated sky</h3>
                      <p>
                        Positions use Astronomy Engine. The landscape and clouds are illustrative; local
                        obstructions and actual cloud shapes can differ. Explore dates from 1900 through 2100.
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
              )}
            </div>
          </section>
        )}
      </section>
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
      <dialog ref={shareDialog} className="share-dialog" aria-labelledby="share-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Keep a moment</p>
            <h2 id="share-title">Share this sky</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close sharing"
            onClick={() => shareDialog.current?.close()}
          >
            <X />
          </button>
        </div>
        <p>
          This link includes the place, exact time, camera view, layers{custom ? ', and custom weather' : ''}.
        </p>
        {location.id === 'device-location' && (
          <p className="privacy-note">
            It includes your exact device coordinates: {location.latitude.toFixed(5)},{' '}
            {location.longitude.toFixed(5)}. Share only if you want the recipient to see this location.
          </p>
        )}
        <label className="share-field">
          Sky link
          <input ref={shareInput} readOnly value={shareLink} onFocus={(e) => e.target.select()} />
        </label>
        <button className="primary-button full" onClick={copy}>
          {copied ? <Check size={17} /> : <Share2 size={17} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </dialog>
    </main>
  );
}
