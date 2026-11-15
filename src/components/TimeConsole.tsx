import { useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Pause, Play, Sunrise, Sunset, X } from 'lucide-react';
import {
  formatOffset,
  getZonedParts,
  MAX_INSTANT,
  MIN_INSTANT,
  shiftLocalDate,
  wallTimeCandidates,
} from '../domain/time';
import type { SkyEvents } from '../types';
import { useI18n } from '../i18n';

export default function TimeConsole({
  instant,
  timeZone,
  bounds,
  events,
  playing,
  following,
  speed,
  onTime,
  onPlaying,
  onSpeed,
  onNow,
}: {
  instant: Date;
  timeZone: string;
  bounds: { start: Date; end: Date; minutes: number };
  events: SkyEvents;
  playing: boolean;
  following: boolean;
  speed: number;
  onTime: (time: Date) => void;
  onPlaying: (playing: boolean) => void;
  onSpeed: (speed: number) => void;
  onNow: () => void;
}) {
  const { m } = useI18n();
  const t = m.time;
  const local = getZonedParts(instant, timeZone);
  const editor = useRef<HTMLDialogElement>(null);
  const editorTrigger = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<Date[]>([]);
  const status = following ? t.following : playing ? t.playing({ speed }) : t.paused;
  const shortDate = m.f.shortDate(instant, timeZone);
  const minute = Math.floor((instant.getTime() - bounds.start.getTime()) / 60000);
  const jump = (time: Date) => {
    onPlaying(false);
    setError('');
    setChoices([]);
    onTime(new Date(Math.max(MIN_INSTANT, Math.min(MAX_INSTANT, time.getTime()))));
  };
  const edit = (day: string, time: string) => {
    onPlaying(false);
    setError('');
    setChoices([]);
    try {
      const candidates = wallTimeCandidates(day, time, timeZone);
      if (!candidates.length) setError(t.gap);
      else if (candidates.length === 2) {
        setChoices(candidates);
        setError(t.fold);
      } else jump(candidates[0]);
    } catch {
      setError(t.invalidDate);
    }
  };
  const shift = (days: number) => {
    try {
      jump(shiftLocalDate(instant, timeZone, days));
    } catch {
      setError(t.outOfRange);
    }
  };
  return (
    <section className="time-console" aria-label={t.region}>
      <div className="time-topline">
        <button
          className="time-readout"
          ref={editorTrigger}
          aria-label={t.change}
          aria-describedby="selected-time"
          aria-expanded={editing}
          aria-haspopup="dialog"
          onClick={() => {
            onPlaying(false);
            setEditing(true);
            editor.current?.showModal();
          }}
        >
          <CalendarDays size={17} />
          <span>
            <strong id="selected-time">
              {shortDate} · {local.time}
            </strong>
            <small>
              {status} · {formatOffset(instant, timeZone)}
            </small>
          </span>
        </button>
        <button
          className="now-button"
          aria-pressed={following}
          onClick={() => {
            setError('');
            setChoices([]);
            onNow();
          }}
        >
          {t.now}
        </button>
        <button
          className="tonight-button"
          disabled={!events.twilightDusk}
          title={events.twilightDusk ? t.tonightTitle : t.noDusk}
          onClick={() => events.twilightDusk && jump(new Date(events.twilightDusk.getTime() + 3600000))}
        >
          {t.tonight}
        </button>
      </div>
      <dialog
        ref={editor}
        className="time-editor"
        aria-labelledby="time-editor-title"
        onClose={() => {
          setEditing(false);
          editorTrigger.current?.focus();
        }}
      >
        <div className="dialog-heading">
          <h2 id="time-editor-title">{t.editor}</h2>
          <button className="icon-button" aria-label={t.closeEditor} onClick={() => editor.current?.close()}>
            <X size={20} />
          </button>
        </div>
        <p className="time-zone-note">
          {m.f.zone(timeZone, instant)} · {formatOffset(instant, timeZone)}
        </p>
        <div className="day-navigation">
          <button className="icon-button" aria-label={t.previousDay} onClick={() => shift(-1)}>
            <ChevronLeft size={18} />
          </button>
          <span>{m.f.date(instant, timeZone)}</span>
          <button className="icon-button" aria-label={t.nextDay} onClick={() => shift(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="time-inputs">
          <label>
            <span>{t.date}</span>
            <input
              type="date"
              min="1900-01-01"
              max="2100-12-31"
              value={local.date}
              onChange={(e) => edit(e.target.value, local.time)}
            />
          </label>
          <label>
            <span>{t.localTime}</span>
            <input type="time" value={local.time} onChange={(e) => edit(local.date, e.target.value)} />
          </label>
        </div>
        {error && (
          <div className="time-error" role="alert">
            {error}
            {choices.map((candidate) => (
              <button key={candidate.getTime()} onClick={() => jump(candidate)}>
                {m.f.time(candidate, timeZone)} {formatOffset(candidate, timeZone)}
              </button>
            ))}
          </div>
        )}
        <div className="event-jumps">
          <button disabled={!events.sunrise} onClick={() => events.sunrise && jump(events.sunrise)}>
            {t.sunrise}
          </button>
          <button disabled={!events.sunset} onClick={() => events.sunset && jump(events.sunset)}>
            {t.sunset}
          </button>
        </div>
        <button className="primary-button full" onClick={() => editor.current?.close()}>
          {t.done}
        </button>
      </dialog>
      <div className="timeline-row">
        <button
          className="play-button"
          onClick={() => onPlaying(!(playing || following))}
          aria-label={playing || following ? t.pause : t.play}
        >
          {playing || following ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
        </button>
        <div className="timeline-track">
          <div className="event-markers" aria-hidden="true">
            {[events.sunrise, events.sunset].map(
              (event, i) =>
                event && (
                  <span
                    key={i}
                    style={{
                      left: `${((event.getTime() - bounds.start.getTime()) / (bounds.end.getTime() - bounds.start.getTime())) * 100}%`,
                    }}
                  >
                    {i === 0 ? <Sunrise size={12} /> : <Sunset size={12} />}
                  </span>
                ),
            )}
          </div>
          <input
            aria-label={t.slider}
            type="range"
            min={0}
            max={bounds.minutes - 1}
            step={1}
            value={minute}
            aria-valuetext={`${local.time} ${formatOffset(instant, timeZone)}`}
            onChange={(e) => jump(new Date(bounds.start.getTime() + Number(e.target.value) * 60000))}
          />
          <div className="timeline-ticks">
            {[0, 0.25, 0.5, 0.75, 1].map((part) => (
              <span key={part}>
                {m.f.time(
                  new Date(
                    bounds.start.getTime() +
                      Math.min(bounds.minutes - 1, Math.round(bounds.minutes * part)) * 60000,
                  ),
                  timeZone,
                  { hour12: false },
                )}
              </span>
            ))}
          </div>
        </div>
        <select aria-label={t.speed} value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
          {[1, 10, 60, 600].map((value) => (
            <option key={value} value={value}>
              {t.speedOption({ speed: value })}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
