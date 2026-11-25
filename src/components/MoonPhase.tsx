import { useEffect, useRef, useState } from 'react';
import type { MomentSnapshot } from '../lib/moment';

/** Orthographic projection of a sphere's terminator; illumination is its lit area fraction. */
export default function MoonPhase({
  illumination,
  angle,
  label,
}: {
  illumination: number;
  angle: number;
  label: string;
}) {
  const k = Math.max(0, Math.min(1, illumination));
  const terminator = 1 - 2 * k;
  // Right limb from top to bottom, then the projected terminator back to the top.
  const path = `M 0 -1 A 1 1 0 0 1 0 1 A ${Math.max(0.00001, Math.abs(terminator))} 1 0 0 ${terminator < 0 ? 1 : 0} 0 -1 Z`;
  return (
    <svg className="moon-phase" viewBox="-1.08 -1.08 2.16 2.16" role="img" aria-label={label}>
      <circle r="1" fill="#172334" />
      <path d={path} fill="#dce0db" transform={`rotate(${angle - 90})`} />
      <circle r="1" fill="none" stroke="#91a0b2" strokeWidth="0.02" />
    </svg>
  );
}

export type MoonClockMode = 'live' | 'playback' | 'paused';

/** Small live portrait with a synchronous, accessible SVG fallback. */
export function MoonPortraitThumbnail({
  snapshot,
  clockMode,
  label,
  openLabel,
  onOpen,
}: {
  snapshot: MomentSnapshot;
  clockMode: MoonClockMode;
  label: string;
  openLabel: string;
  onOpen: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const latestSnapshot = useRef(snapshot);
  useEffect(() => {
    latestSnapshot.current = snapshot;
  }, [snapshot]);
  const [portraitSnapshot, setPortraitSnapshot] = useState(snapshot);
  const pausedInstant = clockMode === 'paused' ? snapshot.instant.getTime() : null;
  const { latitude, longitude, elevation } = snapshot.location;
  useEffect(() => {
    const sample = () => setPortraitSnapshot(latestSnapshot.current);
    sample();
    if (pausedInstant !== null) return;
    const timer = window.setInterval(sample, 30_000);
    return () => window.clearInterval(timer);
  }, [clockMode, pausedInstant, latitude, longitude, elevation]);
  useEffect(() => {
    const controller = new AbortController();
    void import('../moment/moonPortrait')
      .then(({ drawMoonPortrait }) => drawMoonPortrait(portraitSnapshot, 128, undefined, controller.signal))
      .then((image) => {
        if (controller.signal.aborted || !canvas.current) return;
        const ctx = canvas.current.getContext('2d');
        if (!ctx) {
          setReady(false);
          return;
        }
        ctx.clearRect(0, 0, 128, 128);
        ctx.drawImage(image, 0, 0);
        setReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setReady(false);
      });
    return () => controller.abort();
  }, [portraitSnapshot]);
  return (
    <button className="moon-portrait-trigger" type="button" aria-label={openLabel} onClick={onOpen}>
      <canvas
        ref={canvas}
        className="moon-phase"
        width={128}
        height={128}
        hidden={!ready}
        role="img"
        aria-label={label}
      />
      {!ready && (
        <MoonPhase
          illumination={snapshot.sky.moon.illumination}
          angle={snapshot.sky.moon.brightLimbAngle}
          label={label}
        />
      )}
    </button>
  );
}
