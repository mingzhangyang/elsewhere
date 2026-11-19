import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import ObjectPanel from '../src/components/ObjectPanel';
import { scenarioProps } from '../src/dev/scenarios';
import { setLanguage } from '../src/i18n';
import { calculateSky } from '../src/domain/astronomy';
import { defaultWeatherValues } from '../src/domain/weather';
import { explorationUrl, loadPreferences, parseExploration, type Preferences } from '../src/lib/persistence';
import { interfaceText, latinWords } from './fixtures/latin';
import { NEW_YORK } from './fixtures/locations';

vi.mock('../src/components/SkyScene', async () => ({
  default: (await import('react')).forwardRef(() => <div role="img" aria-label="天空预览" />),
}));

/** English words anywhere a reader could see or hear them. */
const residualEnglish = () => interfaceText(document.body).flatMap((text) => latinWords(text));
async function audit() {
  const report = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
  expect(report.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }))).toEqual([]);
}
const check = async () => {
  expect(residualEnglish()).toEqual([]);
  await audit();
};

afterEach(async () => {
  await act(() => setLanguage('en'));
});

it('finds English when there is some, so the Chinese checks below are not vacuous', () => {
  render(<App {...scenarioProps('night')} />);
  expect(residualEnglish().length).toBeGreaterThan(50);
});

describe('the Chinese interface', () => {
  beforeEach(async () => {
    await setLanguage('zh-Hans');
  });

  it('sets the document language and shows no English in the primary flows', async () => {
    render(<App {...scenarioProps('night')} />);
    expect(document.documentElement.lang).toBe('zh-Hans');
    expect(document.title).toBe('Elsewhere · 互动星空模拟器');
    await waitFor(() => expect(screen.getByRole('button', { name: '天气预报' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('纽约');
    await check();
    fireEvent.click(screen.getByRole('button', { name: '更改日期和时间' }));
    await check();
    fireEvent.click(screen.getByRole('button', { name: '关闭时间编辑器' }));
    fireEvent.click(screen.getByRole('button', { name: /更改地点/ }));
    await check();
    fireEvent.click(screen.getByRole('button', { name: '关闭地点选择' }));
    fireEvent.click(screen.getByRole('button', { name: '天气' }));
    await check();
    fireEvent.click(screen.getByRole('button', { name: '自定义模拟' }));
    await check();
    fireEvent.click(screen.getByRole('button', { name: '图层' }));
    await check();
    fireEvent.click(screen.getByRole('button', { name: '天体' }));
    await check();
    const list = screen.getByRole('group', { name: '天体列表' });
    fireEvent.click(within(list).getByRole('button', { name: /土星/ }));
    expect(screen.getByRole('heading', { name: '土星' })).toBeInTheDocument();
    await check();
    fireEvent.click(screen.getByRole('button', { name: '在视图中居中' }));
    expect(screen.getByRole('region', { name: '已选天体' })).toHaveTextContent('土星');
    await check();
    fireEvent.click(screen.getByRole('button', { name: '天体' }));
    fireEvent.change(screen.getByRole('searchbox', { name: '查找天体' }), { target: { value: '月亮' } });
    fireEvent.click(screen.getByRole('button', { name: /月亮.*未升起/ }));
    await check();
    fireEvent.click(screen.getByRole('button', { name: '跳到下次升起' }));
    await check();
    fireEvent.click(screen.getByRole('button', { name: '分享这片天空' }));
    await check();
  }, 30000);

  it('explains a daytime sky in Chinese, Venus and the planets included', async () => {
    render(<App {...scenarioProps('venus')} />);
    fireEvent.click(screen.getByRole('button', { name: '天体' }));
    fireEvent.click(screen.getByRole('button', { name: '全部天体' }));
    for (const name of ['太阳', '金星', '木星']) {
      fireEvent.click(
        within(screen.getByRole('group', { name: '天体列表' })).getByRole('button', {
          name: new RegExp(name),
        }),
      );
      fireEvent.click(screen.getByText('关于此天体与坐标'));
      expect(residualEnglish()).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: '全部天体' }));
    }
  });

  it('keeps a catalog name without a Chinese name in Latin script, marked as such', () => {
    const sky = calculateSky(NEW_YORK, new Date('2026-11-13T04:00Z'));
    render(
      <ObjectPanel
        sky={sky}
        timeZone={NEW_YORK.timezone}
        selectedId={sky.stars.find((star) => star.name === 'Zubenelhakrabi')!.id}
        preferences={preferences}
        weather={defaultWeatherValues()}
        clearSky={false}
        onSelect={() => {}}
        onFocus={() => {}}
        onRise={() => {}}
        onClearSky={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Zubenelhakrabi' })).toHaveAttribute('lang', 'en');
    expect(residualEnglish()).toEqual([]);
  });
});

describe('searching', () => {
  const panel = () => {
    const sky = calculateSky(NEW_YORK, new Date('2026-11-13T04:00Z'));
    render(
      <ObjectPanel
        sky={sky}
        timeZone={NEW_YORK.timezone}
        selectedId={null}
        preferences={preferences}
        weather={defaultWeatherValues()}
        clearSky={false}
        onSelect={() => {}}
        onFocus={() => {}}
        onRise={() => {}}
        onClearSky={() => {}}
      />,
    );
  };
  const results = (query: string, label: string, box: string) => {
    fireEvent.change(screen.getByRole('searchbox', { name: box }), { target: { value: query } });
    return within(screen.getByRole('group', { name: label }))
      .queryAllByRole('button')
      .map((button) => button.textContent);
  };

  it('finds the same star by its Chinese and its English name in Chinese', async () => {
    await setLanguage('zh-Hans');
    panel();
    const chinese = results('天狼', '天体列表', '查找天体');
    expect(chinese).toHaveLength(1);
    expect(chinese[0]).toContain('天狼星');
    expect(results('sirius', '天体列表', '查找天体')).toEqual(chinese);
    expect(results('Jupiter', '天体列表', '查找天体')[0]).toContain('木星');
    expect(results('行星', '天体列表', '查找天体')).toHaveLength(5);
  });

  it('keeps English search as it was', () => {
    panel();
    expect(results('Sirius', 'Celestial objects', 'Find an object')[0]).toContain('Sirius');
    // "planets" lists the planets from its third letter, as before.
    expect(results('pl', 'Celestial objects', 'Find an object').join()).not.toContain('Mars');
    expect(results('pla', 'Celestial objects', 'Find an object').join()).toContain('Mars');
  });
});

describe('choosing a language', () => {
  it('switches from Settings, saves the choice and can return to following the browser', async () => {
    render(<App {...scenarioProps('night')} />);
    expect(document.documentElement.lang).toBe('en');
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Interface language' }), {
      target: { value: 'zh-Hans' },
    });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '界面语言' })).toHaveValue('zh-Hans'));
    expect(document.documentElement.lang).toBe('zh-Hans');
    expect(screen.getByRole('button', { name: '天体' })).toBeInTheDocument();
    expect(loadPreferences().value.language).toBe('zh-Hans');
    // The notice and the sky's own text change with it, without reloading.
    expect(screen.getByRole('region', { name: '天空概况' })).toHaveTextContent('当地时间');
    fireEvent.change(screen.getByRole('combobox', { name: '界面语言' }), { target: { value: 'auto' } });
    // jsdom's browser language is English.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Objects' })).toBeInTheDocument());
    expect(loadPreferences().value.language).toBe('auto');
  });

  it('rewords a notice already on screen when the language changes', async () => {
    window.location.hash = '#sky=broken';
    try {
      render(<App />);
      expect(screen.getByText(/This sky link is invalid/)).toBeInTheDocument();
      await act(() => setLanguage('zh-Hans'));
      expect(screen.getByText('这个星空链接无效或不受支持，已为你打开新的探索。')).toBeInTheDocument();
    } finally {
      window.location.hash = '';
    }
  });

  it('rewords a time-editor or place error already shown when the language changes', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (_: PositionCallback, failure: PositionErrorCallback) =>
          failure({ code: 1 } as GeolocationPositionError),
      },
    });
    render(<App {...scenarioProps('night')} />);
    // A wall time skipped by the March clock change in New York.
    fireEvent.click(screen.getByRole('button', { name: 'Change date and time' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-03-08' } });
    fireEvent.change(screen.getByLabelText('Local time'), { target: { value: '02:30' } });
    expect(screen.getByRole('alert')).toHaveTextContent('This time does not exist');
    fireEvent.click(screen.getByRole('button', { name: 'Close time editor' }));
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(
      screen.getByText('Location permission was denied. Search for a place instead.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close locations' }));

    await act(() => setLanguage('zh-Hans'));
    fireEvent.click(screen.getByRole('button', { name: '更改日期和时间' }));
    expect(screen.getByRole('alert')).toHaveTextContent('时钟在此拨快，这个时间并不存在。请选择其他时间。');
    fireEvent.click(screen.getByRole('button', { name: '关闭时间编辑器' }));
    fireEvent.click(screen.getByRole('button', { name: /更改地点/ }));
    expect(screen.getByText('定位权限被拒绝。请改为搜索地点。')).toBeInTheDocument();
    expect(residualEnglish()).toEqual([]);
  });

  it('keeps preferences saved before the language setting existed, and rejects unknown languages', () => {
    const old = {
      version: 1,
      layers: { stars: true, lines: true, labels: false },
      saved: [],
      recent: [],
      hintDismissed: true,
      reducedMotion: false,
      quality: 'high',
      horizon: 'flat',
      skyBrightness: 'city',
    };
    localStorage.setItem('elsewhere.preferences.v1', JSON.stringify(old));
    expect(loadPreferences()).toEqual({ value: { ...old, language: 'auto', moonDisplayAid: true }, notice: null });
    localStorage.setItem('elsewhere.preferences.v1', JSON.stringify({ ...old, language: 'zh-Hans' }));
    expect(loadPreferences().value.language).toBe('zh-Hans');
    localStorage.setItem('elsewhere.preferences.v1', JSON.stringify({ ...old, language: 'fr' }));
    expect(loadPreferences().value).toMatchObject({ language: 'auto', quality: 'high' });
  });

  it('never puts the language in a shared link, and ignores one if present', async () => {
    await setLanguage('zh-Hans');
    const exploration = {
      version: 1 as const,
      location: NEW_YORK,
      instant: '2026-11-13T04:00:00.000Z',
      camera: { heading: 180, altitude: 40, fov: 60 },
      layers: { stars: true, lines: false, labels: true },
      custom: null,
    };
    const link = explorationUrl(exploration);
    expect(decodeURIComponent(link)).not.toMatch(/language|zh/);
    const withLanguage =
      '#sky=' + encodeURIComponent(JSON.stringify({ ...exploration, language: 'zh-Hans' }));
    expect(parseExploration(withLanguage)).toEqual({ value: exploration, notice: null });
  });
});

const preferences: Preferences = {
  version: 1,
  layers: { stars: true, lines: false, labels: true },
  saved: [],
  recent: [],
  hintDismissed: false,
  reducedMotion: false,
  quality: 'auto',
  horizon: 'flat',
  skyBrightness: 'dark',
  language: 'auto',
  moonDisplayAid: true,
};
