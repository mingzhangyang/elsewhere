import { useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Pause, Play, Sunrise, Sunset, X } from 'lucide-react';
import {
  formatDate,
  formatOffset,
  formatTime,
  getZonedParts,
  MAX_INSTANT,
  MIN_INSTANT,
  shiftLocalDate,
  wallTimeCandidates,
} from '../lib/time';
import type { SkyEvents } from '../types';

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
  const local = getZonedParts(instant, timeZone);
  const editor = useRef<HTMLDialogElement>(null);
  const editorTrigger = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<Date[]>([]);
  const status = following ? 'Following real time' : playing ? `Playing at ${speed}×` : 'Paused';
  const shortDate = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(instant);
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
      if (!candidates.length)
        setError('This time does not exist because the clock moves forward. Choose another time.');
      else if (candidates.length === 2) {
        setChoices(candidates);
        setError('This time occurs twice. Choose the offset you want.');
      } else jump(candidates[0]);
    } catch {
      setError('Choose a valid date from 1900 through 2100.');
    }
  };
  const shift = (days: number) => {
    try {
      jump(shiftLocalDate(instant, timeZone, days));
    } catch {
      setError('Choose a date from 1900 through 2100.');
    }
  };
  return (
    <section className="time-console" aria-label="Time controls">
      <div className="time-topline">
        <button
          className="time-readout"
          ref={editorTrigger}
          aria-label="Change date and time"
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
          Now
        </button>
        <button
          className="tonight-button"
          disabled={!events.twilightDusk}
          title={events.twilightDusk ? 'Explore one hour after civil dusk' : 'No civil dusk on this date'}
          onClick={() => events.twilightDusk && jump(new Date(events.twilightDusk.getTime() + 3600000))}
        >
          Tonight
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
          <h2 id="time-editor-title">Choose a moment</h2>
          <button
            className="icon-button"
            aria-label="Close time editor"
            onClick={() => editor.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <p className="time-zone-note">
          {timeZone.replaceAll('_', ' ')} · {formatOffset(instant, timeZone)}
        </p>
        <div className="day-navigation">
          <button className="icon-button" aria-label="Previous day" onClick={() => shift(-1)}>
            <ChevronLeft size={18} />
          </button>
          <span>{formatDate(instant, timeZone)}</span>
          <button className="icon-button" aria-label="Next day" onClick={() => shift(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="time-inputs">
          <label>
            <span>Date</span>
            <input
              type="date"
              min="1900-01-01"
              max="2100-12-31"
              value={local.date}
              onChange={(e) => edit(e.target.value, local.time)}
            />
          </label>
          <label>
            <span>Local time</span>
            <input type="time" value={local.time} onChange={(e) => edit(local.date, e.target.value)} />
          </label>
        </div>
        {error && (
          <div className="time-error" role="alert">
            {error}
            {choices.map((candidate) => (
              <button key={candidate.getTime()} onClick={() => jump(candidate)}>
                {formatTime(candidate, timeZone)} {formatOffset(candidate, timeZone)}
              </button>
            ))}
          </div>
        )}
        <div className="event-jumps">
          <button disabled={!events.sunrise} onClick={() => events.sunrise && jump(events.sunrise)}>
            Sunrise
          </button>
          <button disabled={!events.sunset} onClick={() => events.sunset && jump(events.sunset)}>
            Sunset
          </button>
        </div>
        <button className="primary-button full" onClick={() => editor.current?.close()}>
          Done
        </button>
      </dialog>
      <div className="timeline-row">
        <button
          className="play-button"
          onClick={() => onPlaying(!(playing || following))}
          aria-label={playing || following ? 'Pause time' : 'Play time'}
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
            aria-label="Time of day"
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
                {formatTime(
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
        <select aria-label="Playback speed" value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
          {[1, 10, 60, 600].map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
