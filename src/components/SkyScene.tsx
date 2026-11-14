import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { RenderInput, RenderCallbacks, SkyRenderer } from '../renderer/createSkyRenderer';
import type { CameraView } from '../lib/persistence';

export interface SkySceneHandle {
  resetView: () => void;
  /** Centers a direction; `fov` also sets the zoom, in degrees. */
  focus: (altitude: number, azimuth: number, fov?: number) => void;
  /** Multiplies the field of view: below 1 zooms in. */
  zoom: (factor: number) => void;
  simulateContextLoss: () => void;
}

type Props = RenderInput & RenderCallbacks;

const SkyScene = forwardRef<SkySceneHandle, Props>(function SkyScene(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<SkyRenderer | null>(null);
  const view = useRef<CameraView | undefined>(props.initialView);
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState('');
  const [revision, retry] = useState(0);
  useImperativeHandle(
    ref,
    () => ({
      resetView: () => runtime.current?.resetView(),
      focus: (altitude, azimuth, fov) => runtime.current?.focus(altitude, azimuth, fov),
      zoom: (factor) => runtime.current?.zoom(factor),
      simulateContextLoss: () => runtime.current?.simulateContextLoss(),
    }),
    [],
  );
  useEffect(() => {
    runtime.current?.target(props.targetId ?? null);
  }, [props.targetId]);
  // Panels and cards over the sky change with app renders; labels are laid out around them on the
  // next frame. Frames are coalesced, so this costs at most one draw per display refresh.
  useEffect(() => {
    runtime.current?.redraw();
  });
  useEffect(() => {
    runtime.current?.playback(props.playbackRate ?? 0);
  }, [props.playbackRate]);
  useEffect(() => {
    let disposed = false;
    let instance: SkyRenderer | null = null;
    import('../renderer/createSkyRenderer')
      .then(({ createSkyRenderer }) => {
        if (disposed || !hostRef.current) return;
        try {
          instance = createSkyRenderer(
            hostRef.current,
            { ...latest.current, initialView: view.current },
            {
              onHeadingChange: (heading) => latest.current.onHeadingChange?.(heading),
              onStarSelect: (star) => latest.current.onStarSelect?.(star),
              onBodySelect: (body) => latest.current.onBodySelect?.(body),
              onCameraChange: (next) => {
                view.current = next;
                latest.current.onCameraChange?.(next);
              },
              onAssetError: (message) => latest.current.onAssetError?.(message),
              onContextChange: (lost) =>
                setError(
                  lost
                    ? 'The graphics connection was interrupted. Retry the sky; your place, time, and view are preserved.'
                    : '',
                ),
              onDiagnostics: (stats) => latest.current.onDiagnostics?.(stats),
            },
          );
          runtime.current = instance;
          setError('');
        } catch {
          setError('The 3D sky could not start. Your sky calculations remain available below.');
        }
      })
      .catch(() => {
        if (!disposed) setError('The 3D sky could not load. Check your connection and retry.');
      });
    return () => {
      disposed = true;
      instance?.dispose();
      runtime.current = null;
    };
  }, [revision]);
  useEffect(() => {
    runtime.current?.update(props.sky, props.weather, {
      stars: props.showStars,
      constellations: props.showConstellations,
      labels: props.showLabels,
    });
  }, [props.sky, props.weather, props.showStars, props.showConstellations, props.showLabels]);
  useEffect(() => {
    runtime.current?.settings({
      reducedMotion: props.reducedMotion,
      quality: props.quality,
      horizon: props.horizon,
      skyBrightness: props.skyBrightness,
    });
  }, [props.reducedMotion, props.quality, props.horizon, props.skyBrightness]);
  return (
    <>
      <div className="sky-scene" ref={hostRef} role="group" aria-label="Interactive three-dimensional sky" />
      {error && (
        <div className="scene-error" role="alert">
          <p>{error}</p>
          <button onClick={() => retry((n) => n + 1)}>Retry sky</button>
        </div>
      )}
    </>
  );
});
export default SkyScene;
