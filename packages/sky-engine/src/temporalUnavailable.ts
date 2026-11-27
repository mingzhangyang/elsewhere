// Build-time stand-in for '@js-temporal/polyfill' in the lite build (sky-engine.lite.mjs): no
// polyfill is bundled, so ensureTemporal() finds no Temporal here and reports UNSUPPORTED unless the
// runtime has one or the host called installTemporal(). Never imported by source code directly.
export const Temporal = undefined;
