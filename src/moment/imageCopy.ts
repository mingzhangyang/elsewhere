import type { Locale } from '../i18n/locale';

/**
 * Postcard-only copy lives beside the lazy image feature, not in the startup language chunks.
 * Keep both variants aligned and preserve the explicit image-only and weather disclosure.
 */
export const momentImageCopy = {
  en: {
    section: 'Keepsake image',
    framing: 'Image framing',
    autoFraming: 'Smart framing',
    currentFraming: 'Current view',
    clearSkyImage: 'Clear Sky for image (default; does not change the live sky or shared link)',
    clearSkyBadge: 'Clear Sky mode · clouds removed',
  },
  'zh-Hans': {
    section: '纪念图片',
    framing: '图片构图',
    autoFraming: '智能构图',
    currentFraming: '当前视角',
    clearSkyImage: '图片使用晴朗天空（默认；不改变实时天空或分享链接）',
    clearSkyBadge: 'Clear Sky 模式 · 已移除云层',
  },
} satisfies Record<
  Locale,
  {
    section: string;
    framing: string;
    autoFraming: string;
    currentFraming: string;
    clearSkyImage: string;
    clearSkyBadge: string;
  }
>;
