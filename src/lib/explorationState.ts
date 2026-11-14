import type { WeatherValues } from '../types';
import type { Exploration, LayerSettings } from './persistence';
import { customConditions, defaultWeatherValues } from '../domain/weather';

export type Panel = 'objects' | 'weather' | 'settings';

/**
 * What the visitor is looking at and how the sky is being presented, apart from the clock (which
 * useSimulation owns) and saved preferences. Kept as one reducer so the flows can be tested without
 * rendering the app.
 */
export interface ExplorationState {
  panel: Panel | null;
  /** Object shown in the Objects panel. */
  selectedId: string | null;
  /** Object centered in the sky with a summary card. */
  focusedId: string | null;
  custom: boolean;
  customWeather: WeatherValues;
  /** Temporary clear-sky preview layered over the source or custom weather. */
  clearSky: boolean;
  /** A shared link's layers apply to this visit only; they never become saved defaults. */
  sharedLayers: LayerSettings | null;
  immersive: boolean;
  notice: string;
}

export type ExplorationAction =
  | { type: 'toggle-panel'; panel: Panel }
  | { type: 'close-panel' }
  | { type: 'inspect'; id: string | null }
  | { type: 'select'; id: string | null }
  | { type: 'focus'; id: string }
  | { type: 'clear-focus' }
  | { type: 'location-changed' }
  | { type: 'weather-mode'; custom: boolean; atmosphere: WeatherValues }
  | { type: 'weather-field'; field: keyof WeatherValues; value: number }
  | { type: 'clear-sky'; value: boolean }
  | { type: 'layer'; key: keyof LayerSettings; value: boolean }
  | { type: 'immersive'; value: boolean }
  | { type: 'notice'; message: string }
  /** Clears the notice only if it still says `message`, so an unrelated notice survives. */
  | { type: 'dismiss-notice'; message: string };

export function initialExploration(shared: Exploration | null, notice = ''): ExplorationState {
  return {
    panel: null,
    selectedId: null,
    focusedId: null,
    custom: !!shared?.custom,
    customWeather: shared?.custom ?? defaultWeatherValues(),
    clearSky: shared?.clearSky ?? false,
    sharedLayers: shared?.layers ?? null,
    immersive: false,
    notice,
  };
}

export function explorationReducer(state: ExplorationState, action: ExplorationAction): ExplorationState {
  switch (action.type) {
    case 'toggle-panel':
      if (state.panel === action.panel) return { ...state, panel: null };
      // Opening Objects from its button starts at the list, not a stale selection.
      return {
        ...state,
        panel: action.panel,
        selectedId: action.panel === 'objects' ? null : state.selectedId,
      };
    case 'close-panel':
      return { ...state, panel: null };
    case 'inspect':
      // Show an object (or the list) in the Objects panel, opening it if needed.
      return { ...state, panel: 'objects', selectedId: action.id };
    case 'select':
      return { ...state, selectedId: action.id };
    case 'focus':
      return { ...state, focusedId: action.id, panel: null };
    case 'clear-focus':
      return { ...state, focusedId: null };
    case 'location-changed':
      return { ...state, selectedId: null, focusedId: null };
    case 'weather-mode':
      return {
        ...state,
        clearSky: false,
        custom: action.custom,
        // Entering custom mode starts from the conditions on screen.
        customWeather:
          action.custom && !state.custom ? customConditions(action.atmosphere) : state.customWeather,
      };
    case 'weather-field':
      return { ...state, customWeather: customConditions(state.customWeather, action.field, action.value) };
    case 'clear-sky':
      return { ...state, clearSky: action.value };
    case 'layer':
      return state.sharedLayers
        ? { ...state, sharedLayers: { ...state.sharedLayers, [action.key]: action.value } }
        : state;
    case 'immersive':
      return { ...state, immersive: action.value, panel: null };
    case 'notice':
      return { ...state, notice: action.message };
    case 'dismiss-notice':
      return state.notice === action.message ? { ...state, notice: '' } : state;
  }
}

/** The weather the renderer draws: the clear-sky preview, else custom or source conditions. */
export function presentedWeather(base: WeatherValues, clearSky: boolean): WeatherValues {
  if (!clearSky) return base;
  return {
    ...base,
    cloudCover: 0,
    cloudLow: 0,
    cloudMid: 0,
    cloudHigh: 0,
    haze: 0,
    precipitation: 0,
    visibilityKm: 60,
    weatherCode: 0,
  };
}
