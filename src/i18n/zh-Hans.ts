import type { NetworkFailure } from '../types';
import type { Visibility } from '../lib/exploration';
import type { NetworkService } from '../lib/networkErrors';
import type { Messages, PlanetShape } from './en';
import { formatters } from './format';

/**
 * 简体中文消息目录。键与英文目录（en.ts）一一对应，类型由 `Messages` 约束；缺键或多键都会让
 * 类型检查和 tests/i18n.test.ts 失败。
 */
const f = formatters('zh-Hans', 'generic');

const PLANET_SHAPES: Record<PlanetShape, string> = {
  'thin-crescent': '细蛾眉',
  crescent: '蛾眉',
  half: '半亮',
  gibbous: '凸面',
  full: '接近满相',
};

const SERVICE: Record<NetworkService, { name: string; retry: string; what: string }> = {
  weather: { name: '天气服务', retry: '请稍后刷新。', what: '天气' },
  search: { name: '地点搜索', retry: '请重试。', what: '地点' },
};

/**
 * 亮星的通用中文名，按 HYG 星表中的英文专名索引。多为中国传统星名（如参宿四、轩辕十四），这是
 * 中文里指称这些恒星的通行叫法；星座和连线图案另有名称，与中国传统星官是两套体系，不相对应。
 * 没有收录的恒星显示其星表名称。
 */
const STAR_NAMES: Record<string, string> = {
  Sirius: '天狼星',
  Canopus: '老人星',
  Arcturus: '大角星',
  'Rigil Kentaurus': '南门二A',
  Toliman: '南门二B',
  Vega: '织女星',
  Capella: '五车二',
  Rigel: '参宿七',
  Procyon: '南河三',
  Achernar: '水委一',
  Betelgeuse: '参宿四',
  Hadar: '马腹一',
  Altair: '牛郎星',
  Acrux: '十字架二',
  Aldebaran: '毕宿五',
  Spica: '角宿一',
  Antares: '心宿二',
  Pollux: '北河三',
  Fomalhaut: '北落师门',
  Mimosa: '十字架三',
  Deneb: '天津四',
  Regulus: '轩辕十四',
  Adhara: '弧矢七',
  Castor: '北河二',
  'Castor B': '北河二B',
  Gacrux: '十字架一',
  Imai: '十字架四',
  Shaula: '尾宿八',
  Bellatrix: '参宿五',
  Elnath: '五车五',
  Miaplacidus: '南船五',
  Alnilam: '参宿二',
  Alnair: '鹤一',
  Tiaki: '鹤二',
  Alnitak: '参宿一',
  Mintaka: '参宿三',
  Saiph: '参宿六',
  Hatysa: '伐三',
  Mirfak: '天船三',
  Algol: '大陵五',
  'Kaus Australis': '箕宿三',
  'Kaus Media': '箕宿二',
  Alnasl: '箕宿一',
  'Kaus Borealis': '斗宿二',
  Nunki: '斗宿四',
  Ascella: '斗宿六',
  Albaldah: '建三',
  // 北斗七星用各自的通用名。
  Dubhe: '天枢',
  Merak: '天璇',
  Phecda: '天玑',
  Megrez: '天权',
  Alioth: '玉衡',
  Mizar: '开阳',
  Alkaid: '摇光',
  Alcor: '辅',
  Wezen: '弧矢一',
  Aludra: '弧矢二',
  Mirzam: '军市一',
  Avior: '海石一',
  Aspidiske: '海石二',
  Sargas: '尾宿五',
  Larawag: '尾宿二',
  Lesath: '尾宿九',
  Menkalinan: '五车三',
  Mahasim: '五车四',
  Hassaleh: '五车一',
  Atria: '三角形三',
  Alhena: '井宿三',
  Tejat: '井宿一',
  Alsephina: '天社三',
  Markeb: '天社五',
  Suhail: '天记',
  Naos: '弧矢增二十二',
  Peacock: '孔雀十一',
  Polaris: '北极星',
  Kochab: '北极二',
  Thuban: '右枢',
  Alphard: '星宿一',
  Hamal: '娄宿三',
  Sheratan: '娄宿一',
  Algieba: '轩辕十二',
  'Ras Elased Australis': '轩辕九',
  Zosma: '西上相',
  Denebola: '五帝座一',
  Porrima: '东上相',
  Vindemiatrix: '东次将',
  Diphda: '土司空',
  Menkar: '天囷一',
  Menkent: '库楼三',
  Alpheratz: '壁宿二',
  Algenib: '壁宿一',
  Mirach: '奎宿九',
  Almach: '天大将军一',
  Rasalhague: '候',
  Rasalgethi: '帝座',
  Kornephoros: '河中',
  Sabik: '宋',
  'Yed Prior': '梁',
  Cebalrai: '宗正一',
  Unukalhai: '天市右垣七',
  Cih: '策',
  Schedar: '王良四',
  Caph: '王良一',
  Ruchbah: '阁道三',
  Alphecca: '贯索四',
  Sadr: '天津一',
  Fawaris: '天津二',
  Aljanah: '天津九',
  Albireo: '辇道增七',
  Tarazed: '河鼓三',
  Eltanin: '天棓四',
  Rastaban: '天棓三',
  Athebyne: '少宰',
  Dschubba: '房宿三',
  Acrab: '房宿四',
  Fang: '房宿一',
  Alniyat: '心宿一',
  Paikauhale: '心宿三',
  Izar: '梗河一',
  Muphrid: '右摄提一',
  'Cor Caroli': '常陈一',
  Enif: '危宿三',
  Markab: '室宿一',
  Scheat: '室宿二',
  Matar: '离宫四',
  Sadalsuud: '虚宿一',
  Sadalmelik: '危宿一',
  'Deneb Algedi': '垒壁阵四',
  Ankaa: '火鸟六',
  Alderamin: '天钩五',
  Gienah: '轸宿一',
  Kraz: '轸宿四',
  Algorab: '轸宿三',
  Zubeneschamali: '氐宿四',
  Zubenelgenubi: '氐宿一',
  Arneb: '厕一',
  Nihal: '厕二',
  Phact: '丈人一',
  Cursa: '玉井三',
  Zaurak: '天苑一',
  Acamar: '天园六',
  Gomeisa: '南河二',
  Alcyone: '昴宿六',
  Tianguan: '天关',
};

const zh: Messages = {
  f,
  document: {
    title: 'Elsewhere · 互动星空模拟器',
    description: '沉浸式互动星空模拟器：选择地球上的任意地点和时刻，看看那里的天空。',
  },
  brand: {
    home: 'Elsewhere 首页',
    tagline: '换个角度看天空',
    footer: '此时此地的天空',
  },
  bodies: {
    sun: '太阳',
    moon: '月亮',
    mercury: '水星',
    venus: '金星',
    mars: '火星',
    jupiter: '木星',
    saturn: '土星',
  },
  starNames: STAR_NAMES,
  patterns: {
    'big-dipper': '北斗七星 · 星群',
    orion: '猎户座',
    crux: '南十字座',
    'summer-triangle': '夏季大三角 · 星群',
  },
  phases: {
    new: '新月',
    'waxing-crescent': '蛾眉月',
    'first-quarter': '上弦月',
    'waxing-gibbous': '盈凸月',
    full: '满月',
    'waning-gibbous': '亏凸月',
    'last-quarter': '下弦月',
    'waning-crescent': '残月',
  },
  places: {
    'new-york': { name: '纽约', country: '美国' },
    beijing: { name: '北京', country: '中国' },
    tokyo: { name: '东京', country: '日本' },
    london: { name: '伦敦', country: '英国' },
    reykjavik: { name: '雷克雅未克', country: '冰岛' },
    sydney: { name: '悉尼', country: '澳大利亚' },
    cairo: { name: '开罗', country: '埃及' },
    antarctica: { name: '麦克默多站', country: '南极洲' },
  },
  device: {
    name: '你的位置',
    country: '设备坐标 · 按海平面估算',
  },
  directions: ['北', '东北', '东', '东南', '南', '西南', '西', '西北'],
  facing: ({ direction, degrees }) => `朝向${direction}，${degrees} 度`,
  sky: {
    mood: {
      day: '阳光下的此刻',
      changing: '天色正在变化',
      twilight: '昼夜之间',
      night: '满天星斗，皆有可能',
    },
    exploration: '星空探索',
    scene: '可交互的三维天空',
    canvas: '天空视图。方向键环顾四周，加号和减号缩放，Home 键复位视角。可在天体列表中选择天体。',
    targetLabel: ({ name }) => `${name} · 位置`,
    startFailed: '三维天空无法启动。下方的天文计算结果仍可使用。',
    loadFailed: '三维天空加载失败。请检查网络连接后重试。',
    contextLost: '图形连接中断了。请重试；你选择的地点、时间和视角都会保留。',
    retry: '重新加载天空',
    summaryRegion: '天空概况',
    summary: ({ place, time, sunAltitude, phase, illumination, planets, source }) =>
      `${place}。当地时间 ${time}。太阳高度 ${f.number(sunAltitude)} 度。月相为${phase}，照亮 ${f.number(illumination)}%。` +
      (planets.length ? `地平线以上的行星：${f.list(planets)}。` : '') +
      `${source}。`,
    footerReadout: ({ sunAltitude, illumination }) =>
      `太阳 ${f.number(sunAltitude, 1)}° · 月亮照亮 ${f.number(illumination)}%`,
    weatherCredit: '天气数据：Open-Meteo',
  },
  controls: {
    share: '分享这片天空',
    zoomIn: '放大',
    zoomOut: '缩小',
    resetView: '复位视角',
    showControls: '显示控件',
    hideControls: '隐藏控件',
    explore: '探索控件',
    objects: '天体',
    weather: '天气',
    layers: '图层',
    dismissNotice: '关闭提示',
  },
  hint: {
    title: '你想看向哪里？',
    gestures: '拖动探索 · 方向键环顾 · 双指捏合或 + / − 缩放',
    findMoon: '找到月亮',
    dismiss: '关闭操作提示',
  },
  inspector: {
    region: { objects: '天体面板', weather: '天气面板', settings: '设置面板' },
    title: { objects: '探索星空', weather: '天气与大气', settings: '定制你的视图' },
    close: '关闭面板',
  },
  atmosphere: {
    restore: '恢复大气效果',
    restoreCustom: '恢复自定义大气',
    restoreWeather: '恢复天气大气',
    previewClear: '预览晴朗天空',
    clearPreview: '晴空预览',
    custom: '自定义模拟',
    neutral: ' · 中性天空',
    previewNotice: '天空暂时设为晴朗，方便探索。下方仍显示原始天气数据。',
  },
  notices: {
    'stars-unavailable': '星表加载失败。太阳和月亮仍可查看；可在“天体”面板中重试。',
    'offline-unavailable': '无法启用离线缓存。当前页面仍可正常使用，但离线重新加载可能需要网络连接。',
    'preferences-not-saved': '更改已生效，但此浏览器无法保存你的偏好设置。',
    'preferences-unreadable': '无法读取已保存的设置，已改用默认设置。',
    'invalid-link': '这个星空链接无效或不受支持，已为你打开新的探索。',
    'no-rise': '在支持的日期范围内找不到下一次升起。请换个地点或日期。',
    'rise-failed': '无法计算这次升起。请换个日期或地点。',
    'copy-manually': '请选中链接，用键盘复制。',
    'moon-map-unavailable': '月面贴图加载失败。月亮的位置和月相仍然准确。',
    'language-unavailable': '该语言加载失败。请检查网络连接后重试。',
  },
  focus: {
    region: '已选天体',
    clear: '取消选择天体',
    recenter: '重新居中',
    enableStars: '显示恒星',
    jumpToRise: '跳到下次升起',
  },
  objects: {
    back: '全部天体',
    kind: { star: '恒星', planet: '行星', solar: '太阳系' },
    center: '在视图中居中',
    starTimeline: '可以拖动时间轴，看看这颗恒星何时升到地平线以上。',
    altitude: '高度角',
    azimuth: '方位角',
    moonPhase: ({ phase, illumination }) => `${phase} · 照亮 ${f.number(illumination)}%`,
    planetBrightness: ({ magnitude, phase }) =>
      `星等 ${f.number(magnitude, 1)}` +
      (phase ? ` · ${PLANET_SHAPES[phase.shape]}，照亮 ${f.number(phase.illumination)}%` : ''),
    planetPhaseLabel: ({ name, shape, illumination }) =>
      `${name}：${PLANET_SHAPES[shape]}，照亮 ${f.number(illumination)}%`,
    apparition: ({ apparition, elongation }) =>
      apparition === 'opposition'
        ? `位于太阳对面，与太阳相距 ${f.number(elongation)}°：整夜大部分时间都在天上。`
        : apparition === 'evening'
          ? `昏星：位于太阳以东 ${f.number(elongation)}°。`
          : `晨星：位于太阳以西 ${f.number(elongation)}°。`,
    rises: '今日升起',
    sets: '今日落下',
    noRise: '今日不升起',
    noSet: '今日不落下',
    solarNoon: '正午',
    noTransit: '今日无中天',
    daylight: '白昼时长',
    daylightHours: ({ hours }) => `${f.number(hours, 1)} 小时`,
    polarDay: '今天太阳始终在地平线以上。',
    polarNight: '今天太阳始终在地平线以下。',
    partialDay: '今天的开始或结束处于白昼之中。',
    facts: '关于此天体与坐标',
    coordinatesExplained:
      '高度角是天体高出数学地平线的角度。方位角是从正北顺时针量起的方向：正东为 90°，正南为 180°，正西为 270°。',
    moonFacts: ({ distanceKm }) =>
      `月亮反射太阳光。我们看到的月相，取决于能看到它被照亮那一半的多少。它距这位观测者约 ${f.number(distanceKm)} 公里。`,
    planetFacts: ({ name, distanceKm, distanceAu, diameterArcsec, phase }) =>
      `${name}靠反射太阳光发亮，在群星之间缓缓移动。它距这位观测者约 ${f.number(distanceKm / 1e6)} 百万公里（${f.number(distanceAu, 2)} 天文单位）；视圆面直径 ${f.number(diameterArcsec, 1)}″，不借助双筒望远镜或天文望远镜，看不出圆面。` +
      (phase
        ? `${name}和月亮一样有圆缺变化，用双筒望远镜或小型天文望远镜就能看到；此刻照亮 ${f.number(phase.illumination)}%（${PLANET_SHAPES[phase.shape]}）。`
        : ''),
    starFacts: ({ magnitude, ra, dec }) =>
      `星等 ${f.number(magnitude, 2)}（数值越小越亮）。星表坐标：J2000 赤经 ${f.number(ra, 3)}h，赤纬 ${f.number(dec, 2)}°。`,
    find: '查找天体',
    searchPlaceholder: '太阳、月亮、行星或恒星名称',
    aboveHorizon: '地平线以上',
    all: '全部天体',
    noteSearch: '搜索结果包括地平线以下的天体。',
    noteUp: '地平线以上天体的计算位置，恒星按亮度排列。',
    noteAll: '探索太阳、月亮、行星和恒星，包括地平线以下的天体。',
    clearPreviewActive: '晴空预览已开启。',
    heavyClouds: '浓厚的云层可能会遮挡视线。',
    list: '天体列表',
    nearestStar: '离我们最近的恒星',
    below: '未升起',
    count: ({ count, shown }) =>
      count > shown
        ? `显示 ${f.number(count, 0, false)} 个中的前 ${f.number(shown)} 个。可按名称或 HYG 编号搜索更多。`
        : `共 ${f.number(count, 0, false)} 个匹配的天体。`,
    starsLoading: '恒星仍在加载…',
    starsFailed: '星表加载失败。太阳和月亮仍可查看。',
    tryAgain: '重试',
    planetSearchWords: ['行星', 'planets'],
  },
  visibility: (visibility: Visibility, name: string) => {
    switch (visibility.reason) {
      case 'horizon':
        return { label: '在地平线以下', detail: '这个方向被地球挡住了。换个时间，等它升起来再看。' };
      case 'near-sun':
        return {
          label: '靠近太阳',
          detail: `${name}与太阳仅相距 ${f.number(visibility.elongation)}°。切勿直视太阳，也不要把双筒望远镜或天文望远镜指向太阳附近。`,
        };
      case 'layer':
        return { label: '恒星图层已关闭', detail: '打开恒星图层即可看到这个天体。' };
      case 'ridge':
        return {
          label: '靠近示意山脊',
          detail: '山脊可能挡住这个低处的位置。可在“图层”中选择无遮挡的地平线。',
        };
      case 'daylight':
        return {
          label: '淹没在日光中',
          detail:
            visibility.subject === 'star'
              ? '它在地平线以上，但明亮的天空让这颗恒星看不见。'
              : visibility.glare
                ? `${name}与太阳仅相距 ${f.number(visibility.elongation)}°，淹没在太阳的强光里。切勿在太阳附近搜寻。`
                : `它在地平线以上，但天空太亮，看不见${name}。天色暗下来后就会出现。`,
        };
      case 'cloud':
        return {
          label: '云层浓厚',
          detail: `云量 ${f.number(visibility.cloudCover)}%，可能遮住这个天体。标记显示的是它的计算位置。`,
        };
      case 'haze':
        return { label: '大气能见度差', detail: '雾霾降低了画面的对比度。标记显示的是计算位置。' };
      case 'twilight':
        return {
          label: '被暮光冲淡',
          detail: `暮光仍让天空太亮，看不清${visibility.subject === 'planet' ? name : '这颗恒星'}。天色暗下来后就会出现。`,
        };
      case 'faint':
        return {
          label: '在这片天空中很暗',
          detail: '它本身的亮度、高度、月光以及所选的光污染程度，都降低了它的可见度。',
        };
      case 'phase':
        return {
          label: '极细的月牙',
          detail: '月亮被照亮的部分很少。请在位置标记附近寻找；白天可能很难分辨。',
        };
      case 'daylight-moon':
        return {
          label: '白天的淡月',
          detail:
            '在白天的天空中，月亮的对比度很低。可选的广角放大只影响画面上的圆面，不改变计算出的角直径。',
        };
      case 'partial-cloud':
        return {
          label: '可能有云飘过',
          detail: '它在地平线以上。云的图案只是示意，并非当地实测的天空。',
        };
      case 'clear':
        return {
          label: '在地平线以上',
          detail:
            visibility.subject === 'star'
              ? '请看位置标记内部。恒星画成光点，越亮的恒星光点越亮。'
              : visibility.subject === 'planet'
                ? `请看位置标记内部。${name}是一个稳定的光点${visibility.brighterThanAnyStar ? '，比任何恒星都亮' : ''}。`
                : `居中后会按真实比例显示${name}；缩小即可看到它在天空中的位置。`,
        };
    }
  },
  time: {
    region: '时间控件',
    following: '跟随实时',
    playing: ({ speed }) => `${f.number(speed)} 倍速播放中`,
    paused: '已暂停',
    change: '更改日期和时间',
    now: '现在',
    tonight: '今晚',
    tonightTitle: '跳到民用昏影终之后一小时',
    noDusk: '这一天没有民用昏影终',
    editor: '选择一个时刻',
    closeEditor: '关闭时间编辑器',
    previousDay: '前一天',
    nextDay: '后一天',
    date: '日期',
    localTime: '当地时间',
    gap: '时钟在此拨快，这个时间并不存在。请选择其他时间。',
    fold: '这个时间出现了两次。请选择你想要的时区偏移。',
    invalidDate: '请选择 1900 年至 2100 年之间的有效日期。',
    outOfRange: '请选择 1900 年至 2100 年之间的日期。',
    sunrise: '日出',
    sunset: '日落',
    done: '完成',
    play: '播放时间',
    pause: '暂停时间',
    slider: '一天中的时间',
    speed: '播放速度',
    speedOption: ({ speed }) => `${f.number(speed)}×`,
  },
  weather: {
    sourceData: '天气数据',
    partial: '部分数据缺失。视图中缺失的项目按中性大气处理。',
    temperature: '气温',
    wind: '风',
    cloudCover: '云量',
    visibility: '能见度',
    haze: '大气雾霾',
    windSpeed: '风速',
    windDirection: '风向',
    precipitation: '降水',
    refresh: '刷新天气',
    returnToData: '返回天气数据',
    humidityPressure: ({ humidity, pressure }) => `湿度 ${humidity}% · 气压 ${pressure} hPa`,
    sample: ({ sampled, fetchedDate, fetchedTime }) =>
      `采样时间 ${sampled} · 获取于 ${fetchedDate} ${fetchedTime}。天气是模型估算值；云的图案为模拟效果。`,
    condition: {
      unavailable: '天气状况不可用',
      clear: '晴',
      partlyCloudy: '多云',
      overcast: '阴',
      fog: '雾',
      drizzle: '毛毛雨',
      rain: '雨',
      snow: '雪',
      rainShowers: '阵雨',
      snowShowers: '阵雪',
      thunderstorm: '雷暴',
    },
    loading: '正在加载天气',
    unavailable: '天气数据不可用',
    source: ({ source, cache }) =>
      (cache === 'stale' ? '过期缓存 · ' : cache === 'cached' ? '缓存 · ' : '') +
      { current: '当前模型估算', forecast: '天气预报', recent: '近期天气模型', historical: '历史再分析' }[
        source
      ],
    issue: {
      loading: '正在加载这个地点当天的天气…',
      'no-coverage': '这一时刻没有天气数据。',
      'no-sample': '这一时刻附近没有天气采样。',
      'date-unsupported': '天气数据不覆盖这个日期。可选择自定义天气来探索这片天空。',
      'beyond-coverage': '这一天超出了天气数据源的 UTC 覆盖范围。',
      'no-samples': '这个日期没有可用的天气采样。',
      busy: '天气服务繁忙。请稍后刷新。',
      'no-timeline': '天气服务没有返回逐小时数据。',
      'bad-timestamp': '天气服务返回了无效的时间戳。',
      unordered: '天气数据的时间顺序有误。',
      'refresh-failed': '刷新失败。正在显示缓存的天气；获取时间见下方。',
      provider: ({ reason }) => `天气服务：${reason}`,
    },
  },
  network: (failure: NetworkFailure, service: NetworkService) => {
    const { name, retry, what } = SERVICE[service];
    switch (failure.kind) {
      case 'timeout':
        return `${name}响应超时。${retry}`;
      case 'offline':
        return `你似乎已离线。恢复网络连接后，${retry}`;
      case 'unreachable':
        return `无法连接${name}。请检查网络连接。${retry}`;
      case 'unreadable':
        return `${name}返回的内容无法读取。${retry}`;
      case 'invalid':
        return `${name}返回了无效的响应。`;
      case 'http':
        return service === 'search'
          ? `地点搜索失败（${failure.status}）。请重试。`
          : `天气服务：HTTP ${failure.status}`;
      case 'failed':
        return `无法加载${what}。${retry}`;
    }
  },
  settings: {
    intro: '清晰的视野，只留你想要的细节。',
    layers: '天空图层',
    clearSky: '晴空预览',
    clearSkyNote: '隐藏云、霾和降水。仍保留当前时间、月光和光污染影响；关闭即可恢复天气。',
    layerNames: { stars: '恒星', lines: '星座连线', labels: '天体标签' },
    moonDisplayAid: '广角视图放大月亮',
    moonDisplayAidNote:
      '仅为显示辅助：让较小的月亮更容易看清和点选。关闭后按物理比例显示；天体位置、月相及计算出的角直径不变。',
    comfort: '舒适与性能',
    reduceMotion: '减少大气动画',
    systemMotion: '正在遵循系统的“减弱动态效果”设置。',
    quality: '渲染质量',
    qualityOptions: { auto: '自动', low: '省电', high: '高' },
    appearance: '天空外观',
    lightPollution: '光污染',
    brightnessOptions: { dark: '暗夜天空', suburban: '郊区天空', city: '城市天空' },
    horizon: '地平线',
    horizonOptions: { flat: '无遮挡', ridge: '示意山脊' },
    appearanceNote:
      '外观设置仅为示意，并不测量当地的光污染或地形。连线图案包括北斗七星和夏季大三角两个星群。',
    language: '语言',
    languageLabel: '界面语言',
    languageAuto: '自动（跟随浏览器语言）',
    places: '你的地点',
    removeSaved: '取消收藏此地点',
    savePlace: '收藏此地点',
    aboutTitle: '计算出来的天空',
    about:
      '天体位置由 Astronomy Engine 计算。地景和云只是示意，当地的遮挡物和真实云形可能不同。可探索 1900 年至 2100 年的日期。',
    credits: '数据来源、隐私与局限',
    creditsPage: 'credits.zh-Hans.html',
  },
  location: {
    trigger: ({ name }) => `更改地点，当前为${name}`,
    change: '更改地点',
    choose: '选择城市',
    eyebrow: '换个视角',
    title: '选择你的地点',
    close: '关闭地点选择',
    search: '搜索地点',
    placeholder: '城市、城镇，或你喜欢的地方',
    locating: '正在获取你的位置…',
    useMine: '使用我的位置',
    removeSaved: '取消收藏此地点',
    saveCurrent: '收藏当前地点',
    results: '搜索结果',
    suggestions: '收藏、最近和推荐',
    searching: '正在搜索…',
    noMatches: '没有找到匹配的地点。试试附近的城市。',
    options: '地点列表',
    unavailable: '无法获取位置。请改为搜索地点。',
    denied: '定位权限被拒绝。请改为搜索地点。',
    timedOut: '定位超时。请重试或搜索地点。',
    noTimeZone: '无法确定时区。请搜索附近的地点。',
    searchLanguage: 'zh',
  },
  share: {
    linkSection: '分享链接',
    linkHeading: '把这片天空分享出去',
    imageSection: '纪念图片',
    imageHeading: '纪念图片预览',
    imagePrompt: '生成这一刻的纪念图片，即可在此预览、选择风格并保存。',
    eyebrow: '留住这一刻',
    title: '分享这片天空',
    close: '关闭分享',
    includes: ({ focus, customWeather }) =>
      `此链接包含地点、精确时间、${focus ? `以${focus}为中心的` : ''}视角、图层${customWeather ? '和自定义天气' : ''}。`,
    device: ({ latitude, longitude }) =>
      `它包含你设备的精确坐标：${f.number(latitude, 5)}, ${f.number(longitude, 5)}。只有在你愿意让对方看到这个位置时才分享。`,
    deviceRounded: ({ latitude, longitude }) =>
      `此链接中的位置已粗略到约 10 公里（${f.number(latitude, 1)}, ${f.number(longitude, 1)}）。`,
    precise: '分享我的精确位置',
    arrival: ({ subject }) => `打开时，视角会转向${subject}。`,
    field: '星空链接',
    copied: '已复制',
    copy: '复制链接',
  },
  moment: {
    make: '生成图片',
    drawing: '正在绘制图片…',
    failed: '图片无法绘制。请换一种风格再试。',
    style: '风格',
    styles: { realistic: '写实', illustrated: '插画' },
    horizon: '地平线',
    horizons: { ridge: '山脊', mountains: '群山', sea: '海面', city: '城市' },
    alt: ({ place }) => `${place}上空的纪念图片`,
    save: '保存图片',
    send: '发送图片',
    devicePlace: '我所在的地方',
    illustration: '插画',
    when: ({ date, time, zone }) => `${date} · ${time} · ${zone}`,
    subject: ({ name, direction, degrees }) => `望向${name}，朝${direction} ${f.number(degrees)}°`,
    facing: ({ direction, degrees }) => `朝${direction} ${f.number(degrees)}°`,
    moon: ({ phase, illumination, up }) =>
      `月亮：${phase}，亮面 ${f.number(illumination)}%${up ? '' : '，在地平线以下'}`,
    conditions: ({ condition, cloud }) => `${condition}，云量 ${f.number(cloud)}%`,
    noWeather: '这一刻没有天气数据',
    provenance: (provenance) => {
      switch (provenance.kind) {
        case 'source':
          return {
            current: '云来自该地区的当前模型估算。',
            forecast: '云来自该地区的天气预报。',
            recent: '云来自该地区的近期天气模型。',
            historical: '云来自该地区的再分析数据。',
          }[provenance.source];
        case 'custom':
          return '天气由发送者设定，并非实测。';
        case 'clear':
          return '晴空预览：发送者去掉了云。';
        case 'none':
          return '没有天气数据：显示的是中性天空。';
      }
    },
    method: ({ illustrated }) =>
      '位置由 Astronomy Engine 计算；地平线和云的形状为示意。' +
      (illustrated ? '以插画方式绘制，月亮和行星有所放大。' : ''),
    attribution: '天气：Open-Meteo（CC BY 4.0）· 星表：HYG（CC BY-SA 4.0）',
    sentences: (parts) => parts.join(''),
  },
  recovery: {
    title: '星空需要重新开始',
    body: '这次探索被打断了。请重新加载再试，或打开一个新的视图。你收藏的地点仍保存在此浏览器中。',
    reload: '重新加载',
    fresh: '打开新视图',
  },
};

export default zh;
