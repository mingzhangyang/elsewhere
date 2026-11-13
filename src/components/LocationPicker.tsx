import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, ChevronDown, LocateFixed, MapPin, Search, X } from 'lucide-react';
import type { LocationInfo } from '../types';
import { PRESETS } from '../lib/locations';
import { searchLocations } from '../lib/weather';

export default function LocationPicker({ location, saved, recent, onSelect, onSave }: {
  location: LocationInfo; saved: LocationInfo[]; recent: LocationInfo[];
  onSelect: (place: LocationInfo) => void; onSave: (place: LocationInfo) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const locationRequest = useRef(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(-1);
  const [locating, setLocating] = useState(false);
  const trimmed = query.trim();
  const options = trimmed.length >= 2 ? results : [...new Map([...saved, ...recent, ...PRESETS].map((p) => [p.id, p])).values()];
  useEffect(() => {
    if (trimmed.length < 2) { setResults([]); setBusy(false); return; }
    const controller = new AbortController();
    setBusy(true); setError(''); setResults([]); setActive(-1);
    const timer = setTimeout(() => {
      searchLocations(trimmed, controller.signal)
        .then((items) => { if (!controller.signal.aborted) setResults(items); })
        .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Search failed.'); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmed]);
  const cancelLocation = () => { locationRequest.current += 1; setLocating(false); };
  const close = () => { cancelLocation(); dialog.current?.close(); trigger.current?.focus(); };
  const select = (place: LocationInfo) => { onSelect(place); close(); setQuery(''); setError(''); setActive(-1); };
  const locate = () => {
    if (!navigator.geolocation) { setError('Location is unavailable. Search for a place instead.'); return; }
    setLocating(true); setError('');
    const request = ++locationRequest.current;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const { default: lookup } = await import('tz-lookup');
        if (request !== locationRequest.current) return;
        select({ id: 'device-location', name: 'Your location', country: 'Device coordinates', latitude: coords.latitude, longitude: coords.longitude,
          elevation: coords.altitude !== null && Number.isFinite(coords.altitude) ? Math.max(-500, Math.min(10000, coords.altitude)) : 0,
          timezone: lookup(coords.latitude, coords.longitude) });
      } catch { if (request === locationRequest.current) setError('Could not resolve the time zone. Search for a nearby place.'); }
      finally { if (request === locationRequest.current) setLocating(false); }
    }, (reason) => { if (request !== locationRequest.current) return; setLocating(false); setError(reason.code === 1 ? 'Location permission was denied. Search for a place instead.' : reason.code === 3 ? 'Location lookup timed out. Try again or search.' : 'Location is unavailable. Search for a place instead.'); }, { timeout: 10000, enableHighAccuracy: false });
  };
  return <>
    <button ref={trigger} className="location-trigger" onClick={() => { dialog.current?.showModal(); input.current?.focus(); }} aria-haspopup="dialog" aria-label={`Change location, ${location.name}`}>
      <MapPin size={18} /><span><strong>{location.name}</strong><small>{location.country}</small></span><ChevronDown size={16} />
    </button>
    <dialog ref={dialog} className="place-dialog" aria-labelledby="place-title" onCancel={() => { cancelLocation(); trigger.current?.focus(); }}>
      <div className="dialog-heading"><div><p className="eyebrow">A different perspective</p><h2 id="place-title">Choose your place</h2></div><button className="icon-button" aria-label="Close locations" onClick={close}><X /></button></div>
      <div className="place-search"><Search size={18} /><input ref={input} role="combobox" aria-expanded="true" aria-controls="place-options" aria-autocomplete="list" aria-activedescendant={active >= 0 ? `place-${active}` : undefined} aria-label="Search for a location" placeholder="City, town, or a place you love" value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(-1); }} onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = options.length ? (active < 0 ? event.key === 'ArrowDown' ? 0 : options.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length) : -1; setActive(next); document.getElementById(`place-${next}`)?.scrollIntoView?.({ block: 'nearest' }); }
          if (event.key === 'Enter' && active >= 0 && options[active]) { event.preventDefault(); select(options[active]); }
        }} /></div>
      <div className="place-actions"><button onClick={locate} disabled={locating}><LocateFixed size={16} />{locating ? 'Finding your location…' : 'Use my location'}</button><button onClick={() => onSave(location)}><Bookmark size={16} />{saved.some((p) => p.id === location.id) ? 'Remove saved place' : 'Save current place'}</button></div>
      <p className="eyebrow">{trimmed.length >= 2 ? 'Search results' : 'Saved, recent & suggested'}</p>
      <div role="status" className="form-status">{error || (busy ? 'Searching…' : trimmed.length >= 2 && !options.length ? 'No matching places. Try a nearby city.' : '')}</div>
      <div id="place-options" role="listbox" aria-label="Locations" className="place-options">
        {options.map((place, index) => <button role="option" aria-selected={active === index} id={`place-${index}`} key={place.id} onClick={() => select(place)} className={active === index ? 'active' : ''}>
          <MapPin size={17} /><span><strong>{place.name}</strong><small>{place.country} · {place.timezone.replaceAll('_', ' ')}</small></span>{place.id === location.id ? <Check size={16} /> : saved.some((p) => p.id === place.id) ? <Bookmark size={14} /> : null}
        </button>)}
      </div>
    </dialog>
  </>;
}
