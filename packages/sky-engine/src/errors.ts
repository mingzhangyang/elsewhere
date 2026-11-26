/** Every failure category the public API reports. New codes may be added in a minor version. */
export type SkyEngineErrorCode =
  | 'INVALID_INPUT'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'MISSING_ASSET'
  | 'ASSET_FAILED'
  | 'UNSUPPORTED';

/**
 * The one error type thrown or rejected by Sky Engine. Branch on `code`, not on `message`.
 * Cancellation uses the name `AbortError`, so the common `error.name === 'AbortError'` check keeps
 * working; every other code uses the name `SkyEngineError`. A host loader's own failure, or a
 * browser error such as a cross-origin `SecurityError`, is kept as `cause`.
 */
export class SkyEngineError extends Error {
  readonly code: SkyEngineErrorCode;

  constructor(code: SkyEngineErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = code === 'CANCELLED' ? 'AbortError' : 'SkyEngineError';
    this.code = code;
  }
}

export const invalidInput = (message: string) => new SkyEngineError('INVALID_INPUT', message);
export const cancelled = (message: string) => new SkyEngineError('CANCELLED', message);
export const canvasUnavailable = () => new SkyEngineError('UNSUPPORTED', 'Canvas 2D is unavailable.');
