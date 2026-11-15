import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, ChevronDown, LocateFixed, MapPin, Search, X } from 'lucide-react';
import type { LocationInfo } from '../types';
import { normalizeLocation, PRESETS } from '../lib/locations';
import { searchLocations } from '../services/placeSearch';
import { classifyNetworkFailure } from '../lib/networkErrors';
import type { NetworkFailure } from '../types';

/** Kept as a code and worded at render, so a language change rewords an error already showing. */
type PlaceError =
  | { kind: 'search'; failure: NetworkFailure }
  | { kind: 'unavailable' | 'denied' | 'timedOut' | 'noTimeZone' };
import { useI18n } from '../i18n';
import { placeLabel } from '../i18n/names';

export default function LocationPicker({
  location,
  saved,
  recent,
  onSelect,
  onSave,
}: {
  location: LocationInfo;
  saved: LocationInfo[];
  recent: LocationInfo[];
  onSelect: (place: LocationInfo) => void;
  onSave: (place: LocationInfo) => void;
}) {
  const i18n = useI18n();
  const { m } = i18n;
  const t = m.location;
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const locationRequest = useRef(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlaceError | null>(null);
  const [active, setActive] = useState(-1);
  const [locating, setLocating] = useState(false);
  useEffect(
    () => () => {
      locationRequest.current += 1;
    },
    [],
  );
  const trimmed = query.trim();
  const options =
    trimmed.length >= 2
      ? results
      : [...new Map([...saved, ...recent, ...PRESETS].map((p) => [p.id, p])).values()];
  useEffect(() => {
    if (trimmed.length < 2) {
      setResults([]);
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setError(null);
    setResults([]);
    setActive(-1);
    const timer = setTimeout(() => {
      searchLocations(trimmed, t.searchLanguage, controller.signal)
        .then((items) => {
          if (!controller.signal.aborted) setResults(items);
        })
        .catch((reason) => {
          if (!controller.signal.aborted)
            setError({ kind: 'search', failure: classifyNetworkFailure(reason) });
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Results are named in the interface language, so a language change searches again.
  }, [trimmed, t.searchLanguage]);
  const cancelLocation = () => {
    locationRequest.current += 1;
    setLocating(false);
  };
  const close = () => {
    cancelLocation();
    dialog.current?.close();
    trigger.current?.focus();
  };
  const select = (place: LocationInfo) => {
    onSelect(place);
    close();
    setQuery('');
    setError(null);
    setActive(-1);
  };
  const locate = () => {
    if (!navigator.geolocation) {
      setError({ kind: 'unavailable' });
      return;
    }
    setLocating(true);
    setError(null);
    const request = ++locationRequest.current;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const { default: lookup } = await import('tz-lookup');
          if (request !== locationRequest.current) return;
          select(
            normalizeLocation({
              id: 'device-location',
              // Stored in English like other place data; the interface names it with placeLabel.
              name: 'Your location',
              country: 'Device coordinates · sea-level estimate',
              latitude: coords.latitude,
              longitude: coords.longitude,
              elevation: 0, // Geolocation altitude is ellipsoidal; the astronomy contract uses sea level.
              timezone: lookup(coords.latitude, coords.longitude),
            }),
          );
        } catch {
          if (request === locationRequest.current) setError({ kind: 'noTimeZone' });
        } finally {
          if (request === locationRequest.current) setLocating(false);
        }
      },
      (reason) => {
        if (request !== locationRequest.current) return;
        setLocating(false);
        setError({ kind: reason.code === 1 ? 'denied' : reason.code === 3 ? 'timedOut' : 'unavailable' });
      },
      { timeout: 10000, enableHighAccuracy: false },
    );
  };
  const current = placeLabel(location, i18n);
  return (
    <>
      <button
        ref={trigger}
        className="location-trigger"
        onClick={() => {
          dialog.current?.showModal();
          input.current?.focus();
        }}
        aria-haspopup="dialog"
        aria-label={t.trigger({ name: current.name })}
      >
        <MapPin size={18} />
        {/* Wide screens name the place in the sky title, so the trigger only offers the change. */}
        <span className="location-current">
          <strong>{current.name}</strong>
          <small>{current.country}</small>
        </span>
        <span className="location-change">{t.change}</span>
        <ChevronDown size={16} />
      </button>
      <dialog
        ref={dialog}
        className="place-dialog"
        aria-labelledby="place-title"
        onCancel={() => {
          cancelLocation();
          trigger.current?.focus();
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h2 id="place-title">{t.title}</h2>
          </div>
          <button className="icon-button" aria-label={t.close} onClick={close}>
            <X />
          </button>
        </div>
        <div className="place-search">
          <Search size={18} />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="place-options"
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `place-${active}` : undefined}
            aria-label={t.search}
            placeholder={t.placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const next = options.length
                  ? active < 0
                    ? event.key === 'ArrowDown'
                      ? 0
                      : options.length - 1
                    : (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
                  : -1;
                setActive(next);
                document.getElementById(`place-${next}`)?.scrollIntoView?.({ block: 'nearest' });
              }
              if (event.key === 'Enter' && active >= 0 && options[active]) {
                event.preventDefault();
                select(options[active]);
              }
            }}
          />
        </div>
        <div className="place-actions">
          <button onClick={locate} disabled={locating}>
            <LocateFixed size={16} />
            {locating ? t.locating : t.useMine}
          </button>
          <button onClick={() => onSave(location)}>
            <Bookmark size={16} />
            {saved.some((p) => p.id === location.id) ? t.removeSaved : t.saveCurrent}
          </button>
        </div>
        <p className="eyebrow">{trimmed.length >= 2 ? t.results : t.suggestions}</p>
        <div role="status" className="form-status">
          {(error && (error.kind === 'search' ? m.network(error.failure, 'search') : t[error.kind])) ||
            (busy ? t.searching : trimmed.length >= 2 && !options.length ? t.noMatches : '')}
        </div>
        <div id="place-options" role="listbox" aria-label={t.options} className="place-options">
          {options.map((place, index) => {
            const label = placeLabel(place, i18n);
            return (
              <button
                role="option"
                tabIndex={-1}
                aria-selected={active === index}
                id={`place-${index}`}
                key={place.id}
                onClick={() => select(place)}
                className={active === index ? 'active' : ''}
              >
                <MapPin size={17} />
                <span>
                  <strong>{label.name}</strong>
                  <small>{[label.country, m.f.zone(place.timezone)].filter(Boolean).join(' · ')}</small>
                </span>
                {place.id === location.id ? (
                  <Check size={16} />
                ) : saved.some((p) => p.id === place.id) ? (
                  <Bookmark size={14} />
                ) : null}
              </button>
            );
          })}
        </div>
      </dialog>
    </>
  );
}
