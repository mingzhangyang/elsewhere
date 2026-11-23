import type { MemorialTimeFields } from '../components/MemorialTimeForm';
import type { SkyArtworkTheme } from './skyArtwork';

/** Private to this tab's live route shell; never serialized into a link or preferences. */
export interface SkyCreatorDraft {
  readonly time?: MemorialTimeFields;
  readonly title: string;
  readonly phrase: string;
  readonly theme: SkyArtworkTheme;
}

/** Display-length contract counts user-visible characters, not UTF-16 code units. */
export function limitArtworkText(value: string, max: number): string {
  return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value)]
    .slice(0, max)
    .map((part) => part.segment)
    .join('');
}
