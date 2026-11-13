import { Cloud, Eye, RotateCcw, Thermometer, Wind } from 'lucide-react';
import type { WeatherSelection, WeatherValues } from '../types';
import { formatDate, formatTime } from '../lib/time';
import { weatherDescription, weatherSourceLabel } from '../lib/weather';

const metric = (value: number | null | undefined, digits = 0) => value === null || value === undefined ? '—' : value.toFixed(digits);
export default function WeatherPanel({ selection, custom, values, timeZone, onMode, onField, onRefresh }: {
  selection: WeatherSelection; custom: boolean; values: WeatherValues; timeZone: string;
  onMode: (custom: boolean) => void; onField: (field: keyof WeatherValues, value: number) => void; onRefresh: () => void;
}) {
  const source = custom ? values : selection.values;
  return <>
    <p className="panel-intro">See the atmosphere as modeled, or create a sky of your own.</p>
    <div className="segmented"><button aria-pressed={!custom} onClick={() => onMode(false)}>Weather data</button><button aria-pressed={custom} onClick={() => onMode(true)}>Custom simulation</button></div>
    <div className="source-detail"><span className={`status-dot ${custom || !source ? 'amber' : ''}`} />{custom ? 'Custom simulation' : weatherSourceLabel(selection)}</div>
    {!custom && selection.message && <p className="form-status" role="status">{selection.message}</p>}
    {!custom && selection.status === 'partial' && <p className="form-status">Some fields are unavailable. Missing fields use neutral atmosphere assumptions in the view.</p>}
    <div className="weather-grid">
      <div><Thermometer size={17} /><strong>{metric(source?.temperature)}<small>°C</small></strong><span>Temperature</span></div>
      <div><Wind size={17} /><strong>{metric(source?.windSpeed)}<small>km/h</small></strong><span>Wind</span></div>
      <div><Cloud size={17} /><strong>{metric(source?.cloudCover)}<small>%</small></strong><span>Cloud cover</span></div>
      <div><Eye size={17} /><strong>{metric(source?.visibilityKm)}<small>km</small></strong><span>Visibility</span></div>
    </div>
    {custom ? <div className="weather-sliders">
      <WeatherSlider label="Cloud cover" field="cloudCover" value={values.cloudCover} max={100} unit="%" onChange={onField} />
      <WeatherSlider label="Visibility" field="visibilityKm" value={values.visibilityKm} min={1} max={60} unit="km" onChange={onField} />
      <WeatherSlider label="Atmospheric haze" field="haze" value={values.haze} max={100} unit="%" onChange={onField} />
      <WeatherSlider label="Wind speed" field="windSpeed" value={values.windSpeed} max={80} unit="km/h" onChange={onField} />
      <WeatherSlider label="Wind direction" field="windDirection" value={values.windDirection} max={359} unit="°" onChange={onField} />
      <WeatherSlider label="Precipitation" field="precipitation" value={values.precipitation} max={20} step={.1} unit="mm/h" onChange={onField} />
      <WeatherSlider label="Temperature" field="temperature" value={values.temperature} min={-30} max={45} unit="°C" onChange={onField} />
    </div> : <button className="secondary-button full" onClick={onRefresh}><RotateCcw size={15} />Refresh weather</button>}
    <p className="weather-description">{weatherDescription(source?.weatherCode ?? null)}</p><p className="muted">{metric(source?.humidity)}% humidity · {metric(source?.pressure)} hPa</p>
    {!custom && selection.sampledAt !== undefined && <p className="muted">Sample {formatTime(new Date(selection.sampledAt), timeZone)} · fetched {formatDate(new Date(selection.fetchedAt!), timeZone)} at {formatTime(new Date(selection.fetchedAt!), timeZone)}. Weather is a model estimate; the cloud pattern is simulated.</p>}
    {custom && <button className="text-button" onClick={() => onMode(false)}>Return to weather data</button>}
  </>;
}
function WeatherSlider({ label, field, value, min = 0, max, step = 1, unit, onChange }: {
  label: string; field: keyof WeatherValues; value: number; min?: number; max: number; step?: number; unit: string; onChange: (field: keyof WeatherValues, value: number) => void;
}) {
  return <label className="weather-slider"><span>{label}<b>{metric(value, step < 1 ? 1 : 0)} {unit}</b></span><input aria-label={label} aria-valuetext={`${metric(value, step < 1 ? 1 : 0)} ${unit}`} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(field, Number(e.target.value))} /></label>;
}
