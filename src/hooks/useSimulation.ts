import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocationInfo } from '../types';
import { calculateDailyEvents, calculateSky } from '../lib/astronomy';
import { civilDayStart, getZonedParts, localDayBounds, MAX_INSTANT, MIN_INSTANT } from '../lib/time';

export function useSimulation(initialLocation: LocationInfo, initialTime?: Date) {
  const [location, setLocation] = useState(initialLocation);
  const [simTime, updateTime] = useState(() => initialTime ?? new Date());
  const [playing, updatePlaying] = useState(false);
  const [following, setFollowing] = useState(!initialTime);
  const setSimTime = (time: Date) => {
    setFollowing(false);
    updateTime(time);
  };
  const setPlaying = (value: boolean) => {
    setFollowing(false);
    updatePlaying(value);
  };
  const followNow = () => {
    updatePlaying(false);
    setFollowing(true);
    updateTime(new Date());
  };
  const [speed, setSpeed] = useState(60);
  const lastTick = useRef(0);
  const localParts = useMemo(() => getZonedParts(simTime, location.timezone), [simTime, location.timezone]);
  const eventDate = useMemo(
    () => civilDayStart(localParts.date, location.timezone),
    [localParts.date, location.timezone],
  );
  const events = useMemo(() => calculateDailyEvents(location, eventDate), [location, eventDate]);
  const sky = useMemo(() => calculateSky(location, simTime, events), [location, simTime, events]);
  const dayBounds = useMemo(
    () => localDayBounds(eventDate, location.timezone),
    [eventDate, location.timezone],
  );
  useEffect(() => {
    if (!playing) return;
    lastTick.current = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastTick.current;
      lastTick.current = now;
      if (document.hidden) return;
      updateTime(
        (value) =>
          new Date(
            Math.min(MAX_INSTANT, Math.max(MIN_INSTANT, value.getTime() + Math.min(1000, elapsed) * speed)),
          ),
      );
    }, 200);
    const pauseHidden = () => {
      if (document.hidden) updatePlaying(false);
    };
    document.addEventListener('visibilitychange', pauseHidden);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', pauseHidden);
    };
  }, [playing, speed]);
  useEffect(() => {
    if (!following) return;
    const tick = () => {
      if (!document.hidden) updateTime(new Date());
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [following]);
  return {
    location,
    setLocation,
    simTime,
    setSimTime,
    playing,
    setPlaying,
    following,
    followNow,
    speed,
    setSpeed,
    localParts,
    sky,
    dayBounds,
  };
}
