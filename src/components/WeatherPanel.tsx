import { Cloud, Eye, RotateCcw, Thermometer, Wind } from 'lucide-react';
import type { WeatherSelection, WeatherValues } from '../types';
import { weatherDescription, weatherIssueText, weatherSourceLabel } from '../lib/weatherText';
import { useI18n } from '../i18n';

export default function WeatherPanel({
  selection,
  custom,
  values,
  timeZone,
  onMode,
  onField,
  onRefresh,
}: {
  selection: WeatherSelection;
  custom: boolean;
  values: WeatherValues;
  timeZone: string;
  onMode: (custom: boolean) => void;
  onField: (field: keyof WeatherValues, value: number) => void;
  onRefresh: () => void;
}) {
  const { m } = useI18n();
  const metric = (value: number | null | undefined, digits = 0) =>
    value === null || value === undefined ? '—' : m.f.number(value, digits, false);
  const w = m.weather;
  const source = custom ? values : selection.values;
  return (
    <>
      <div className="segmented">
        <button aria-pressed={!custom} onClick={() => onMode(false)}>
          {w.sourceData}
        </button>
        <button aria-pressed={custom} onClick={() => onMode(true)}>
          {m.atmosphere.custom}
        </button>
      </div>
      <div className="source-detail">
        <span className={`status-dot ${custom || !source ? 'amber' : ''}`} />
        {custom ? m.atmosphere.custom : weatherSourceLabel(selection, m)}
      </div>
      {!custom && selection.issue && (
        <p className="form-status" role="status">
          {weatherIssueText(selection.issue, m)}
        </p>
      )}
      {!custom && selection.status === 'partial' && <p className="form-status">{w.partial}</p>}
      <div className="weather-grid">
        <div>
          <Thermometer size={17} />
          <strong>
            {metric(source?.temperature)}
            <small>°C</small>
          </strong>
          <span>{w.temperature}</span>
        </div>
        <div>
          <Wind size={17} />
          <strong>
            {metric(source?.windSpeed)}
            <small>km/h</small>
          </strong>
          <span>{w.wind}</span>
        </div>
        <div>
          <Cloud size={17} />
          <strong>
            {metric(source?.cloudCover)}
            <small>%</small>
          </strong>
          <span>{w.cloudCover}</span>
        </div>
        <div>
          <Eye size={17} />
          <strong>
            {metric(source?.visibilityKm)}
            <small>km</small>
          </strong>
          <span>{w.visibility}</span>
        </div>
      </div>
      {custom ? (
        <div className="weather-sliders">
          <WeatherSlider
            label={w.cloudCover}
            field="cloudCover"
            value={values.cloudCover}
            max={100}
            unit="%"
            onChange={onField}
          />
          <WeatherSlider
            label={w.visibility}
            field="visibilityKm"
            value={values.visibilityKm}
            min={1}
            max={60}
            unit="km"
            onChange={onField}
          />
          <WeatherSlider
            label={w.haze}
            field="haze"
            value={values.haze}
            max={100}
            unit="%"
            onChange={onField}
          />
          <WeatherSlider
            label={w.windSpeed}
            field="windSpeed"
            value={values.windSpeed}
            max={80}
            unit="km/h"
            onChange={onField}
          />
          <WeatherSlider
            label={w.windDirection}
            field="windDirection"
            value={values.windDirection}
            max={359}
            unit="°"
            onChange={onField}
          />
          <WeatherSlider
            label={w.precipitation}
            field="precipitation"
            value={values.precipitation}
            max={20}
            step={0.1}
            unit="mm/h"
            onChange={onField}
          />
          <WeatherSlider
            label={w.temperature}
            field="temperature"
            value={values.temperature}
            min={-30}
            max={45}
            unit="°C"
            onChange={onField}
          />
        </div>
      ) : (
        <button className="secondary-button full" onClick={onRefresh}>
          <RotateCcw size={15} />
          {w.refresh}
        </button>
      )}
      <p className="weather-description">{weatherDescription(source?.weatherCode ?? null, m)}</p>
      <p className="muted">
        {w.humidityPressure({ humidity: metric(source?.humidity), pressure: metric(source?.pressure) })}
      </p>
      {!custom && selection.sampledAt !== undefined && (
        <p className="muted">
          {w.sample({
            sampled: m.f.time(new Date(selection.sampledAt), timeZone),
            fetchedDate: m.f.date(new Date(selection.fetchedAt!), timeZone),
            fetchedTime: m.f.time(new Date(selection.fetchedAt!), timeZone),
          })}
        </p>
      )}
      {custom && (
        <button className="text-button" onClick={() => onMode(false)}>
          {w.returnToData}
        </button>
      )}
    </>
  );
}
function WeatherSlider({
  label,
  field,
  value,
  min = 0,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  field: keyof WeatherValues;
  value: number;
  min?: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (field: keyof WeatherValues, value: number) => void;
}) {
  const { m } = useI18n();
  const shown = m.f.number(value, step < 1 ? 1 : 0, false);
  return (
    <label className="weather-slider">
      <span>
        {label}
        <b>
          {shown} {unit}
        </b>
      </span>
      <input
        aria-label={label}
        aria-valuetext={`${shown} ${unit}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(field, Number(e.target.value))}
      />
    </label>
  );
}
