import { expect } from 'vitest';
import type { SkyEngineErrorCode } from '../packages/sky-engine/src/errors';

/** Matches a SkyEngineError with this code (and the name that code implies) in toThrow/rejects. */
export const skyEngineError = (code: SkyEngineErrorCode) =>
  expect.objectContaining({ name: code === 'CANCELLED' ? 'AbortError' : 'SkyEngineError', code });

export const INVALID_INPUT = skyEngineError('INVALID_INPUT');
