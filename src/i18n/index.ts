import { useSyncExternalStore } from 'react';
import type { Messages } from './en';
import type { Locale } from './locale';

export type { Messages } from './en';
export * from './locale';
// Shared by every catalog; exported here so it is part of the startup chunk, not a separate request.
export { formatters, type Formatters } from './format';

/** One loaded language: its messages and formatters. */
export interface I18n {
  locale: Locale;
  m: Messages;
}

/**
 * Each language is its own chunk, so startup downloads only the one being shown. The catalogs are
 * typed against the English one (`Messages`), and tests/i18n.test.ts compares their keys.
 */
const loaders: Record<Locale, () => Promise<{ default: Messages }>> = {
  en: () => import('./en'),
  'zh-Hans': () => import('./zh-Hans'),
};
const loaded = new Map<Locale, Promise<I18n>>();

export function loadLanguage(locale: Locale): Promise<I18n> {
  let pending = loaded.get(locale);
  if (!pending) {
    pending = loaders[locale]().then(({ default: m }) => ({ locale, m }));
    // A failed download (offline, a stale deployment) may be retried later.
    pending.catch(() => loaded.delete(locale));
    loaded.set(locale, pending);
  }
  return pending;
}

let active: I18n | null = null;
let request = 0;
const listeners = new Set<() => void>();

/**
 * Loads a language and makes it current. If several switches overlap, the last one asked for wins,
 * whichever download finishes first.
 */
export async function setLanguage(locale: Locale): Promise<I18n> {
  const ticket = ++request;
  const next = await loadLanguage(locale);
  if (ticket === request && active !== next) {
    active = next;
    applyToDocument(next);
    for (const listener of listeners) listener();
  }
  return next;
}

export function currentLanguage(): I18n {
  if (!active) throw new Error('No interface language is loaded; call setLanguage first.');
  return active;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The current language; components re-render when it changes. */
export function useI18n(): I18n {
  return useSyncExternalStore(subscribe, currentLanguage);
}

/** `lang`, title and description follow the interface, so screen readers and search use the right language. */
function applyToDocument({ locale, m }: I18n) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.title = m.document.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', m.document.description);
}
