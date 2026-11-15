import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Crosshair, Moon, Orbit, Star, Sun } from 'lucide-react';
import type { BodyId, Planet, SkyState, WeatherValues } from '../types';
import type { Preferences } from '../lib/persistence';
import {
  aboveHorizon,
  angularDiameter,
  objectVisibility,
  skyObjects,
  type SkyObject,
} from '../lib/exploration';
import { useI18n, type I18n } from '../i18n';
import type { PlanetShape } from '../i18n/en';
import { objectName, objectNameLang, searchNames } from '../i18n/names';
import MoonPhase from './MoonPhase';

/** At most this many objects are listed; search finds the rest. */
const LIST_LIMIT = 40;

export default function ObjectPanel({
  sky,
  timeZone,
  selectedId,
  preferences,
  weather,
  clearSky,
  stars = 'ready',
  onSelect,
  onFocus,
  onRise,
  onClearSky,
  onRetryStars,
}: {
  sky: SkyState;
  timeZone: string;
  selectedId: string | null;
  preferences: Preferences;
  weather: WeatherValues;
  clearSky: boolean;
  /** The star catalog loads after the first screen. */
  stars?: 'loading' | 'ready' | 'error';
  onSelect: (id: string | null) => void;
  onFocus: (object: SkyObject) => void;
  onRise: (id: BodyId) => void;
  onClearSky: () => void;
  onRetryStars?: () => void;
}) {
  const i18n = useI18n();
  const { m } = i18n;
  const [query, setQuery] = useState('');
  const [upOnly, setUpOnly] = useState(true);
  // Announced only when the reader changes the search or filter. Playback changes the count as stars
  // rise and set; a live region bound to it would interrupt the reader on every tick.
  // The count, not its sentence, so the announcement is worded in the current language.
  const [announcement, setAnnouncement] = useState<number | null>(null);
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
    setAnnouncement(null);
  }, [selectedId]);

  const name = (object: SkyObject) => objectName(object, i18n);
  const moonPhase = m.phases[sky.moon.phase];
  if (selected) {
    const visibility = objectVisibility(selected, sky, weather, preferences);
    const text = m.visibility(visibility, name(selected));
    const phase = planetPhase(selected);
    const formatEvent = (date: Date | null, absent: string) => (date ? m.f.time(date, timeZone) : absent);
    const isMoon = selected.kind === 'moon',
      isSun = selected.kind === 'sun',
      planet = selected.kind === 'planet' ? selected : undefined;
    const riseSet = isSun
      ? { rise: sky.events.sunrise, set: sky.events.sunset }
      : isMoon
        ? { rise: sky.events.moonrise, set: sky.events.moonset }
        : planet && sky.events.planets[planet.id];
    return (
      <div className="object-detail">
        <button className="back-button" onClick={() => onSelect(null)}>
          <ArrowLeft size={16} /> {m.objects.back}
        </button>
        <div className="object-detail-heading">
          {isMoon ? (
            <MoonPhase
              illumination={sky.moon.illumination}
              angle={sky.moon.brightLimbAngle}
              label={moonPhase}
            />
          ) : isSun ? (
            <Sun size={32} className="gold" />
          ) : planet && phase ? (
            <MoonPhase
              illumination={planet.illumination}
              angle={planet.brightLimbAngle}
              label={m.objects.planetPhaseLabel({ name: name(planet), ...phase })}
            />
          ) : planet ? (
            <Orbit size={30} />
          ) : (
            <Star size={30} />
          )}
          <div>
            <p className="eyebrow">
              {selected.kind === 'star'
                ? m.objects.kind.star
                : planet
                  ? m.objects.kind.planet
                  : m.objects.kind.solar}
            </p>
            <h3 ref={heading} tabIndex={-1} lang={objectNameLang(selected, i18n)}>
              {name(selected)}
            </h3>
          </div>
        </div>
        <p className="visibility-label">{text.label}</p>
        <p className="visibility-explanation">{text.detail}</p>
        {aboveHorizon(selected) ? (
          <button className="primary-button full" onClick={() => onFocus(selected)}>
            <Crosshair size={16} /> {m.objects.center}
          </button>
        ) : selected.kind !== 'star' ? (
          <button className="primary-button full" onClick={() => onRise(selected.id)}>
            {m.focus.jumpToRise}
          </button>
        ) : (
          <p className="muted">{m.objects.starTimeline}</p>
        )}
        {(clearSky || ['cloud', 'haze', 'partial-cloud'].includes(visibility.reason)) && (
          <button className="text-button" onClick={onClearSky}>
            {clearSky ? m.atmosphere.restore : m.atmosphere.previewClear}
          </button>
        )}
        <div className="coordinate-grid">
          <div>
            <strong>{m.f.number(selected.altitude, 1)}°</strong>
            <span>{m.objects.altitude}</span>
          </div>
          <div>
            <strong>{m.f.number(selected.azimuth, 1)}°</strong>
            <span>{m.objects.azimuth}</span>
          </div>
        </div>
        {isMoon && (
          <p>{m.objects.moonPhase({ phase: moonPhase, illumination: sky.moon.illumination * 100 })}</p>
        )}
        {planet && (
          <p>
            {m.objects.planetBrightness({ magnitude: planet.magnitude, phase })}
            <br />
            {m.objects.apparition({
              apparition: planet.elongation > 165 ? 'opposition' : planet.apparition,
              elongation: planet.elongation,
            })}
          </p>
        )}
        {riseSet && (
          <dl className="event-list">
            <div>
              <dt>{m.objects.rises}</dt>
              <dd>{formatEvent(riseSet.rise, m.objects.noRise)}</dd>
            </div>
            <div>
              <dt>{m.objects.sets}</dt>
              <dd>{formatEvent(riseSet.set, m.objects.noSet)}</dd>
            </div>
            {isSun && (
              <>
                <div>
                  <dt>{m.objects.solarNoon}</dt>
                  <dd>{formatEvent(sky.events.solarNoon, m.objects.noTransit)}</dd>
                </div>
                <div>
                  <dt>{m.objects.daylight}</dt>
                  <dd>
                    {sky.events.daylightHours !== null &&
                      m.objects.daylightHours({ hours: sky.events.daylightHours })}
                  </dd>
                </div>
              </>
            )}
          </dl>
        )}
        {isSun && sky.events.daylightStatus !== 'normal' && (
          <p className="muted">
            {sky.events.daylightStatus === 'polar-day'
              ? m.objects.polarDay
              : sky.events.daylightStatus === 'polar-night'
                ? m.objects.polarNight
                : m.objects.partialDay}
          </p>
        )}
        <details className="object-facts">
          <summary>{m.objects.facts}</summary>
          <p>{m.objects.coordinatesExplained}</p>
          {isMoon && (
            <p>{m.objects.moonFacts({ distanceKm: Math.round(sky.moon.distanceKm / 100) * 100 })}</p>
          )}
          {planet && (
            <p>
              {m.objects.planetFacts({
                name: name(planet),
                distanceKm: planet.distanceKm,
                distanceAu: planet.distanceKm / AU_KM,
                diameterArcsec: angularDiameter(planet) * 3600,
                phase,
              })}
            </p>
          )}
          {selected.kind === 'star' && (
            <p>
              {m.objects.starFacts({ magnitude: selected.magnitude, ra: selected.ra, dec: selected.dec })}
            </p>
          )}
        </details>
      </div>
    );
  }
  const term = query.trim().toLowerCase();
  const matches = matchObjects(objects, term, upOnly, i18n);
  const count = (total: number) => m.objects.count({ count: total, shown: LIST_LIMIT });
  const filter = (nextQuery: string, nextUpOnly: boolean) => {
    setQuery(nextQuery);
    setUpOnly(nextUpOnly);
    setAnnouncement(matchObjects(objects, nextQuery.trim().toLowerCase(), nextUpOnly, i18n).length);
  };
  return (
    <>
      <label className="object-search">
        <span>{m.objects.find}</span>
        <input
          ref={search}
          type="search"
          value={query}
          onChange={(event) => filter(event.target.value, upOnly)}
          placeholder={m.objects.searchPlaceholder}
        />
      </label>
      <div className="segmented object-filters">
        <button aria-pressed={upOnly && !term} onClick={() => filter('', true)}>
          {m.objects.aboveHorizon}
        </button>
        <button aria-pressed={!upOnly && !term} onClick={() => filter('', false)}>
          {m.objects.all}
        </button>
      </div>
      <p className="catalog-note">
        {term ? m.objects.noteSearch : upOnly ? m.objects.noteUp : m.objects.noteAll}
      </p>
      {(clearSky || weather.cloudCover >= 85) && (
        <div className="catalog-weather">
          <span>{clearSky ? m.objects.clearPreviewActive : m.objects.heavyClouds}</span>
          <button onClick={onClearSky}>{clearSky ? m.atmosphere.restore : m.atmosphere.previewClear}</button>
        </div>
      )}
      <div className="object-list" role="group" aria-label={m.objects.list}>
        {matches.slice(0, LIST_LIMIT).map((object) => (
          <button key={object.id} onClick={() => onSelect(object.id)}>
            {object.kind === 'sun' ? (
              <Sun size={18} />
            ) : object.kind === 'moon' ? (
              <Moon size={18} />
            ) : object.kind === 'planet' ? (
              <Orbit size={17} />
            ) : (
              <Star size={16} />
            )}
            <span>
              <span lang={objectNameLang(object, i18n)}>{name(object)}</span>
              <small>
                {object.kind === 'moon'
                  ? moonPhase
                  : object.kind === 'sun'
                    ? m.objects.nearestStar
                    : m.visibility(objectVisibility(object, sky, weather, preferences), name(object)).label}
              </small>
            </span>
            <b>{aboveHorizon(object) ? `${m.f.number(object.altitude)}°` : m.objects.below}</b>
          </button>
        ))}
      </div>
      <p className="catalog-note">{count(matches.length)}</p>
      {stars === 'loading' && <p className="catalog-note">{m.objects.starsLoading}</p>}
      {stars === 'error' && (
        <div className="catalog-weather">
          <span>{m.objects.starsFailed}</span>
          <button onClick={onRetryStars}>{m.objects.tryAgain}</button>
        </div>
      )}
      <p className="sr-only" role="status">
        {announcement !== null && count(announcement)}
      </p>
    </>
  );
}
const AU_KM = 149_597_870.7;

/** Matches a search in any of an object's names, so 天狼 and Sirius find the same star. */
function matchObjects(objects: SkyObject[], term: string, upOnly: boolean, i18n: I18n): SkyObject[] {
  // A word for "planets" (in this language or English) lists all five, from its first three letters
  // ("pla") or its whole length if shorter ("行星").
  const planets = i18n.m.objects.planetSearchWords.some(
    (word) => term.length >= Math.min(3, word.length) && word.startsWith(term),
  );
  return objects.filter((object) =>
    term
      ? searchNames(object, i18n).some((name) => name.toLowerCase().includes(term)) ||
        (object.kind === 'planet' && planets)
      : !upOnly || aboveHorizon(object),
  );
}
/** Mercury and Venus, inside Earth's orbit, show the full range of phases. */
function showsPhase(planet: Planet): boolean {
  return planet.id === 'mercury' || planet.id === 'venus';
}
/** The phase details shown for Mercury and Venus; undefined for other objects. */
function planetPhase(object: SkyObject): { shape: PlanetShape; illumination: number } | undefined {
  if (object.kind !== 'planet' || !showsPhase(object)) return undefined;
  return { shape: phaseShape(object.illumination), illumination: object.illumination * 100 };
}
function phaseShape(illumination: number): PlanetShape {
  if (illumination < 0.05) return 'thin-crescent';
  if (illumination < 0.45) return 'crescent';
  if (illumination < 0.55) return 'half';
  if (illumination < 0.97) return 'gibbous';
  return 'full';
}
