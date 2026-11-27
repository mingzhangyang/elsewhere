import { Temporal as Polyfill } from '@js-temporal/polyfill';
import { afterEach, expect, it, vi } from 'vitest';
import { INVALID_INPUT, skyEngineError } from './skyEngineErrorMatchers';

// Each case loads fresh module instances in a runtime without a native Temporal.
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function fresh() {
  vi.stubGlobal('Temporal', undefined);
  vi.resetModules();
  const temporal = await import('../packages/sky-engine/src/domain/temporal');
  const time = await import('../packages/sky-engine/src/domain/time');
  const { installTemporal } = await import('../packages/sky-engine/src/temporal');
  return { temporal, time, installTemporal };
}

it('reports a missing Temporal as UNSUPPORTED and names both remedies', async () => {
  const { temporal, time } = await fresh();
  expect(temporal.Temporal).toBeUndefined();
  const call = () => time.civilDayStart('2026-03-20', 'UTC');
  expect(call).toThrow(skyEngineError('UNSUPPORTED'));
  expect(call).toThrow(/installTemporal\(\).*full Sky Engine build/s);
});

it('uses a host Temporal installed with installTemporal()', async () => {
  const { temporal, time, installTemporal } = await fresh();
  installTemporal(Polyfill);
  expect(temporal.Temporal).toBe(Polyfill);
  expect(time.civilDayStart('2026-03-20', 'America/New_York').toISOString()).toBe('2026-03-20T04:00:00.000Z');
  // The host's implementation wins over a later polyfill fallback.
  await temporal.ensureTemporal();
  expect(temporal.Temporal).toBe(Polyfill);
});

it('rejects anything that is not a Temporal implementation', async () => {
  const { temporal, installTemporal } = await fresh();
  for (const value of [
    undefined,
    null,
    0,
    'Temporal',
    {},
    { Instant: {} },
    { ...Polyfill, PlainDate: undefined },
  ]) {
    expect(() => installTemporal(value)).toThrow(INVALID_INPUT);
  }
  expect(temporal.Temporal).toBeUndefined();
});
