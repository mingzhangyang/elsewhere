import { describe, expect, it } from 'vitest';
import { LOCALES } from '../src/i18n/locale';
import { momentImageCopy } from '../src/moment/imageCopy';

describe('lazy postcard-only translations', () => {
  it('covers every supported language without losing the weather disclosure', () => {
    expect(Object.keys(momentImageCopy).sort()).toEqual([...LOCALES].sort());
    for (const locale of LOCALES) {
      expect(momentImageCopy[locale].section.length).toBeGreaterThan(3);
      expect(momentImageCopy[locale].note.length).toBeGreaterThan(10);
      expect(momentImageCopy[locale].clearSkyImage.length).toBeGreaterThan(8);
      expect(momentImageCopy[locale].clearSkyBadge).toContain('Clear Sky');
    }
    expect(momentImageCopy.en.note).toContain('picture of this moment');
    expect(momentImageCopy['zh-Hans'].section).toContain('图片');
    expect(momentImageCopy.en.clearSkyImage).toContain('live sky or shared link');
    expect(momentImageCopy['zh-Hans'].clearSkyImage).toContain('分享链接');
    expect(momentImageCopy.en.clearSkyBadge).toContain('clouds removed');
    expect(momentImageCopy['zh-Hans'].clearSkyBadge).toContain('已移除云层');
  });
});
