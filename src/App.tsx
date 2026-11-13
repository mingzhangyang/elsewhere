import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  CalendarDays, ChevronDown, Cloud, Compass, Crosshair,
  Eye, LocateFixed, MapPin, Moon, Pause, Play, RotateCcw, Search,
  Sparkles, Star, Sun, Sunrise, Sunset, Thermometer,
  Wind, X,
} from 'lucide-react';
import SkyScene from './components/SkyScene';
import type { LocationInfo, WeatherValues } from './types';
import { calculateDailyEvents, calculateSky } from './lib/astronomy';
import { civilDayStart, formatDate, formatOffset, formatTime, formatTimeZoneLabel, getZonedParts, localDayBounds, MAX_INSTANT, MIN_INSTANT, wallTimeCandidates } from './lib/time';
import { customConditions, defaultWeatherValues, fetchWeatherForDate, renderingWeather, searchLocations, weatherDescription, weatherSourceLabel } from './lib/weather';
import { useWeather } from './hooks/useWeather';
import MoonPhase from './components/MoonPhase';

const PRESETS: LocationInfo[] = [
  { id: 'new-york', name: 'New York', country: 'United States', latitude: 40.7128, longitude: -74.0060, elevation: 10, timezone: 'America/New_York' },
  { id: 'beijing', name: 'Beijing', country: 'China', latitude: 39.9042, longitude: 116.4074, elevation: 44, timezone: 'Asia/Shanghai' },
  { id: 'tokyo', name: 'Tokyo', country: 'Japan', latitude: 35.6762, longitude: 139.6503, elevation: 40, timezone: 'Asia/Tokyo' },
  { id: 'london', name: 'London', country: 'United Kingdom', latitude: 51.5072, longitude: -0.1276, elevation: 11, timezone: 'Europe/London' },
  { id: 'reykjavik', name: 'Reykjavík', country: 'Iceland', latitude: 64.1466, longitude: -21.9426, elevation: 61, timezone: 'Atlantic/Reykjavik' },
  { id: 'sydney', name: 'Sydney', country: 'Australia', latitude: -33.8688, longitude: 151.2093, elevation: 58, timezone: 'Australia/Sydney' },
  { id: 'cairo', name: 'Cairo', country: 'Egypt', latitude: 30.0444, longitude: 31.2357, elevation: 23, timezone: 'Africa/Cairo' },
  { id: 'antarctica', name: 'McMurdo Station', country: 'Antarctica', latitude: -77.8419, longitude: 166.6863, elevation: 24, timezone: 'Antarctica/McMurdo' },
];

const SPEEDS = [1, 10, 60, 600];
const directionLabel = (azimuth: number) => {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];
};
const deg = (value: number) => `${Math.round(value)}°`;
const num = (value: number, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';

export interface AppProps {
  initialLocation?: LocationInfo;
  initialTime?: Date;
  weatherLoader?: typeof fetchWeatherForDate;
}

export default function App({ initialLocation = PRESETS[0], initialTime, weatherLoader = fetchWeatherForDate }: AppProps) {
  const [location, setLocation] = useState<LocationInfo>(initialLocation);
  const [simTime, setSimTime] = useState(() => initialTime ?? new Date());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [customMode, setCustomMode] = useState(false);
  const [customWeather, setCustomWeather] = useState<WeatherValues>(defaultWeatherValues);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationInfo[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [showWeather, setShowWeather] = useState(false);
  const [showStars, setShowStars] = useState(true);
  const [showConstellations, setShowConstellations] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [heading, setHeading] = useState(0);
  const [selectedStarId, setSelectedStarId] = useState<string | null>(null);
  const [timeError, setTimeError] = useState('');
  const [timeChoices, setTimeChoices] = useState<Date[]>([]);
  const [locating, setLocating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastTick = useRef(0);
  const localParts = useMemo(() => getZonedParts(simTime, location.timezone), [simTime, location.timezone]);
  const eventDate = useMemo(() => civilDayStart(localParts.date, location.timezone), [localParts.date, location.timezone]);
  const events = useMemo(() => calculateDailyEvents(location, eventDate), [location, eventDate]);
  const sky = useMemo(() => calculateSky(location, simTime, events), [location, simTime, events]);
  const { selection, refresh: refreshWeather } = useWeather(location, simTime, weatherLoader);
  const actualWeather = useMemo(() => renderingWeather(selection), [selection]);
  const weather = customMode ? customWeather : actualWeather;
  const values = customMode ? customWeather : selection.values;
  const weatherIsActual = !customMode && selection.values !== null;
  const weatherLoading = selection.status === 'loading';
  const selectedStar = useMemo(() => sky.stars.find((star) => star.id === selectedStarId) ?? null, [sky, selectedStarId]);
  const dayBounds = useMemo(() => localDayBounds(eventDate, location.timezone), [eventDate, location.timezone]);

  useEffect(() => {
    if (!playing) return;
    lastTick.current = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastTick.current;
      lastTick.current = now;
      if (document.hidden) return;
      setSimTime((value) => new Date(Math.min(MAX_INSTANT, Math.max(MIN_INSTANT, value.getTime() + Math.min(1000, elapsed) * speed))));
    }, 200);
    const pauseHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pauseHidden);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', pauseHidden); };
  }, [playing, speed]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) { setSearchResults([]); setSearchError(''); setSearchLoading(false); return; }
    const controller = new AbortController();
    setSearchResults([]);
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      searchLocations(query, controller.signal)
        .then((items) => { if (!controller.signal.aborted) { setSearchResults(items); setSearchError(items.length ? '' : 'No matching places found.'); } })
        .catch((error: unknown) => { if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : 'Search failed.'); })
        .finally(() => { if (!controller.signal.aborted) setSearchLoading(false); });
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [searchQuery]);

  const chooseLocation = (next: LocationInfo) => {
    setLocation(next); setSelectedStarId(null); setSearchQuery(''); setSearchResults([]);
    setSearchOpen(false); setPlaying(false); setTimeError(''); setTimeChoices([]);
  };
  const editWallTime = (date: string, time: string) => {
    setPlaying(false); setTimeError(''); setTimeChoices([]);
    try {
      const candidates = wallTimeCandidates(date, time, location.timezone);
      if (!candidates.length) { setTimeError('That local time does not exist because the clock moves forward. Choose another time.'); return; }
      if (candidates.length === 2) { setTimeChoices(candidates); setTimeError('This local time occurs twice. Choose an offset.'); return; }
      setSimTime(candidates[0]);
    } catch (error) { setTimeError(error instanceof RangeError ? 'Choose a valid date between 1900 and 2100.' : 'Choose a valid date and time.'); }
  };
  const updateDate = (date: string) => editWallTime(date, localParts.time);
  const updateTime = (time: string) => editWallTime(localParts.date, time);
  const updateMinuteOfDay = (elapsedMinutes: number) => {
    setPlaying(false); setTimeError(''); setTimeChoices([]);
    setSimTime(new Date(Math.min(MAX_INSTANT, dayBounds.start.getTime() + elapsedMinutes * 60000)));
  };
  const useNow = () => { setSimTime(new Date()); setPlaying(false); setTimeError(''); setTimeChoices([]); };
  const useMyLocation = () => {
    setSearchOpen(true);
    if (!navigator.geolocation) { setSearchError('Location access is unavailable. Search for a place instead.'); return; }
    setLocating(true); setSearchError('');
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const { default: lookup } = await import('tz-lookup');
        chooseLocation({ id: 'device-location', name: 'Your location', country: 'Device coordinates',
          latitude: position.coords.latitude, longitude: position.coords.longitude,
          elevation: position.coords.altitude !== null && Number.isFinite(position.coords.altitude) ? Math.max(-500, Math.min(10000, position.coords.altitude)) : 0,
          timezone: lookup(position.coords.latitude, position.coords.longitude) });
      } catch { setSearchError('Could not determine the time zone. Search for a nearby place instead.'); }
      finally { setLocating(false); }
    }, (error) => { setLocating(false); setSearchError(error.code === 1 ? 'Location permission was denied. Search for a place instead.' : error.code === 3 ? 'Location lookup timed out. Try again or search for a place.' : 'Your location is unavailable. Search for a place instead.'); }, { enableHighAccuracy: false, timeout: 10000 });
  };
  const updateWeatherField = (field: keyof WeatherValues, value: number) => {
    setCustomWeather((current) => customConditions(customMode ? current : actualWeather, field, value));
    setCustomMode(true);
  };
  const activateCustomWeather = () => { if (!customMode) setCustomWeather(customConditions(actualWeather)); setCustomMode(true); };
  const resetWeather = () => setCustomMode(false);
  const dayMinute = Math.floor((simTime.getTime() - dayBounds.start.getTime()) / 60000);
  const localClock = localParts.time;
  const isToday = localParts.date === getZonedParts(new Date(), location.timezone).date;
  const sourceText = customMode ? 'Custom simulation' : weatherSourceLabel(selection);
  const metric = (value: number | null | undefined, digits = 0) => value === null || value === undefined ? '—' : num(value, digits);
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Compass size={20} strokeWidth={1.6} /></div>
          <div className="brand-name">elsewhere<span>.</span><small>THE SKY, FROM HERE</small></div>
        </div>

        <div className="search-wrap">
          <div className={`location-search ${searchOpen ? 'is-open' : ''}`}>
            <Search size={16} />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); }}
              placeholder="Find a place on Earth…"
              aria-label="Search for a location"
            />
            {searchQuery && <button className="icon-button tiny" onClick={() => setSearchQuery('')} aria-label="Clear search"><X size={14} /></button>}
            <button className="locate-button" onClick={useMyLocation} disabled={locating} aria-label="Use my location"><LocateFixed size={15} /><span>{locating ? 'Locating…' : 'My location'}</span></button>
          </div>
          {searchOpen && (
            <div className="search-results">
              {searchLoading && <div className="search-status">Searching the world…</div>}
              {(searchQuery.trim().length < 2 ? PRESETS : searchResults).map((item) => (
                <button className="search-result" key={item.id} onClick={() => chooseLocation(item)}>
                  <MapPin size={15} />
                  <span><b>{item.name}</b><small>{item.country} · {item.timezone}</small></span>
                  <small>{item.latitude.toFixed(2)}°, {item.longitude.toFixed(2)}°</small>
                </button>
              ))}
              {!!searchError && <div className="search-status">{searchError}</div>}
              <button className="search-dismiss" onClick={() => setSearchOpen(false)}>Close results</button>
            </div>
          )}
        </div>

        <div className="topbar-right">
          <div className="live-indicator"><span className="live-dot" /> SKY SIMULATOR</div>
          <button className="reset-view" onClick={() => window.dispatchEvent(new Event('sky-reset-view'))}><Crosshair size={15} /> Reset view</button>
        </div>
      </header>

      <section className="stage">
        <SkyScene
          sky={sky}
          weather={weather}
          showStars={showStars}
          showConstellations={showConstellations}
          showLabels={showLabels}
          onHeadingChange={setHeading}
          onStarSelect={(star) => setSelectedStarId(star?.id ?? null)}
        />
        <div className="stage-vignette" />

        <div className="location-float glass-panel">
          <div className="location-eyebrow"><MapPin size={12} /> YOU ARE STANDING IN</div>
          <div className="location-title">{location.name}</div>
          <div className="location-subtitle">{location.country || 'Selected coordinates'}</div>
          <div className="location-coords">{Math.abs(location.latitude).toFixed(4)}° {location.latitude >= 0 ? 'N' : 'S'} &nbsp; {Math.abs(location.longitude).toFixed(4)}° {location.longitude >= 0 ? 'E' : 'W'}</div>
          <div className="location-time"><span>{localClock}</span><small>{formatTimeZoneLabel(location.timezone, simTime)}</small></div>
          <div className="preset-row">
            {PRESETS.slice(0, 4).map((preset) => (
              <button key={preset.id} className={preset.id === location.id ? 'preset active' : 'preset'} onClick={() => chooseLocation(preset)}>{preset.name === 'Reykjavík' ? 'Reykjavik' : preset.name}</button>
            ))}
            <button className="preset-more" aria-label="More locations" onClick={() => { setSearchOpen(true); searchRef.current?.focus(); }}><ChevronDown size={13} /></button>
          </div>
        </div>

        <div className="heading-compass" aria-label={`Facing ${directionLabel(heading)}`}>
          <div className="compass-ring">
            <span className="compass-n">N</span><span className="compass-e">E</span><span className="compass-s">S</span><span className="compass-w">W</span>
            <div className="compass-needle" style={{ transform: `rotate(${heading}deg)` }}><div /></div>
          </div>
          <span className="heading-value">{directionLabel(heading)} · {Math.round(heading)}°</span>
        </div>

        <div className="scene-hint"><span className="mouse-glyph">⌖</span> DRAG TO LOOK AROUND <i /> SCROLL TO ZOOM <i /> TAP A STAR</div>

        {selectedStar && (
          <div className="selected-star glass-panel">
            <button className="icon-button" onClick={() => setSelectedStarId(null)} aria-label="Close star details"><X size={14} /></button>
            <div className="panel-kicker"><Star size={12} /> STAR IN VIEW</div>
            <strong>{selectedStar.name}</strong>
            <span>MAG {num(selectedStar.magnitude, 2)} · ALT {deg(selectedStar.altitude)} · AZ {deg(selectedStar.azimuth)}</span>
            <small>RA {num(selectedStar.ra, 3)}h · DEC {num(selectedStar.dec, 2)}°</small>
          </div>
        )}

        <aside className="celestial-panel glass-panel">
          <div className="panel-kicker"><Sparkles size={13} /> CELESTIAL POSITION</div>
          <div className="object-block sun-block">
            <div className="object-heading"><span className="object-icon sun-icon"><Sun size={17} /></span><span>THE SUN</span><b className={sky.sun.visible ? 'status-up' : 'status-down'}>{sky.sun.visible ? 'ABOVE HORIZON' : 'BELOW HORIZON'}</b></div>
            <div className="object-main">{sky.sun.visible ? `${deg(sky.sun.altitude)} altitude` : `${deg(Math.abs(sky.sun.altitude))} below horizon`}</div>
            <div className="object-coordinates">AZ {deg(sky.sun.azimuth)} · {directionLabel(sky.sun.azimuth)}</div>
            <div className="event-row"><span><Sunrise size={12} /> Sunrise</span><b>{sky.events.sunrise ? formatTime(sky.events.sunrise, location.timezone) : 'No rise today'}</b></div>
            <div className="event-row"><span><Sunset size={12} /> Sunset</span><b>{sky.events.sunset ? formatTime(sky.events.sunset, location.timezone) : 'No set today'}</b></div>
            <div className="event-row"><span><Sun size={12} /> Solar noon</span><b>{formatTime(sky.events.solarNoon, location.timezone)}</b></div>
            <div className="daylight-row"><span>DAYLIGHT</span><b>{sky.events.daylightHours === null ? '—' : `${num(sky.events.daylightHours, 1)} h`}</b></div>
          </div>
          <div className="panel-separator" />
          <div className="object-block moon-block">
            <div className="object-heading"><span className="object-icon moon-icon"><Moon size={17} /></span><span>THE MOON</span><b className={sky.moon.visible ? 'status-up' : 'status-down'}>{sky.moon.visible ? 'ABOVE HORIZON' : 'BELOW HORIZON'}</b></div>
            <div className="moon-summary"><MoonPhase illumination={sky.moon.illumination} angle={sky.moon.brightLimbAngle} label={sky.moon.phaseName} /><div><div className="object-main">{sky.moon.phaseName}</div><div className="object-coordinates">{Math.round(sky.moon.illumination * 100)}% ILLUMINATED</div></div></div>
            <div className="event-row"><span>Altitude / Azimuth</span><b>{deg(sky.moon.altitude)} / {deg(sky.moon.azimuth)}</b></div>
            <div className="event-row"><span>Moonrise</span><b>{sky.events.moonrise ? formatTime(sky.events.moonrise, location.timezone) : 'No rise today'}</b></div>
            <div className="event-row"><span>Moonset</span><b>{sky.events.moonset ? formatTime(sky.events.moonset, location.timezone) : 'No set today'}</b></div>
            <div className="event-row"><span>Distance</span><b>{Math.round(sky.moon.distanceKm).toLocaleString('en-US')} km</b></div>
          </div>
        </aside>

        <div className="layer-toolbar glass-panel">
          <div className="layer-heading"><LayersIcon /> SKY LAYERS</div>
          <button aria-pressed={showStars} className={showStars ? 'layer-toggle active' : 'layer-toggle'} onClick={() => setShowStars((v) => !v)}><Star size={14} /> Stars <span /></button>
          <button aria-pressed={showConstellations} className={showConstellations ? 'layer-toggle active' : 'layer-toggle'} onClick={() => setShowConstellations((v) => !v)}><Sparkles size={14} /> Lines <span /></button>
          <button aria-pressed={showLabels} className={showLabels ? 'layer-toggle active' : 'layer-toggle'} onClick={() => setShowLabels((v) => !v)}><Crosshair size={14} /> Labels <span /></button>
        </div>

        <button className={`weather-open glass-panel ${showWeather ? 'is-active' : ''}`} onClick={() => setShowWeather((value) => !value)}>
          <Cloud size={15} /><span>WEATHER & ATMOSPHERE</span><ChevronDown size={14} className={showWeather ? 'turned' : ''} />
        </button>

        {showWeather && (
          <aside className="weather-panel glass-panel">
            <div className="weather-panel-header">
              <div><div className="panel-kicker"><Cloud size={13} /> ATMOSPHERE CONTROL</div><h3>Weather & visibility</h3></div>
              <button className="icon-button" onClick={() => setShowWeather(false)} aria-label="Close weather panel"><X size={16} /></button>
            </div>
            <div className="weather-tabs">
              <button aria-pressed={!customMode} className={!customMode ? 'selected' : ''} onClick={resetWeather}>Weather data</button>
              <button aria-pressed={customMode} className={customMode ? 'selected' : ''} onClick={activateCustomWeather}>Custom simulation</button>
            </div>
            <div className="weather-source"><span className={weatherIsActual ? 'source-dot actual' : 'source-dot sim'} />{weatherLoading ? 'Updating weather…' : sourceText}</div>
            {!customMode && selection.message && <p className="weather-note" role="status">{selection.message}</p>}
            {!customMode && selection.status === 'partial' && <p className="weather-note">Some fields are unavailable. Missing atmosphere fields use neutral rendering assumptions.</p>}
            {!customMode && <button className="reset-weather" onClick={refreshWeather}>Refresh weather</button>}
            <div className="weather-current-grid">
              <div><Thermometer size={14} /><b>{metric(values?.temperature)}</b><small>TEMP °C</small></div>
              <div><Wind size={14} /><b>{metric(values?.windSpeed)}</b><small>WIND km/h</small></div>
              <div><Cloud size={14} /><b>{metric(values?.cloudCover)}</b><small>CLOUD %</small></div>
              <div><Eye size={14} /><b>{metric(values?.visibilityKm)}</b><small>VISIBILITY km</small></div>
            </div>
            {customMode && <>
            <WeatherSlider label="Cloud cover" value={weather.cloudCover} min={0} max={100} suffix="%" onChange={(value) => updateWeatherField('cloudCover', value)} />
            <WeatherSlider label="Visibility" value={weather.visibilityKm} min={1} max={60} suffix="km" onChange={(value) => updateWeatherField('visibilityKm', value)} />
            <WeatherSlider label="Atmospheric haze" value={weather.haze} min={0} max={100} suffix="%" onChange={(value) => updateWeatherField('haze', value)} />
            <WeatherSlider label="Wind speed" value={weather.windSpeed} min={0} max={80} suffix="km/h" onChange={(value) => updateWeatherField('windSpeed', value)} />
            <WeatherSlider label="Wind direction" value={weather.windDirection} min={0} max={359} suffix="°" onChange={(value) => updateWeatherField('windDirection', value)} />
            <WeatherSlider label="Precipitation" value={weather.precipitation} min={0} max={20} step={0.1} suffix="mm/h" onChange={(value) => updateWeatherField('precipitation', value)} />
            <WeatherSlider label="Temperature" value={weather.temperature} min={-30} max={45} suffix="°C" onChange={(value) => updateWeatherField('temperature', value)} />
            </>}
            <div className="weather-footnote"><span>{weatherDescription(values?.weatherCode ?? null)}</span><span>{metric(values?.humidity)}% humidity · {metric(values?.pressure)} hPa</span></div>
            {!customMode && selection.sampledAt !== undefined && <p className="weather-note">Sample {formatTime(new Date(selection.sampledAt), location.timezone)} · fetched {formatTime(new Date(selection.fetchedAt!), location.timezone)}</p>}
            {customMode && <button className="reset-weather" onClick={resetWeather}><RotateCcw size={13} /> Reset to actual weather</button>}
          </aside>
        )}

        <div className="time-console glass-panel">
          <div className="time-topline">
            <div className="time-label"><CalendarDays size={14} /><span>TIME JOURNEY</span><b>{formatDate(simTime, location.timezone)}</b></div>
            <div className="time-inputs">
              <label><span>DATE</span><input type="date" min="1900-01-01" max="2100-12-31" value={localParts.date} onChange={(event) => updateDate(event.target.value)} /></label>
              <label><span>LOCAL TIME</span><input type="time" value={localParts.time} onChange={(event) => updateTime(event.target.value)} /></label>
              <button className="now-button" onClick={useNow}>NOW</button>
            </div>
          </div>
          {timeError && <div className="time-error" role="alert">{timeError}{timeChoices.map((candidate) => <button key={candidate.getTime()} onClick={() => { setSimTime(candidate); setTimeError(''); setTimeChoices([]); }}>{formatTime(candidate, location.timezone)} {formatOffset(candidate, location.timezone)}</button>)}</div>}
          <div className="timeline-row">
            <div className="timeline-symbol"><Sunrise size={15} /></div>
            <div className="timeline-wrap">
              <input
                aria-label="Time of day"
                type="range"
                min={0}
                max={dayBounds.minutes - 1}
                step={1}
                value={dayMinute}
                aria-valuetext={`${localClock} ${formatOffset(simTime, location.timezone)}`}
                onChange={(event) => updateMinuteOfDay(Number(event.target.value))}
                className="time-range"
                style={{ '--range-progress': `${dayMinute / (dayBounds.minutes - 1) * 100}%` } as CSSProperties}
              />
              <div className="timeline-ticks">{[0, .25, .5, .75, 1].map((part) => <span key={part}>{formatTime(new Date(dayBounds.start.getTime() + part * (dayBounds.end.getTime() - dayBounds.start.getTime() - 60000)), location.timezone, { hour12: false })}</span>)}</div>
            </div>
            <div className="timeline-symbol sunset-symbol"><Sunset size={15} /></div>
            <div className="playback-controls">
              <button className="play-button" onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'Pause time' : 'Play time'}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
              <div className="speed-select"><select aria-label="Playback speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{SPEEDS.map((value) => <option key={value} value={value}>{value === 1 ? '1×' : `${value}×`}</option>)}</select><ChevronDown size={12} /></div>
            </div>
          </div>
          <div className="time-caption"><span>{isToday ? 'LOCAL TIME' : 'SIMULATED LOCAL TIME'} · {location.timezone}</span><span>{playing ? `TIME MOVING AT ${speed}×` : 'PAUSED IN TIME'}</span></div>
        </div>
      </section>

      <footer className="bottom-bar">
        <div className="footer-left"><span className="footer-dot" /> <b>EARTH, OBSERVED</b><i /> {location.latitude.toFixed(2)}°, {location.longitude.toFixed(2)}°</div>
        <div className="footer-center">{sourceText}{!customMode && !selection.values ? ' · neutral atmosphere' : ''}<i /> CLOUD <b>{metric(values?.cloudCover)}%</b></div>
        <div className="footer-right"><span>ASTRONOMY ENGINE</span><i /> <span>OPEN-METEO</span></div>
      </footer>
    </main>
  );
}

function LayersIcon() {
  return <span className="layers-mini"><span /><span /><span /></span>;
}

function WeatherSlider({
  label, value, min, max, step = 1, suffix, onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void;
}) {
  return (
    <label className="weather-slider">
      <span className="slider-label">{label}<b>{Number.isInteger(value) ? value : value.toFixed(1)} {suffix}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

