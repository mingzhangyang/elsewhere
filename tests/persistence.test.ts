import { describe, expect, it } from 'vitest';
import {
  explorationUrl,
  loadPreferences,
  parseExploration,
  savePreferences,
  type Exploration,
} from '../src/lib/persistence';
import { isDeviceLocation, normalizeLocation, PRESETS } from '../src/lib/locations';
import { customConditions, defaultWeatherValues } from '../src/domain/weather';

const exploration: Exploration = {
  version: 1,
  location: PRESETS[0],
  instant: '2026-11-01T06:30:00.000Z',
  camera: { heading: 270, altitude: 12, fov: 40 },
  layers: { stars: true, lines: true, labels: false },
  custom: customConditions(defaultWeatherValues()),
};
describe('portable exploration state', () => {
  it('migrates old device locations and retains identity and privacy through storage and sharing', () => {
    const legacy = { ...PRESETS[0], id: 'device-location' };
    const a = normalizeLocation(legacy);
    const b = normalizeLocation({ ...legacy, latitude: legacy.latitude + 1 });
    expect(a.id).not.toBe(b.id);
    const prefs = loadPreferences().value;
    savePreferences({ ...prefs, saved: [legacy] });
    expect(loadPreferences().value.saved).toEqual([a]);
    savePreferences({ ...prefs, saved: [a, b] });
    expect(loadPreferences().value.saved).toEqual([a, b]);
    for (const location of [legacy, a, b]) {
      const restored = parseExploration(new URL(explorationUrl({ ...exploration, location })).hash).value!
        .location;
      expect(restored).toEqual(normalizeLocation(location));
      expect(isDeviceLocation(restored)).toBe(true);
    }
  });
  it('migrates old Moon appearance preferences and persists the physical-size switch', () => {
    const prefs = loadPreferences().value;
    expect(prefs.moonDisplayAid).toBe(true);
    const legacy = { ...prefs, moonDisplayAid: undefined };
    localStorage.setItem('elsewhere.preferences.v1', JSON.stringify(legacy));
    expect(loadPreferences().value.moonDisplayAid).toBe(true);
    expect(savePreferences({ ...prefs, moonDisplayAid: false })).toBe(true);
    expect(loadPreferences().value.moonDisplayAid).toBe(false);
    expect(savePreferences({ ...prefs, moonDisplayAid: true })).toBe(true);
    expect(loadPreferences().value.moonDisplayAid).toBe(true);
  });

  const legacyHash = (value: Exploration) => '#sky=' + encodeURIComponent(JSON.stringify(value));
  const compactTuple = (value: Exploration): unknown[] => {
    const token = new URL(explorationUrl(value)).hash.slice('#sky=2.'.length);
    return JSON.parse(atob(token.replaceAll('-', '+').replaceAll('_', '/'))) as unknown[];
  };

  it('shortens ordinary weather links and keeps legacy JSON links readable', () => {
    const regular = { ...exploration, custom: null, clearSky: false };
    const short = new URL(explorationUrl(regular)).hash;
    expect(short).toMatch(/^#sky=2\.[A-Za-z0-9_-]+$/);
    expect(short.length).toBeLessThan(legacyHash(regular).length / 2);
    expect(compactTuple(regular)).toHaveLength(6);
    expect(parseExploration(short)).toEqual({ value: regular, notice: null });
    expect(parseExploration(legacyHash(regular))).toEqual({ value: regular, notice: null });
  });

  it('packs integer custom weather as 39 digits with a signed temperature offset', () => {
    const custom = {
      ...exploration.custom!,
      cloudCover: 100,
      humidity: 100,
      precipitation: 15,
      temperature: -27,
      pressure: 1013,
      weatherCode: 99,
      visibilityKm: 200,
      windSpeed: 500,
    };
    const state = { ...exploration, custom, focus: 'hyg-32263', subject: 'pattern:orion' };
    const short = new URL(explorationUrl(state)).hash;
    expect(short.length).toBeLessThan(legacyHash(state).length / 2);
    expect(compactTuple(state)[6]).toMatch(/^\d{39}$/);
    expect(parseExploration(short)).toEqual({ value: state, notice: null });
    expect(parseExploration(legacyHash(state))).toEqual({ value: state, notice: null });
  });

  it('uses lossless numeric array for fractional weather rather than silently rounding', () => {
    const custom = {
      ...exploration.custom!,
      temperature: -3.75,
      humidity: 86.25,
      precipitation: 0.125,
      windDirection: 358.5,
      pressure: 1011.25,
    };
    const state = { ...exploration, custom };
    expect(compactTuple(state)[6]).toBeInstanceOf(Array);
    expect(parseExploration(new URL(explorationUrl(state)).hash)).toEqual({
      value: state,
      notice: null,
    });
  });

  it('round-trips a non-preset multilingual place, precise device coordinates and clear sky', () => {
    const customPlace = {
      ...PRESETS[0],
      id: 'special-place',
      name: 'Ålesund / 東京',
      country: 'Norge / 日本',
      latitude: 62.472228,
      longitude: 6.149482,
      timezone: 'Europe/Oslo',
    };
    const state = { ...exploration, location: customPlace, clearSky: true };
    const link = new URL(explorationUrl(state)).hash;
    expect(link.length).toBeLessThan(legacyHash(state).length * 0.65);
    expect(parseExploration(link).value).toEqual(state);
    const exact = normalizeLocation({
      ...customPlace,
      id: 'device-location',
      source: 'device',
    });
    expect(parseExploration(new URL(explorationUrl({ ...state, location: exact })).hash).value?.location)
      .toEqual(exact);
  });

  it('rejects malformed compact data, unknown places, bad weather and invalid flags', () => {
    const compactHash = (tuple: unknown[]) =>
      '#sky=2.' + btoa(JSON.stringify(tuple)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const good = compactTuple(exploration);
    const failures = [
      '#sky=2.not!base64',
      '#sky=2.%%%%',
      compactHash(['unknown-preset', ...good.slice(1)]),
      compactHash([...good.slice(0, 5), 32, ...good.slice(6)]),
      compactHash([...good.slice(0, 6), '123']),
      '#sky=' + 'a'.repeat(6000),
    ];
    for (const hash of failures) {
      expect(parseExploration(hash), hash).toEqual({ value: null, notice: { code: 'invalid-link' } });
    }
  });

  it('preserves the repeated-hour instant, camera and custom conditions', () => {
    expect(parseExploration(new URL(explorationUrl(exploration)).hash)).toEqual({
      value: exploration,
      notice: null,
    });
  });
  it.each([
    { ...exploration, version: 2 },
    { ...exploration, instant: 'invalid' },
    { ...exploration, location: { ...exploration.location, latitude: 91 } },
    { ...exploration, camera: { ...exploration.camera, fov: 0 } },
    { ...exploration, camera: { ...exploration.camera, fov: 1.9 } },
    { ...exploration, camera: { ...exploration.camera, fov: 93 } },
    { ...exploration, custom: { ...exploration.custom, cloudCover: -1 } },
    { ...exploration, clearSky: 'yes' },
  ])('rejects unsupported or invalid state', (state) => {
    const result = parseExploration('#sky=' + encodeURIComponent(JSON.stringify(state)));
    expect(result.value).toBeNull();
    expect(result.notice).toEqual({ code: 'invalid-link' });
  });
  it('accepts the deepest Sun and Moon zoom in a shared view', () => {
    const zoomed = { ...exploration, camera: { ...exploration.camera, fov: 2 } };
    expect(parseExploration(new URL(explorationUrl(zoomed)).hash).value?.camera.fov).toBe(2);
  });
  it('recovers from corrupt preferences without silently overwriting them', () => {
    localStorage.setItem('elsewhere.preferences.v1', '{broken');
    const result = loadPreferences();
    expect(result.notice).toEqual({ code: 'preferences-unreadable' });
    expect(localStorage.getItem('elsewhere.preferences.v1')).toBe('{broken');
    expect(savePreferences({ ...result.value, saved: [PRESETS[1]], hintDismissed: true })).toBe(true);
    expect(loadPreferences().value.saved).toEqual([PRESETS[1]]);
  });
  it('shares a temporary clear-sky preview without replacing original custom conditions', () => {
    const preview = { ...exploration, clearSky: true };
    expect(parseExploration(new URL(explorationUrl(preview)).hash).value).toEqual(preview);
  });
});
