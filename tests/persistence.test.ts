import { describe, expect, it } from 'vitest';
import {
  explorationUrl,
  loadPreferences,
  parseExploration,
  savePreferences,
  type Exploration,
} from '../src/lib/persistence';
import { isDeviceLocation, normalizeLocation, PRESETS } from '../src/lib/locations';
import { customConditions, defaultWeatherValues } from '../src/lib/weather';

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
  it('preserves the repeated-hour instant, camera and custom conditions', () => {
    expect(parseExploration(new URL(explorationUrl(exploration)).hash)).toEqual({
      value: exploration,
      notice: '',
    });
  });
  it.each([
    { ...exploration, version: 2 },
    { ...exploration, instant: 'invalid' },
    { ...exploration, location: { ...exploration.location, latitude: 91 } },
    { ...exploration, camera: { ...exploration.camera, fov: 0 } },
    { ...exploration, custom: { ...exploration.custom, cloudCover: -1 } },
    { ...exploration, clearSky: 'yes' },
  ])('rejects unsupported or invalid state', (state) => {
    const result = parseExploration('#sky=' + encodeURIComponent(JSON.stringify(state)));
    expect(result.value).toBeNull();
    expect(result.notice).toMatch(/invalid or unsupported/);
  });
  it('recovers from corrupt preferences without silently overwriting them', () => {
    localStorage.setItem('elsewhere.preferences.v1', '{broken');
    const result = loadPreferences();
    expect(result.notice).toMatch(/could not be read/);
    expect(localStorage.getItem('elsewhere.preferences.v1')).toBe('{broken');
    expect(savePreferences({ ...result.value, saved: [PRESETS[1]], hintDismissed: true })).toBe(true);
    expect(loadPreferences().value.saved).toEqual([PRESETS[1]]);
  });
  it('shares a temporary clear-sky preview without replacing original custom conditions', () => {
    const preview = { ...exploration, clearSky: true };
    expect(parseExploration(new URL(explorationUrl(preview)).hash).value).toEqual(preview);
  });
});
