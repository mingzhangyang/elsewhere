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

/** Shared labels for the inspector shortcut and the keepsake image controls. */
export const sdkImageCopy = {
  en: {
    moon: 'Realistic Moon',
    moonStyle: 'Moon',
    distance: 'Distance from observer',
    km: 'km',
    moonOpen: 'Open high-resolution Moon image',
    orientation: 'Moon orientation',
    observer: 'Observer view',
    northUp: 'Lunar north up',
    earthshine: 'Earthshine',
    background: 'Moon background',
    transparent: 'Transparent',
    dark: 'Dark',
    light: 'Light',
    resolution: 'PNG resolution',
    prepare: 'Prepare PNG',
    retry: 'Retry image',
    credit: 'NASA LROC lunar map · rendered for this sky moment',
  },
  'zh-Hans': {
    moon: '高清真实月相',
    moonStyle: '月相',
    distance: '距观测者',
    km: '公里',
    moonOpen: '查看高清真实月相图',
    orientation: '月相方向',
    observer: '观察者视角',
    northUp: '月球北极朝上',
    earthshine: '地球照',
    background: '月亮背景',
    transparent: '透明',
    dark: '深色',
    light: '浅色',
    resolution: 'PNG 分辨率',
    prepare: '生成 PNG',
    retry: '重试图片',
    credit: 'NASA LROC 月面地图 · 根据此刻的天空绘制',
  },
} satisfies Record<Locale, Record<string, string>>;
