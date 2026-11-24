import type { CameraView } from './persistence';

/**
 * Holds the live camera view outside React state. Pointer drags report a view on every move; keeping
 * it here lets only the readers that need it (the minimap) re-render, instead of the whole app.
 * The viewport aspect is live rendering metadata, not part of the shareable camera view.
 */
export interface CameraViewStore {
  get: () => CameraView;
  getAspect: () => number | null;
  setAspect: (aspect: number) => void;
  set: (view: CameraView) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createCameraViewStore(initial: CameraView): CameraViewStore {
  let current = initial;
  let aspect: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    getAspect: () => aspect,
    setAspect: (next) => {
      if (!Number.isFinite(next) || next <= 0 || next === aspect) return;
      aspect = next;
      listeners.forEach((listener) => listener());
    },
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
