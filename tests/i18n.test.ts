import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en, { type Messages } from '../src/i18n/en';
import zh from '../src/i18n/zh-Hans';
import { detectLocale, isLanguageSetting, LOCALES } from '../src/i18n';
import type { Visibility } from '../src/lib/exploration';
import type { NetworkFailure, WeatherIssue } from '../src/types';
import { weatherIssueText } from '../src/lib/weatherText';
import { STAR_CATALOG } from '../src/domain/stars';
import { getPhase } from '../src/domain/astronomy';
import { latinWords } from './fixtures/latin';

const catalogs: Record<(typeof LOCALES)[number], Messages> = { en, 'zh-Hans': zh };

/** The shape of a catalog: every key path, with what kind of value it holds. */
function shape(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [`${path}: function`];
  // Lists may differ in length (search words), except the eight compass points.
  if (Array.isArray(value)) return [`${path}: array${path === 'directions' ? `(${value.length})` : ''}`];
  if (value && typeof value === 'object') {
    // The formatters and the open-ended name tables differ by design: compared by type only.
    if (['f', 'starNames', 'places'].includes(path)) return [`${path}: table`];
    return Object.keys(value)
      .sort()
      .flatMap((key) => shape((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key));
  }
  return [`${path}: ${typeof value}`];
}

describe('message catalogs', () => {
  it('have exactly the same keys in every language', () => {
    const reference = shape(en);
    for (const [locale, catalog] of Object.entries(catalogs))
      expect(shape(catalog), `${locale} keys`).toEqual(reference);
  });

  it('would fail on a missing or extra key', () => {
    const { brand, ...missing } = zh;
    expect(shape(missing)).not.toEqual(shape(en));
    expect(shape({ ...zh, brand: { ...brand, extra: '' } })).not.toEqual(shape(en));
  });

  it('leave no empty message', () => {
    const empty = (value: unknown, path: string): string[] =>
      typeof value === 'string'
        ? value.trim()
          ? []
          : [path]
        : value && typeof value === 'object' && !['f'].includes(path)
          ? Object.entries(value).flatMap(([key, child]) => empty(child, `${path}.${key}`))
          : [];
    expect(empty(zh, 'zh')).toEqual([]);
    expect(empty(en, 'en')).toEqual([]);
  });

  it('give every language each of the five planets, the Sun, the Moon, the phases and the patterns', () => {
    expect(zh.bodies).toEqual({
      sun: '太阳',
      moon: '月亮',
      mercury: '水星',
      venus: '金星',
      mars: '火星',
      jupiter: '木星',
      saturn: '土星',
    });
    for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) expect(zh.phases[getPhase(angle)]).toBeTruthy();
    expect(Object.values(zh.patterns)).toEqual([
      '北斗七星 · 星群',
      '猎户座',
      '南十字座',
      '夏季大三角 · 星群',
    ]);
  });
});

describe('Chinese star names', () => {
  const named = STAR_CATALOG.filter((star) => star.name);

  it('name only stars that are in the catalog, each with its own name', () => {
    const catalogNames = new Set(named.map((star) => star.name));
    expect(Object.keys(zh.starNames).filter((name) => !catalogNames.has(name))).toEqual([]);
    const values = Object.values(zh.starNames);
    expect(values.filter((name, i) => values.indexOf(name) !== i)).toEqual([]);
    for (const name of values) expect(latinWords(name), name).toEqual([]);
  });

  it('cover every star bright enough to be labelled in the sky, and nearly every star to magnitude 3', () => {
    // Labels are drawn for named stars brighter than magnitude 1.35 (renderer/celestialLayers.ts).
    expect(named.filter((s) => s.magnitude < 1.35 && !zh.starNames[s.name]).map((s) => s.name)).toEqual([]);
    expect(named.filter((s) => s.magnitude < 2.5 && !zh.starNames[s.name]).map((s) => s.name)).toEqual([]);
    // Two names without a Chinese name we could confirm stay in Latin script; fainter stars too.
    expect(named.filter((s) => s.magnitude < 3 && !zh.starNames[s.name]).map((s) => s.name)).toEqual([
      'Tureis',
      'Okab',
    ]);
  });

  it('use the common Chinese names the roadmap names', () => {
    expect(zh.starNames.Sirius).toBe('天狼星');
    expect(zh.starNames.Vega).toBe('织女星');
  });
});

describe('Chinese sentences', () => {
  const visibilities: Visibility[] = [
    { reason: 'horizon' },
    { reason: 'near-sun', elongation: 12.4 },
    { reason: 'layer' },
    { reason: 'ridge' },
    { reason: 'daylight', subject: 'star', glare: false, elongation: 0 },
    { reason: 'daylight', subject: 'planet', glare: true, elongation: 9 },
    { reason: 'daylight', subject: 'planet', glare: false, elongation: 40 },
    { reason: 'cloud', cloudCover: 91 },
    { reason: 'haze' },
    { reason: 'twilight', subject: 'star' },
    { reason: 'twilight', subject: 'planet' },
    { reason: 'faint' },
    { reason: 'phase' },
    { reason: 'daylight-moon' },
    { reason: 'partial-cloud' },
    { reason: 'clear', subject: 'star', brighterThanAnyStar: false },
    { reason: 'clear', subject: 'planet', brighterThanAnyStar: true },
    { reason: 'clear', subject: 'moon', brighterThanAnyStar: false },
  ];

  it('explain every visibility case without English, naming the object where it matters', () => {
    for (const visibility of visibilities) {
      const { label, detail } = zh.visibility(visibility, '金星');
      expect(latinWords(label + detail), JSON.stringify(visibility)).toEqual([]);
      if ('subject' in visibility && visibility.subject === 'planet') expect(detail).toContain('金星');
    }
    expect(zh.visibility({ reason: 'near-sun', elongation: 12.4 }, '水星').detail).toBe(
      '水星与太阳仅相距 12°。切勿直视太阳，也不要把双筒望远镜或天文望远镜指向太阳附近。',
    );
  });

  it('keep the English explanations as they were', () => {
    expect(en.visibility({ reason: 'cloud', cloudCover: 91.4 }, 'Moon').detail).toBe(
      '91% cloud cover may obscure this object. The marker shows its calculated position.',
    );
    expect(
      en.visibility({ reason: 'clear', subject: 'moon', brighterThanAnyStar: false }, 'Moon').detail,
    ).toBe('Centering frames the Moon at true scale; zoom out to see it among the sky.');
    expect(en.visibility({ reason: 'twilight', subject: 'star' }, 'Vega').detail).toBe(
      'Twilight still brightens the sky too much for this star. It appears as the sky darkens.',
    );
  });

  it('word every weather and network problem without English', () => {
    const failures: NetworkFailure[] = [
      { kind: 'timeout' },
      { kind: 'offline' },
      { kind: 'unreachable' },
      { kind: 'unreadable' },
      { kind: 'invalid' },
      { kind: 'failed' },
      { kind: 'http', status: 503 },
    ];
    for (const failure of failures)
      for (const service of ['weather', 'search'] as const)
        expect(latinWords(zh.network(failure, service)), `${failure.kind} ${service}`).toEqual([]);
    const codes = Object.keys(en.weather.issue).filter((code) => code !== 'provider');
    for (const code of codes)
      expect(latinWords(weatherIssueText({ code } as WeatherIssue, zh)), code).toEqual([]);
    // The provider's own reason is quoted as it came, in English.
    expect(weatherIssueText({ code: 'provider', reason: 'Invalid range' }, zh)).toBe(
      '天气服务：Invalid range',
    );
  });

  it('use Chinese plural-free counts and English plurals', () => {
    expect(en.objects.count({ count: 1, shown: 40 })).toBe('1 matching object.');
    expect(en.objects.count({ count: 2, shown: 40 })).toBe('2 matching objects.');
    expect(zh.objects.count({ count: 1, shown: 40 })).toBe('共 1 个匹配的天体。');
    expect(zh.objects.count({ count: 5077, shown: 40 })).toBe(
      '显示 5077 个中的前 40 个。可按名称或 HYG 编号搜索更多。',
    );
  });

  it('order the share sentence for each language, with or without its optional parts', () => {
    expect(en.share.includes({ focus: 'Jupiter', customWeather: true })).toBe(
      'This link includes the place, exact time, camera view centered on Jupiter, layers, and custom weather.',
    );
    expect(en.share.includes({ customWeather: false })).toBe(
      'This link includes the place, exact time, camera view, layers.',
    );
    expect(zh.share.includes({ focus: '木星', customWeather: true })).toBe(
      '此链接包含地点、精确时间、以木星为中心的视角、图层和自定义天气。',
    );
    expect(zh.share.includes({ customWeather: false })).toBe('此链接包含地点、精确时间、视角、图层。');
  });

  it('format dates, times, numbers and lists for the language', () => {
    const instant = new Date('2026-11-15T20:05:00Z');
    expect(zh.f.date(instant, 'UTC')).toBe('2026年11月15日周日');
    expect(en.f.date(instant, 'UTC')).toBe('Sun, Nov 15, 2026');
    expect(zh.f.time(instant, 'UTC')).toBe('20:05');
    expect(en.f.time(instant, 'UTC')).toBe('8:05 PM');
    expect(zh.f.list(['金星', '木星', '土星'])).toBe('金星、木星和土星');
    expect(zh.f.zone('America/New_York', instant)).toBe('北美东部时间');
    expect(en.f.zone('America/New_York', instant)).toBe('America/New York');
    expect(en.f.number(-0.04, 1)).toBe('0.0');
    expect(en.f.number(384400)).toBe('384,400');
    expect(en.f.number(1013, 0, false)).toBe('1013');
  });
});

describe('choosing the language', () => {
  it('follows the first browser language the app has, defaulting to English', () => {
    expect(detectLocale(['zh-CN'])).toBe('zh-Hans');
    expect(detectLocale(['zh'])).toBe('zh-Hans');
    // Traditional Chinese readers get Simplified Chinese until a Traditional catalog exists.
    expect(detectLocale(['zh-TW', 'en-US'])).toBe('zh-Hans');
    expect(detectLocale(['zh-Hant-HK'])).toBe('zh-Hans');
    expect(detectLocale(['en-GB', 'zh-CN'])).toBe('en');
    expect(detectLocale(['de-DE', 'zh-CN'])).toBe('zh-Hans');
    expect(detectLocale(['fr-FR', 'de'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('accepts only known settings', () => {
    expect(['auto', 'en', 'zh-Hans'].every(isLanguageSetting)).toBe(true);
    expect([undefined, 'zh', 'zh-TW', 'fr', 1].some(isLanguageSetting)).toBe(false);
  });

  it('ships a translated credits page beside the English one, with the same links', () => {
    const links = (file: string) =>
      [...readFileSync(`public/${file}`, 'utf8').matchAll(/href="([^"]+)"/g)]
        .map((m) => m[1])
        .filter((href) => !href.startsWith('credits') && href !== './');
    expect(links(zh.settings.creditsPage)).toEqual(links(en.settings.creditsPage));
    expect(readFileSync('public/credits.zh-Hans.html', 'utf8')).toContain('<html lang="zh-Hans">');
  });
});
