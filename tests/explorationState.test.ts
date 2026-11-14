import { describe, expect, it } from 'vitest';
import {
  explorationReducer as reduce,
  initialExploration,
  presentedWeather,
  type ExplorationAction,
  type ExplorationState,
} from '../src/lib/explorationState';
import { defaultWeatherValues } from '../src/domain/weather';
import type { Exploration } from '../src/lib/persistence';
import { NEW_YORK } from './fixtures/locations';

const run = (state: ExplorationState, ...actions: ExplorationAction[]) => actions.reduce(reduce, state);
const fresh = () => initialExploration(null);

describe('exploration flows without rendering', () => {
  it('toggles panels and opens Objects at the list', () => {
    let state = run(fresh(), { type: 'inspect', id: 'moon' });
    expect(state).toMatchObject({ panel: 'objects', selectedId: 'moon' });
    state = run(
      state,
      { type: 'toggle-panel', panel: 'weather' },
      { type: 'toggle-panel', panel: 'objects' },
    );
    expect(state).toMatchObject({ panel: 'objects', selectedId: null });
    expect(run(state, { type: 'toggle-panel', panel: 'objects' }).panel).toBeNull();
  });

  it('centers an object by closing the panel, and a new place clears both selections', () => {
    const state = run(fresh(), { type: 'inspect', id: 'sun' }, { type: 'focus', id: 'sun' });
    expect(state).toMatchObject({ panel: null, focusedId: 'sun', selectedId: 'sun' });
    expect(run(state, { type: 'location-changed' })).toMatchObject({ focusedId: null, selectedId: null });
  });

  it('starts custom weather from the conditions on screen and ends any clear-sky preview', () => {
    const atmosphere = { ...defaultWeatherValues(), cloudCover: 85, temperature: -4 };
    let state = run(fresh(), { type: 'clear-sky', value: true });
    state = run(state, { type: 'weather-mode', custom: true, atmosphere });
    expect(state.clearSky).toBe(false);
    expect(state.customWeather.cloudCover).toBe(85);
    state = run(state, { type: 'weather-field', field: 'precipitation', value: 2 });
    expect(state.customWeather.weatherCode).toBe(73); // Snow below freezing.
    // Returning to custom later starts again from whatever is on screen then.
    state = run(state, { type: 'weather-mode', custom: false, atmosphere });
    state = run(state, { type: 'weather-mode', custom: true, atmosphere: defaultWeatherValues() });
    expect(state.customWeather.precipitation).toBe(0);
  });

  it('changes a shared link’s layers for this visit only', () => {
    expect(run(fresh(), { type: 'layer', key: 'stars', value: false }).sharedLayers).toBeNull();
    const shared: Exploration = {
      version: 1,
      location: NEW_YORK,
      instant: '2026-11-12T12:00:00.000Z',
      camera: { heading: 0, altitude: 18, fov: 66 },
      layers: { stars: true, lines: true, labels: false },
      custom: null,
      clearSky: true,
    };
    const state = run(initialExploration(shared), { type: 'layer', key: 'labels', value: true });
    expect(state.sharedLayers).toEqual({ stars: true, lines: true, labels: true });
    expect(state.clearSky).toBe(true);
  });

  it('hides panels when controls are hidden', () => {
    expect(
      run(fresh(), { type: 'toggle-panel', panel: 'settings' }, { type: 'immersive', value: true }),
    ).toMatchObject({
      immersive: true,
      panel: null,
    });
  });

  it('withdraws a notice only while it still says the same thing', () => {
    const failed = run(fresh(), { type: 'notice', message: 'Stars could not load.' });
    expect(run(failed, { type: 'dismiss-notice', message: 'Stars could not load.' }).notice).toBe('');
    const replaced = run(failed, { type: 'notice', message: 'Preferences could not be saved.' });
    expect(run(replaced, { type: 'dismiss-notice', message: 'Stars could not load.' }).notice).toBe(
      'Preferences could not be saved.',
    );
  });

  it('previews a clear sky without touching the underlying conditions', () => {
    const base = { ...defaultWeatherValues(), cloudCover: 100, precipitation: 3, haze: 40 };
    expect(presentedWeather(base, false)).toBe(base);
    expect(presentedWeather(base, true)).toMatchObject({ cloudCover: 0, precipitation: 0, haze: 0 });
    expect(base.cloudCover).toBe(100);
  });
});
