/**
 * Finds English left in Chinese interface text: any run of two or more Latin letters, after removing
 * the names and symbols that stay in Latin script in Chinese too. Elements marked with another
 * `lang` (catalog star names kept in Latin, the "English" language option) are skipped by the callers.
 */
export const ALLOWED_LATIN = [
  // Product, data sources and libraries: proper names.
  'Open-Meteo',
  'Astronomy Engine',
  'elsewhere',
  'Elsewhere',
  'HYG',
  // Units, time standards and catalog notation.
  'km/h',
  'mm/h',
  'km',
  'hPa',
  'UTC',
  'GMT',
  'J2000',
  'HTTP',
  // The key as printed on keyboards.
  'Home',
];

export function latinWords(text: string, allowed: readonly string[] = ALLOWED_LATIN): string[] {
  let rest = text;
  // Longest first, so "Open-Meteo" goes before any shorter overlap.
  for (const phrase of [...allowed].sort((a, b) => b.length - a.length)) rest = rest.split(phrase).join(' ');
  return rest.match(/[A-Za-z]{2,}/g) ?? [];
}

/**
 * Every piece of text a person can see or hear in `root`: text nodes, and the accessible names,
 * descriptions and placeholders in attributes. Runs in a browser page or jsdom, so it is self-contained.
 */
export function interfaceText(root: Element): string[] {
  const html = root.ownerDocument.documentElement;
  // Inside the page, an element whose own language is not Chinese (the document's lang is the
  // interface language and does not count).
  const foreign = (element: Element | null) => {
    if (!element || element.closest('script, style, noscript, template')) return true;
    const tagged = element.closest('[lang]');
    return !!tagged && tagged !== html && !tagged.getAttribute('lang')!.startsWith('zh');
  };
  const texts: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.trim() && !foreign(node.parentElement)) texts.push(node.textContent);
  }
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (foreign(element)) continue;
    for (const name of ['aria-label', 'aria-valuetext', 'placeholder', 'title', 'alt'])
      if (element.getAttribute(name)) texts.push(element.getAttribute(name)!);
  }
  return texts;
}
