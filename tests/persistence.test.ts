import { describe, expect, it } from 'vitest';
import {
  explorationUrl,
  loadPreferences,
  parseExploration,
  savePreferences,
  type Exploration,
} from '../src/lib/persistence';
import { PRESETS } from '../src/lib/locations';
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
});
