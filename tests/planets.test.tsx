import * as THREE from 'three';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ObjectPanel from '../src/components/ObjectPanel';
import { calculateSky, nextBodyRise } from '../src/domain/astronomy';
import { PLANET_IDS } from '../src/domain/planets';
import { planetTwilightVisibility, twilightVisibility } from '../src/domain/starVisibility';
import { defaultWeatherValues } from '../src/domain/weather';
import {
  aboveHorizon,
  findSkyObject,
  framingFov,
  objectVisibility,
  skyObjects,
} from '../src/lib/exploration';
import { initialExploration } from '../src/lib/explorationState';
import { explorationUrl, parseExploration, type Exploration, type Preferences } from '../src/lib/persistence';
import { PRESETS } from '../src/lib/locations';
import { createCelestialLayers } from '../src/renderer/celestialLayers';
import { NEW_YORK } from './fixtures/locations';

const preferences: Preferences = {
  version: 1,
  layers: { stars: true, lines: false, labels: true },
  saved: [],
  recent: [],
  hintDismissed: false,
  reducedMotion: false,
  quality: 'auto',
  horizon: 'ridge',
  skyBrightness: 'suburban',
};
const clear = { ...defaultWeatherValues(), cloudCover: 0, haze: 0, visibilityKm: 60 };
// Civil dusk in New York near Venus's greatest eastern elongation (the dev scenario "venus").
const EVENING_VENUS = new Date('2026-08-15T00:30Z');
// Local midnight in New York at Jupiter's opposition (the dev scenario "jupiter").
const MIDNIGHT_JUPITER = new Date('2026-01-10T05:00Z');

/** The brightest point above the horizon, other than the Sun and Moon. */
const brightestPoint = (sky: ReturnType<typeof calculateSky>) =>
  skyObjects(sky)
    .filter((o) => (o.kind === 'planet' || o.kind === 'star') && aboveHorizon(o))
    .sort((a, b) => ('magnitude' in a ? a.magnitude : 0) - ('magnitude' in b ? b.magnitude : 0))[0];

describe('what is that bright point?', () => {
  it('is Venus in the evening twilight, before the first stars', () => {
    const sky = calculateSky(NEW_YORK, EVENING_VENUS);
    const venus = findSkyObject(sky, 'venus')!;
    expect(venus).toMatchObject({ kind: 'planet', name: 'Venus', apparition: 'evening' });
    expect(venus.altitude).toBeGreaterThan(10);
    expect(brightestPoint(sky).name).toBe('Venus');
    const visibility = objectVisibility(venus, sky, clear, preferences);
    expect(visibility.reason).toBe('clear');
    expect(visibility.detail).toContain('brighter than any star');
    // The same sky still hides Arcturus, the brightest star up: planets emerge first.
    const arcturus = skyObjects(sky).find((o) => o.name === 'Arcturus')!;
    expect(objectVisibility(arcturus, sky, clear, preferences).reason).toBe('twilight');
    // At sunset itself Venus is still washed out, and the Objects list says so.
    const sunset = calculateSky(NEW_YORK, new Date('2026-08-15T00:00Z'));
    expect(objectVisibility(findSkyObject(sunset, 'venus')!, sunset, clear, preferences).reason).toBe(
      'twilight',
    );
  });

  it('is Jupiter high in the south at midnight, opposite the Sun', () => {
    const sky = calculateSky(NEW_YORK, MIDNIGHT_JUPITER);
    const jupiter = findSkyObject(sky, 'jupiter')!;
    expect(jupiter.kind).toBe('planet');
    if (jupiter.kind !== 'planet') return;
    expect(jupiter.altitude).toBeGreaterThan(65);
    expect(Math.abs(jupiter.azimuth - 180)).toBeLessThan(15);
    expect(jupiter.elongation).toBeGreaterThan(175);
    expect(brightestPoint(sky).name).toBe('Jupiter');
    expect(objectVisibility(jupiter, sky, clear, preferences).reason).toBe('clear');
  });

  it('lists planets above the horizon after the Sun and Moon and before every star', () => {
    const sky = calculateSky(NEW_YORK, MIDNIGHT_JUPITER);
    const up = skyObjects(sky).filter(aboveHorizon);
    const firstStar = up.findIndex((o) => o.kind === 'star');
    expect(up.slice(0, firstStar).map((o) => o.name)).toEqual(['Moon', 'Jupiter']);
  });
});

describe('planet visibility', () => {
  it('says why a planet cannot be seen: horizon, daylight or the Sun’s glare, cloud', () => {
    const sky = calculateSky(NEW_YORK, MIDNIGHT_JUPITER);
    const venus = findSkyObject(sky, 'venus')!;
    expect(objectVisibility(venus, sky, clear, preferences).reason).toBe('horizon');
    const jupiter = findSkyObject(sky, 'jupiter')!;
    expect(objectVisibility(jupiter, sky, { ...clear, cloudCover: 95 }, preferences).reason).toBe('cloud');
    // Planets are not part of the stars layer.
    expect(
      objectVisibility(jupiter, sky, clear, {
        ...preferences,
        layers: { ...preferences.layers, stars: false },
      }).reason,
    ).toBe('clear');
    const noon = calculateSky(NEW_YORK, new Date('2026-08-14T17:00Z'));
    const day = objectVisibility(findSkyObject(noon, 'venus')!, noon, clear, preferences);
    expect(day.reason).toBe('daylight');
    const glare = objectVisibility(
      { ...findSkyObject(noon, 'venus')!, elongation: 8 } as never,
      noon,
      clear,
      preferences,
    );
    expect(glare.detail).toContain('Never search near the Sun');
  });

  it('lets brighter planets show through brighter twilight, never dimmer than a star', () => {
    for (const sun of [-20, -12, -8, -5, -3, 0, 4]) {
      expect(planetTwilightVisibility(sun, 1.5)).toBeCloseTo(twilightVisibility(sun), 12);
      expect(planetTwilightVisibility(sun, -2.5)).toBeGreaterThanOrEqual(twilightVisibility(sun));
      expect(planetTwilightVisibility(sun, -4.5)).toBeGreaterThanOrEqual(planetTwilightVisibility(sun, -2.5));
    }
    expect(planetTwilightVisibility(-3, -4.5)).toBeGreaterThan(0.5);
    expect(twilightVisibility(-3)).toBe(0);
  });

  it('keeps the current zoom when centering a planet, which is a point at any zoom', () => {
    const sky = calculateSky(NEW_YORK, MIDNIGHT_JUPITER);
    expect(framingFov(findSkyObject(sky, 'jupiter')!)).toBeUndefined();
  });

  it('finds a planet’s rise and the day’s rise and set times', () => {
    const sky = calculateSky(NEW_YORK, MIDNIGHT_JUPITER);
    expect(Object.keys(sky.events.planets)).toEqual(PLANET_IDS);
    const rise = nextBodyRise(NEW_YORK, 'venus', MIDNIGHT_JUPITER)!;
    expect(rise.getTime() - MIDNIGHT_JUPITER.getTime()).toBeGreaterThan(0);
    expect(rise.getTime() - MIDNIGHT_JUPITER.getTime()).toBeLessThan(86400000);
    expect(calculateSky(NEW_YORK, new Date(rise.getTime() + 15 * 60000)).planets[1].visible).toBe(true);
  });
});

describe('sharing a planet', () => {
  const link: Exploration = {
    version: 1,
    location: PRESETS[0],
    instant: MIDNIGHT_JUPITER.toISOString(),
    camera: { heading: 180, altitude: 70, fov: 40 },
    layers: { stars: true, lines: false, labels: true },
    custom: null,
    focus: 'jupiter',
  };
  it('restores the centered planet from a link, and older links without one', () => {
    const parsed = parseExploration(new URL(explorationUrl(link)).hash);
    expect(parsed).toEqual({ value: link, notice: '' });
    expect(initialExploration(parsed.value).focusedId).toBe('jupiter');
    const older = { ...link, focus: undefined };
    expect(initialExploration(parseExploration(new URL(explorationUrl(older)).hash).value).focusedId).toBe(
      null,
    );
  });
  it.each([42, '', 'Jupiter!', 'x'.repeat(41)])('rejects an invalid focus %j', (focus) => {
    const hash = '#sky=' + encodeURIComponent(JSON.stringify({ ...link, focus }));
    expect(parseExploration(hash).value).toBeNull();
  });
});

it('labels planets first, whether or not stars are shown, only while the point is drawn', () => {
  const scene = new THREE.Scene();
  const text = vi.fn((name: string) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.name = name;
    return sprite;
  });
  const sky = calculateSky(NEW_YORK, MIDNIGHT_JUPITER);
  const layers = createCelestialLayers(scene, sky.stars, text, sky.planets);
  const label = (name: string) => scene.children.find((o) => o.name === name)!;
  const state = (opacity: number) =>
    sky.planets.map((p) => ({ altitude: p.altitude, azimuth: p.azimuth, opacity: p.visible ? opacity : 0 }));
  const flags = { stars: false, labels: true, constellations: false };
  layers.update(sky.stars, flags, 1, state(1));
  expect(label('Jupiter').visible).toBe(true);
  expect(label('Venus').visible).toBe(false);
  expect(text.mock.calls[0][0]).toBe('Mercury');
  layers.update(sky.stars, flags, 1, state(0.01));
  expect(label('Jupiter').visible).toBe(false);
  layers.update(sky.stars, { ...flags, labels: false }, 1, state(1));
  expect(label('Jupiter').visible).toBe(false);
});

describe('the Objects panel', () => {
  const props = (selectedId: string | null) => ({
    sky: calculateSky(NEW_YORK, EVENING_VENUS),
    timeZone: NEW_YORK.timezone,
    selectedId,
    preferences,
    weather: clear,
    clearSky: false,
    onSelect: () => {},
    onFocus: () => {},
    onRise: () => {},
    onClearSky: () => {},
  });
  it('shows Venus’s phase, brightness, place relative to the Sun, and rise and set', () => {
    render(<ObjectPanel {...props('venus')} />);
    expect(screen.getByRole('heading', { name: 'Venus' })).toBeInTheDocument();
    expect(screen.getByText('Planet')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Venus: half lit, 49% illuminated$/ })).toBeInTheDocument();
    expect(screen.getByText(/Magnitude -4\.5/)).toHaveTextContent('Evening sky: 46° east of the Sun.');
    expect(screen.getByText('Rises today').nextSibling).not.toHaveTextContent('No rise');
    expect(screen.getByText('Sets today').nextSibling).not.toHaveTextContent('No set');
  });
  it('offers the next rise for a planet below the horizon', () => {
    const onRise = vi.fn();
    render(<ObjectPanel {...props('jupiter')} onRise={onRise} />);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to next rise' }));
    expect(onRise).toHaveBeenCalledWith('jupiter');
  });
  it('finds all five planets by searching for “planet”', () => {
    render(<ObjectPanel {...props(null)} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an object' }), {
      target: { value: 'planet' },
    });
    expect(screen.getByRole('group', { name: 'Celestial objects' })).toHaveTextContent(
      /Mercury.*Venus.*Mars.*Jupiter.*Saturn/,
    );
  });
});
