import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Crosshair, Moon, Star, Sun } from 'lucide-react';
import type { SkyState, WeatherValues } from '../types';
import type { Preferences } from '../lib/persistence';
import { aboveHorizon, objectVisibility, skyObjects, type SkyObject } from '../lib/exploration';
import { formatTime } from '../domain/time';
import MoonPhase from './MoonPhase';

export default function ObjectPanel({
  sky,
  timeZone,
  selectedId,
  preferences,
  weather,
  clearSky,
  onSelect,
  onFocus,
  onRise,
  onClearSky,
}: {
  sky: SkyState;
  timeZone: string;
  selectedId: string | null;
  preferences: Preferences;
  weather: WeatherValues;
  clearSky: boolean;
  onSelect: (id: string | null) => void;
  onFocus: (object: SkyObject) => void;
  onRise: (id: 'sun' | 'moon') => void;
  onClearSky: () => void;
}) {
  const [query, setQuery] = useState('');
  const [upOnly, setUpOnly] = useState(true);
  // Announced only when the reader changes the search or filter. Playback changes the count as stars
  // rise and set; a live region bound to it would interrupt the reader on every tick.
  const [announcement, setAnnouncement] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const previousSelection = useRef(selectedId);
  const objects = useMemo(() => skyObjects(sky), [sky]);
  const selected = objects.find((object) => object.id === selectedId);
  useEffect(() => {
    if (selectedId) heading.current?.focus({ preventScroll: true });
    else if (previousSelection.current) search.current?.focus({ preventScroll: true });
    const content = (heading.current ?? search.current)?.closest('.inspector-content');
    if (content) content.scrollTop = 0;
    previousSelection.current = selectedId;
    // The list's status region remounts on return; a stale count there must not be re-announced.
    setAnnouncement('');
  }, [selectedId]);

  if (selected) {
    const visibility = objectVisibility(selected, sky, weather, preferences);
    const isMoon = selected.kind === 'moon',
      isSun = selected.kind === 'sun';
    return (
      <div className="object-detail">
        <button className="back-button" onClick={() => onSelect(null)}>
          <ArrowLeft size={16} /> All objects
        </button>
        <div className="object-detail-heading">
          {isMoon ? (
            <MoonPhase
              illumination={sky.moon.illumination}
              angle={sky.moon.brightLimbAngle}
              label={sky.moon.phaseName}
            />
          ) : isSun ? (
            <Sun size={32} className="gold" />
          ) : (
            <Star size={30} />
          )}
          <div>
            <p className="eyebrow">{selected.kind === 'star' ? 'Star' : 'Solar system'}</p>
            <h3 ref={heading} tabIndex={-1}>
              {selected.name}
            </h3>
          </div>
        </div>
        <p className="visibility-label">{visibility.label}</p>
        <p className="visibility-explanation">{visibility.detail}</p>
        {aboveHorizon(selected) ? (
          <button className="primary-button full" onClick={() => onFocus(selected)}>
            <Crosshair size={16} /> Center in view
          </button>
        ) : selected.kind !== 'star' ? (
          <button className="primary-button full" onClick={() => onRise(selected.kind as 'sun' | 'moon')}>
            Jump to next rise
          </button>
        ) : (
          <p className="muted">Use the timeline to explore when this star is above the horizon.</p>
        )}
        {(clearSky || ['cloud', 'haze', 'partial-cloud'].includes(visibility.reason)) && (
          <button className="text-button" onClick={onClearSky}>
            {clearSky ? 'Restore atmosphere' : 'Preview a clear sky'}
          </button>
        )}
        <div className="coordinate-grid">
          <div>
            <strong>{selected.altitude.toFixed(1)}°</strong>
            <span>Altitude</span>
          </div>
          <div>
            <strong>{selected.azimuth.toFixed(1)}°</strong>
            <span>Azimuth</span>
          </div>
        </div>
        {isMoon && (
          <p>
            {sky.moon.phaseName} · {Math.round(sky.moon.illumination * 100)}% illuminated
          </p>
        )}
        {(isSun || isMoon) && (
          <dl className="event-list">
            <div>
              <dt>Rises today</dt>
              <dd>
                {formatEvent(isSun ? sky.events.sunrise : sky.events.moonrise, timeZone, 'No rise today')}
              </dd>
            </div>
            <div>
              <dt>Sets today</dt>
              <dd>{formatEvent(isSun ? sky.events.sunset : sky.events.moonset, timeZone, 'No set today')}</dd>
            </div>
            {isSun && (
              <>
                <div>
                  <dt>Solar noon</dt>
                  <dd>{formatEvent(sky.events.solarNoon, timeZone, 'No transit today')}</dd>
                </div>
                <div>
                  <dt>Daylight</dt>
                  <dd>{sky.events.daylightHours?.toFixed(1)} hours</dd>
                </div>
              </>
            )}
          </dl>
        )}
        {isSun && sky.events.daylightStatus !== 'normal' && (
          <p className="muted">
            {sky.events.daylightStatus === 'polar-day'
              ? 'The Sun stays above the horizon today.'
              : sky.events.daylightStatus === 'polar-night'
                ? 'The Sun stays below the horizon today.'
                : 'Today begins or ends during daylight.'}
          </p>
        )}
        <details className="object-facts">
          <summary>About this object & coordinates</summary>
          <p>
            Altitude is height above the mathematical horizon. Azimuth is the direction clockwise from north:
            east is 90°, south 180°, west 270°.
          </p>
          {isMoon && (
            <p>
              The Moon reflects sunlight. Its phase depends on which part of the sunlit half we see. It is
              approximately {(Math.round(sky.moon.distanceKm / 100) * 100).toLocaleString()} km from this
              observer.
            </p>
          )}
          {selected.kind === 'star' && (
            <p>
              Magnitude {selected.magnitude.toFixed(2)} (smaller numbers are brighter). Catalog coordinates:
              J2000 RA {selected.ra.toFixed(3)}h, Dec {selected.dec.toFixed(2)}°.
            </p>
          )}
        </details>
      </div>
    );
  }
  const term = query.trim().toLowerCase();
  const matches = matchObjects(objects, term, upOnly);
  const filter = (nextQuery: string, nextUpOnly: boolean) => {
    setQuery(nextQuery);
    setUpOnly(nextUpOnly);
    setAnnouncement(countLabel(matchObjects(objects, nextQuery.trim().toLowerCase(), nextUpOnly).length));
  };
  return (
    <>
      <label className="object-search">
        <span>Find an object</span>
        <input
          ref={search}
          type="search"
          value={query}
          onChange={(event) => filter(event.target.value, upOnly)}
          placeholder="Sun, Moon, or star name"
        />
      </label>
      <div className="segmented object-filters">
        <button aria-pressed={upOnly && !term} onClick={() => filter('', true)}>
          Above horizon
        </button>
        <button aria-pressed={!upOnly && !term} onClick={() => filter('', false)}>
          All objects
        </button>
      </div>
      <p className="catalog-note">
        {term
          ? 'Search includes objects below the horizon.'
          : upOnly
            ? 'Calculated positions above the horizon, brightest stars first.'
            : 'Explore the Sun, Moon, and stars, including those below the horizon.'}
      </p>
      {(clearSky || weather.cloudCover >= 85) && (
        <div className="catalog-weather">
          <span>{clearSky ? 'Clear-sky preview is active.' : 'Heavy clouds may obscure this view.'}</span>
          <button onClick={onClearSky}>{clearSky ? 'Restore atmosphere' : 'Preview a clear sky'}</button>
        </div>
      )}
      <div className="object-list" role="group" aria-label="Celestial objects">
        {matches.slice(0, 40).map((object) => (
          <button key={object.id} onClick={() => onSelect(object.id)}>
            {object.kind === 'sun' ? (
              <Sun size={18} />
            ) : object.kind === 'moon' ? (
              <Moon size={18} />
            ) : (
              <Star size={16} />
            )}
            <span>
              {object.name}
              <small>
                {object.kind === 'moon'
                  ? sky.moon.phaseName
                  : object.kind === 'sun'
                    ? 'Our nearest star'
                    : objectVisibility(object, sky, weather, preferences).label}
              </small>
            </span>
            <b>{aboveHorizon(object) ? `${Math.round(object.altitude)}°` : 'Below'}</b>
          </button>
        ))}
      </div>
      <p className="catalog-note">{countLabel(matches.length)}</p>
      <p className="sr-only" role="status">
        {announcement}
      </p>
    </>
  );
}
function matchObjects(objects: SkyObject[], term: string, upOnly: boolean): SkyObject[] {
  return objects.filter((object) =>
    term
      ? object.name.toLowerCase().includes(term) || object.id.toLowerCase().includes(term)
      : !upOnly || aboveHorizon(object),
  );
}
function countLabel(count: number): string {
  return count > 40
    ? `Showing 40 of ${count}. Search by name or HYG ID for more.`
    : `${count} matching ${count === 1 ? 'object' : 'objects'}.`;
}
function formatEvent(date: Date | null, zone: string, absent: string): string {
  return date ? formatTime(date, zone) : absent;
}
