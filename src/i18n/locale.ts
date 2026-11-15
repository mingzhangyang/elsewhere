/**
 * Interface languages. English is the source language; Chinese is Simplified Chinese (zh-Hans).
 * Traditional Chinese is not offered yet: browsers asking for zh-TW, zh-HK or any other Chinese get
 * Simplified Chinese, which their readers can read far more easily than English; Settings can
 * switch to English.
 */
export const LOCALES = ['en', 'zh-Hans'] as const;
export type Locale = (typeof LOCALES)[number];
/** The saved choice: a language, or 'auto' to follow the browser. */
export type LanguageSetting = 'auto' | Locale;

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === 'auto' || (LOCALES as readonly unknown[]).includes(value);
}

/** The first browser language the app has, in the reader's order of preference; English otherwise. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const language = tag.toLowerCase().split(/[-_]/)[0];
    if (language === 'zh') return 'zh-Hans';
    if (language === 'en') return 'en';
  }
  return 'en';
}

export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

export function resolveLocale(setting: LanguageSetting, languages = browserLanguages()): Locale {
  return setting === 'auto' ? detectLocale(languages) : setting;
}
