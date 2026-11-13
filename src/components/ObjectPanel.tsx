import { useState } from 'react';
import { Crosshair, Moon, Star, Sun } from 'lucide-react';
import type { SkyState } from '../types';
import { formatTime } from '../lib/time';
import MoonPhase from './MoonPhase';

export default function ObjectPanel({
  sky,
  timeZone,
  selectedId,
  onSelect,
  onFocus,
}: {
  sky: SkyState;
  timeZone: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onFocus: (altitude: number, azimuth: number) => void;
}) {
  const [query, setQuery] = useState('');
  const objects = [
    { id: 'sun', name: 'Sun', ...sky.sun },
    { id: 'moon', name: 'Moon', ...sky.moon },
    ...sky.stars.map((s) => ({ ...s, name: s.name || s.id.toUpperCase() })),
  ];
  const selected = objects.find((o) => o.id === selectedId) ?? objects[0];
  const matches = objects.filter(
    (o) =>
      o.name.toLowerCase().includes(query.toLowerCase()) || o.id.toLowerCase().includes(query.toLowerCase()),
  );
  const isSun = selected.id === 'sun',
    isMoon = selected.id === 'moon';
  return (
    <>
      <div className="object-detail">
        <div className="object-detail-heading">
          {isMoon ? (
            <MoonPhase
              illumination={sky.moon.illumination}
              angle={sky.moon.brightLimbAngle}
              label={sky.moon.phaseName}
            />
          ) : isSun ? (
            <Sun size={34} className="gold" />
          ) : (
            <Star size={30} />
          )}
          <div>
            <p className="eyebrow">{isSun || isMoon ? 'Solar system' : 'Star'}</p>
            <h3>{selected.name}</h3>
          </div>
        </div>
        <div className="object-status">
          {selected.altitude >= 0 ? 'Above the horizon' : 'Below the horizon'}
        </div>
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
          <>
            <p>
              {sky.moon.phaseName} · {Math.round(sky.moon.illumination * 100)}% illuminated
            </p>
            <p className="muted">
              Approximately {(Math.round(sky.moon.distanceKm / 100) * 100).toLocaleString()} km from the
              observer
            </p>
          </>
        )}
        {'magnitude' in selected && (
          <p className="muted">
            Magnitude {selected.magnitude.toFixed(2)} · J2000 RA {selected.ra.toFixed(3)}h · Dec{' '}
            {selected.dec.toFixed(2)}°
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
        <button
          className="primary-button full"
          disabled={selected.altitude < 0}
          onClick={() => onFocus(selected.altitude, selected.azimuth)}
        >
          <Crosshair size={16} />
          Center in view
        </button>
        {selected.altitude < 0 && (
          <p className="muted">Move through time to see this object above the horizon.</p>
        )}
      </div>
      <label className="object-search">
        <span>Find an object</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sun, Moon, or star name"
        />
      </label>
      <p className="muted" role="status">
        {matches.length > 60
          ? `Showing 60 of ${matches.length} objects. Search by name or HYG ID to find more.`
          : `${matches.length} matching objects.`}
      </p>
      <div className="object-list" role="group" aria-label="Celestial objects">
        {matches.slice(0, 60).map((object) => (
          <button
            key={object.id}
            className={object.id === selected.id ? 'active' : ''}
            onClick={() => onSelect(object.id)}
            aria-pressed={object.id === selected.id}
          >
            {object.id === 'sun' ? (
              <Sun size={16} />
            ) : object.id === 'moon' ? (
              <Moon size={16} />
            ) : (
              <Star size={15} />
            )}
            <span>{object.name}</span>
            <small>{object.altitude >= 0 ? `${Math.round(object.altitude)}° up` : 'below'}</small>
          </button>
        ))}
      </div>
    </>
  );
}
function formatEvent(date: Date | null, zone: string, absent: string): string {
  return date ? formatTime(date, zone) : absent;
}
