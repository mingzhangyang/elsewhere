import type { CameraView } from './persistence';

/**
 * Holds the live camera view outside React state. Pointer drags report a view on every move; keeping
 * it here lets only the readers that need it (the compass) re-render, instead of the whole app.
 */
export interface CameraViewStore {
  get: () => CameraView;
  set: (view: CameraView) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createCameraViewStore(initial: CameraView): CameraViewStore {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (view) => {
      current = view;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
