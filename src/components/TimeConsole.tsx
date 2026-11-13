import { useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Sunrise, Sunset } from 'lucide-react';
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
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<Date[]>([]);
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
              aria-label="DATE"
              type="date"
              min="1900-01-01"
              max="2100-12-31"
              value={local.date}
              onChange={(e) => edit(e.target.value, local.time)}
            />
          </label>
          <label>
            <span>Local time</span>
            <input
              aria-label="LOCAL TIME"
              type="time"
              value={local.time}
              onChange={(e) => edit(local.date, e.target.value)}
            />
          </label>
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
        </div>
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
          {[1, 10, 60, 600].map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      </div>
      <div className="time-bottom">
        <span>
          {following ? 'Following real time' : playing ? `Playing at ${speed}×` : 'Paused'} ·{' '}
          {timeZone.replaceAll('_', ' ')} · {formatOffset(instant, timeZone)}
        </span>
        <div className="event-jumps">
          <button disabled={!events.sunrise} onClick={() => events.sunrise && jump(events.sunrise)}>
            Sunrise
          </button>
          <button disabled={!events.sunset} onClick={() => events.sunset && jump(events.sunset)}>
            Sunset
          </button>
          <button
            disabled={!events.twilightDusk}
            onClick={() => events.twilightDusk && jump(new Date(events.twilightDusk.getTime() + 3600000))}
          >
            Tonight
          </button>
        </div>
      </div>
    </section>
  );
}
