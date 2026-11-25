import { describe, expect, it } from 'vitest';
import { calculateSky } from '../src/domain/astronomy';
import { defaultWeatherValues } from '../src/domain/weather';
import { loadLanguage } from '../src/i18n';
import { PRESETS } from '../src/lib/locations';
import type { MomentSnapshot } from '../src/lib/moment';
import { moonCardText } from '../src/moment/moonCard';
import { DEFAULT_MOON_SETTINGS } from '../src/moment/moonPortrait';

const location = PRESETS[0];
// January 9 locally, despite January 10 in UTC.
const instant = new Date('2026-01-10T00:30:00Z');
const sky = calculateSky(location, instant);
const snapshot: MomentSnapshot = {
  location,
  instant,
  sky: {
    ...sky,
    moon: {
      ...sky.moon,
      phase: 'full',
      illumination: 0.98,
      visible: false,
      altitude: -12,
      distanceKm: 384420,
    },
  },
  weather: defaultWeatherValues(),
  view: { heading: 0, altitude: 18, fov: 66 },
  aspect: 1.6,
  layers: { stars: true, lines: false, labels: true },
  skyBrightness: 'dark',
  provenance: { kind: 'none' },
};

describe('Moon keepsake text', () => {
  it.each(['en', 'zh-Hans'] as const)('uses local time and localized facts in %s', async (locale) => {
    const i18n = await loadLanguage(locale);
    const text = moonCardText(
      snapshot,
      { ...DEFAULT_MOON_SETTINGS, orientation: 'north-up' },
      i18n,
      'example.test',
    );
    expect(text.title).toBe(locale === 'en' ? 'New York' : '纽约');
    expect(text.when).toContain(i18n.m.f.date(instant, location.timezone));
    expect(text.when).not.toContain(i18n.m.f.date(instant, 'UTC'));
    expect(text.phase).toBe(i18n.m.moment.moon({ phase: i18n.m.phases.full, illumination: 98, up: false }));
    expect(text.facts).toContain(i18n.m.f.number(384400));
    expect(text.facts).toContain(i18n.m.f.number(-12, 1) + '°');
    expect(text.credit).toContain('NASA LROC');
    expect(text.credit).toContain(locale === 'en' ? 'Lunar north up' : '月球北极朝上');
    expect(text.site).toBe('example.test');
  });

  it('never prints a device location name, country or coordinates', async () => {
    const i18n = await loadLanguage('en');
    const device: MomentSnapshot = {
      ...snapshot,
      location: { ...location, source: 'device', name: 'Private address', country: 'Private country' },
    };
    const text = moonCardText(device, DEFAULT_MOON_SETTINGS, i18n, 'example.test');
    expect(text.title).toBe(i18n.m.moment.devicePlace);
    expect(text.credit).toContain('Observer view');
    expect(Object.values(text).join(' ')).not.toMatch(/Private address|Private country|40\.7128|-74\.006/);
  });
});
