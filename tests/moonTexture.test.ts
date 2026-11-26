import { afterEach, expect, it, vi } from 'vitest';
import { installMoonTexture } from '../packages/sky-engine/src/moment/moonPhase';

function stubCanvas(getImageData: () => ImageData) {
  const context = { drawImage: vi.fn(), getImageData: vi.fn(getImageData) };
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  });
  return context;
}

// A stand-in for a decoded HTMLImageElement: the decoder reads only its natural size.
const image = () => ({ naturalWidth: 4, naturalHeight: 2 }) as unknown as HTMLImageElement;

afterEach(() => {
  vi.unstubAllGlobals();
  installMoonTexture(null);
});

it('explains a canvas tainted by a cross-origin Moon texture', () => {
  const securityError = new DOMException('The canvas has been tainted.', 'SecurityError');
  stubCanvas(() => {
    throw securityError;
  });
  let thrown: unknown;
  try {
    installMoonTexture(image());
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  expect(thrown).not.toBeInstanceOf(DOMException);
  expect((thrown as Error).message).toMatch(/same origin/);
  expect((thrown as Error).message).toMatch(/CORS/);
  expect((thrown as Error).message).toMatch(/crossOrigin/);
  expect((thrown as Error).cause).toBe(securityError);
});

it('rethrows other texture read failures unchanged', () => {
  const failure = new DOMException('Out of memory.', 'IndexSizeError');
  stubCanvas(() => {
    throw failure;
  });
  expect(() => installMoonTexture(image())).toThrow(failure);
  const plain = new TypeError('broken');
  stubCanvas(() => {
    throw plain;
  });
  expect(() => installMoonTexture(image())).toThrow(plain);
});

it('still decodes readable images', () => {
  const pixels = { width: 4, height: 2, data: new Uint8ClampedArray(32) } as unknown as ImageData;
  const context = stubCanvas(() => pixels);
  expect(() => installMoonTexture(image())).not.toThrow();
  expect(context.drawImage).toHaveBeenCalledOnce();
  expect(context.getImageData).toHaveBeenCalledWith(0, 0, 4, 2);
});
