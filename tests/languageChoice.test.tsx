import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { scenarioProps } from '../src/dev/scenarios';
import { currentLanguage, type Locale } from '../src/i18n';
import { loadPreferences } from '../src/lib/persistence';

/**
 * Language downloads finishing in any order. Each switch is requested from the store at once (so it
 * takes its turn there, as in the app), but the app only hears it finished when the test opens its gate.
 */
const gates = new Map<Locale, () => void>();
vi.mock('../src/i18n', async (original) => {
  const actual = await original<typeof import('../src/i18n')>();
  return {
    ...actual,
    setLanguage: (locale: Locale) => {
      const loaded = actual.setLanguage(locale);
      return new Promise<void>((resolve) => gates.set(locale, resolve)).then(() => loaded);
    },
  };
});
vi.mock('../src/components/SkyScene', async () => ({
  default: (await import('react')).forwardRef(() => <div role="img" aria-label="Sky preview" />),
}));
afterEach(async () => {
  const { setLanguage } = await vi.importActual<typeof import('../src/i18n')>('../src/i18n');
  await act(() => setLanguage('en'));
  gates.clear();
});

const open = (locale: Locale) => act(async () => gates.get(locale)!());
const language = () => screen.getByRole('combobox', { name: /Interface language|界面语言/ });

it('keeps settings changed while a language loads', async () => {
  render(<App {...scenarioProps('night')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
  fireEvent.change(language(), { target: { value: 'zh-Hans' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Rendering quality' }), { target: { value: 'low' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reduce atmosphere motion' }));
  await open('zh-Hans');
  expect(loadPreferences().value).toMatchObject({ language: 'zh-Hans', quality: 'low', reducedMotion: true });
  expect(screen.getByRole('combobox', { name: '渲染质量' })).toHaveValue('low');
});

it('saves only the latest of overlapping choices, whichever finishes last', async () => {
  render(<App {...scenarioProps('night')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
  fireEvent.change(language(), { target: { value: 'zh-Hans' } });
  fireEvent.change(language(), { target: { value: 'en' } });
  await open('en');
  expect(loadPreferences().value.language).toBe('en');
  // The superseded Chinese choice finishes last: it is neither shown nor saved.
  await open('zh-Hans');
  expect(loadPreferences().value.language).toBe('en');
  expect(currentLanguage().locale).toBe('en');
  expect(language()).toHaveValue('en');
});
