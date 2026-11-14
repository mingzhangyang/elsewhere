import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocationInfo } from '../types';
import { calculateDailyEvents, calculateSky } from '../domain/astronomy';
import { starCatalogLoaded } from '../domain/stars';
import { loadStars } from '../services/starCatalog';
import { civilDayStart, getZonedParts, localDayBounds, MAX_INSTANT, MIN_INSTANT } from '../domain/time';

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
  // The sky renders before the star catalog arrives; it is recalculated once the stars are in.
  const [stars, setStars] = useState<'loading' | 'ready' | 'error'>(() =>
    starCatalogLoaded() ? 'ready' : 'loading',
  );
  useEffect(() => {
    if (stars !== 'loading') return;
    let active = true;
    loadStars().then(
      () => active && setStars('ready'),
      () => active && setStars('error'),
    );
    return () => {
      active = false;
    };
  }, [stars]);
  const retryStars = () => setStars('loading');
  const sky = useMemo(
    () => calculateSky(location, simTime, events),
    // `stars` is a dependency because the catalog is read from module state when it arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location, simTime, events, stars],
  );
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
    stars,
    retryStars,
  };
}
