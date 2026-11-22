import type { Locale } from './locale';

/** The memorial creator is not in the explorer startup path; keep its copy out of global catalogs. */
const en = {
  title: 'Choose a moment',
  intro:
    'Enter a date and the event city’s local time. This checks the time; it does not draw a star map yet.',
  city: 'Event city',
  zone: ({ timeZone }: { timeZone: string }) => `Time zone: ${timeZone}`,
  chooseCityHint: 'Select a city from the suggestions or search results.',
  date: 'Gregorian date',
  precision: 'How certain is the time?',
  exact: 'I know the time',
  unknown: 'I don’t know the time',
  localTime: 'Local time at the event',
  exactNote: 'Use the local clock at the chosen city, not your device time.',
  referenceTime: 'Reference local time',
  referenceNote: 'A calculation reference only, defaulting to 22:00. It is not an exact event time.',
  cityRequired: 'Select an event city to continue.',
  unexpected: 'The time could not be checked. Please try again.',
  errors: {
    'invalid-date': 'Enter a valid Gregorian date, including the year.',
    'invalid-time': 'Enter a valid local time between 00:00 and 23:59.',
    'invalid-location': 'The selected place has invalid coordinates. Choose another city.',
    'invalid-timezone': 'The selected place has an invalid time zone. Choose another city.',
    'nonexistent-time': 'This local clock time never occurred due to a clock change. Choose another time.',
    'out-of-range': 'The calculated UTC instant must be between 1900 and 2100.',
    'invalid-choice': 'This time choice is no longer valid. Select a current candidate.',
  },
  ambiguous: 'This local clock time occurred twice. Select the intended offset:',
  ambiguousRestricted: 'This time occurred twice, but only the following offset is in the supported UTC range. Confirm it:',
  candidate: ({ utc, offset }: { utc: string; offset: string }) => `Offset ${offset} · UTC ${utc}`,
  ready: ({ utc, offset }: { utc: string; offset: string }) => `Resolved: ${utc} · UTC offset ${offset}`,
  checking: 'Checking the time…',
  submit: 'Check time',
};

const zh: typeof en = {
  title: '选择纪念时刻',
  intro: '输入纪念日期和事件发生城市的当地时间。本步骤仅核对时刻，暂不绘制星图。',
  city: '事件发生的城市',
  zone: ({ timeZone }) => `时区：${timeZone}`,
  chooseCityHint: '请从推荐地点或搜索结果中明确选择城市。',
  date: '公历日期',
  precision: '对事件时间的了解程度',
  exact: '知道具体时间',
  unknown: '不知道具体时间',
  localTime: '事件发生地的当地时间',
  exactNote: '采用选定城市的当地钟表时间，不使用当前设备时区。',
  referenceTime: '参考当地时间',
  referenceNote: '仅为计算采用的参考值，默认22:00，不代表事件发生的确切钟点。',
  cityRequired: '请先选择事件发生的城市。',
  unexpected: '时间暂时无法校验，请重试。',
  errors: {
    'invalid-date': '请输入完整且有效的公历日期。',
    'invalid-time': '请输入零时至二十三时五十九分之间的有效当地时间。',
    'invalid-location': '所选地点坐标无效，请重新选择城市。',
    'invalid-timezone': '所选地点时区无效，请重新选择城市。',
    'nonexistent-time': '当地时钟调整导致这个时间不存在，请选择其他钟点。',
    'out-of-range': '换算后的世界协调时间必须在1900年至2100年之间。',
    'invalid-choice': '该时间选择已失效，请重新选择当前候选。',
  },
  ambiguous: '这个当地时间重复出现过两次，请明确选择所用时区偏移：',
  ambiguousRestricted: '这个当地时间重复出现过两次，但只有下列候选处于支持的 UTC 范围内，请明确确认：',
  candidate: ({ utc, offset }) => `时区偏移 ${offset} · 世界协调时间 ${utc}`,
  ready: ({ utc, offset }) => `已解析：${utc} · 时区偏移 ${offset}`,
  checking: '正在校验时间…',
  submit: '校验时间',
};

export function memorialMessages(locale: Locale): typeof en {
  return locale === 'zh-Hans' ? zh : en;
}
