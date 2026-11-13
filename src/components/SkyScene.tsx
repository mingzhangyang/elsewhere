import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { RenderInput, RenderCallbacks, SkyRenderer } from '../renderer/createSkyRenderer';

export interface SkySceneHandle {
  resetView: () => void;
  focus: (altitude: number, azimuth: number) => void;
  zoom: (delta: number) => void;
}

type Props = RenderInput & RenderCallbacks;

const SkyScene = forwardRef<SkySceneHandle, Props>(function SkyScene(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<SkyRenderer | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState('');
  const [revision, retry] = useState(0);
  useImperativeHandle(ref, () => ({
    resetView: () => runtime.current?.resetView(),
    focus: (altitude, azimuth) => runtime.current?.focus(altitude, azimuth),
    zoom: (delta) => runtime.current?.zoom(delta),
  }), []);
  useEffect(() => {
    let disposed = false;
    let instance: SkyRenderer | null = null;
    import('../renderer/createSkyRenderer').then(({ createSkyRenderer }) => {
      if (disposed || !hostRef.current) return;
      try {
        instance = createSkyRenderer(hostRef.current, latest.current, {
          onHeadingChange: (heading) => latest.current.onHeadingChange?.(heading),
          onStarSelect: (star) => latest.current.onStarSelect?.(star),
          onBodySelect: (body) => latest.current.onBodySelect?.(body),
          onCameraChange: (view) => latest.current.onCameraChange?.(view),
          onAssetError: (message) => latest.current.onAssetError?.(message),
        });
        runtime.current = instance;
        setError('');
      } catch { setError('The 3D sky could not start. Your sky calculations remain available below.'); }
    }).catch(() => { if (!disposed) setError('The 3D sky could not load. Check your connection and retry.'); });
    return () => { disposed = true; instance?.dispose(); runtime.current = null; };
  }, [revision]);
  useEffect(() => {
    runtime.current?.update(props.sky, props.weather, { stars: props.showStars, constellations: props.showConstellations, labels: props.showLabels });
  }, [props.sky, props.weather, props.showStars, props.showConstellations, props.showLabels]);
  useEffect(() => { runtime.current?.settings({ reducedMotion: props.reducedMotion, quality: props.quality, horizon: props.horizon, skyBrightness: props.skyBrightness }); }, [props.reducedMotion, props.quality, props.horizon, props.skyBrightness]);
  return <>
    <div className="sky-scene" ref={hostRef} aria-label="Interactive three-dimensional sky" />
    {error && <div className="scene-error" role="alert"><p>{error}</p><button onClick={() => retry((n) => n + 1)}>Retry sky</button></div>}
  </>;
});
export default SkyScene;
