import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type {
  RenderInput,
  RenderCallbacks,
  SkyCapture,
  SkyCaptureOptions,
  SkyLabels,
  SkyRenderer,
} from '../renderer/createSkyRenderer';
import type { CameraView } from '../lib/persistence';
import { currentLanguage, useI18n, type I18n } from '../i18n';
import { objectName } from '../i18n/names';
import { labelFontReady } from '../renderer/labelFont';

export interface SkySceneHandle {
  resetView: () => void;
  /** Centers a direction; `fov` also sets the zoom, in degrees. */
  focus: (altitude: number, azimuth: number, fov?: number) => void;
  /** Multiplies the field of view: below 1 zooms in. */
  zoom: (factor: number) => void;
  simulateContextLoss: () => void;
  /** The sky as drawn now, for a sky-moment image; null until the renderer has started. */
  capture: (options: SkyCaptureOptions) => SkyCapture | null;
  /** The sky view's size in CSS pixels. */
  size: () => { width: number; height: number } | null;
}

type Props = Omit<RenderInput, 'labels'> &
  RenderCallbacks & {
    /**
     * A shared link's view of its subject: once the renderer starts at `initialView`, the camera
     * turns to this one (ROADMAP phase 3: a link that turns to its subject).
     */
    arriveAt?: CameraView;
  };

/** How long a shared link's camera takes to turn to its subject, in ms. */
const ARRIVAL_MS = 2600;

function skyLabels(i18n: I18n): SkyLabels {
  const { m } = i18n;
  return {
    canvas: m.sky.canvas,
    planet: (id) => m.bodies[id],
    star: (star) => objectName({ kind: 'star', id: star.id, name: star.name }, i18n),
    pattern: (id) => m.patterns[id],
    target: (object) => m.sky.targetLabel({ name: objectName(object, i18n) }),
  };
}
/** Characters to have the label font ready for: every name that can be drawn in the sky's labels. */
function labelSample({ m }: I18n): string {
  return [...Object.values(m.bodies), ...Object.values(m.patterns), ...Object.values(m.starNames)].join('');
}

const SkyScene = forwardRef<SkySceneHandle, Props>(function SkyScene(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<SkyRenderer | null>(null);
  const view = useRef<CameraView | undefined>(props.initialView);
  const i18n = useI18n();
  const { m } = i18n;
  const labels = useMemo(() => skyLabels(i18n), [i18n]);
  const latest = useRef({ ...props, labels });
  latest.current = { ...props, labels };
  const [error, setError] = useState<'start' | 'load' | 'context' | null>(null);
  const [revision, retry] = useState(0);
  const arrived = useRef(false);
  useImperativeHandle(
    ref,
    () => ({
      resetView: () => runtime.current?.resetView(),
      focus: (altitude, azimuth, fov) => runtime.current?.focus(altitude, azimuth, fov),
      zoom: (factor) => runtime.current?.zoom(factor),
      simulateContextLoss: () => runtime.current?.simulateContextLoss(),
      capture: (options) => runtime.current?.capture(options) ?? null,
      size: () =>
        hostRef.current ? { width: hostRef.current.clientWidth, height: hostRef.current.clientHeight } : null,
    }),
    [],
  );
  useEffect(() => {
    runtime.current?.target(props.targetId ?? null);
  }, [props.targetId]);
  // A language change redraws the label textures once the new script's font can draw them.
  const drawn = useRef(labels);
  useEffect(() => {
    if (drawn.current === labels) return;
    let current = true;
    labelFontReady(labelSample(i18n)).then(() => {
      if (!current || !runtime.current) return;
      drawn.current = labels;
      runtime.current.labels(labels);
    });
    return () => {
      current = false;
    };
  }, [labels, i18n]);
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
    Promise.all([import('../renderer/createSkyRenderer'), labelFontReady(labelSample(currentLanguage()))])
      .then(([{ createSkyRenderer }]) => {
        if (disposed || !hostRef.current) return;
        try {
          drawn.current = latest.current.labels;
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
              onContextChange: (lost) => setError(lost ? 'context' : null),
              onDiagnostics: (stats) => latest.current.onDiagnostics?.(stats),
            },
          );
          runtime.current = instance;
          // Only on the first start: a retry after a failure resumes the view as it was.
          const arrival = latest.current.arriveAt;
          if (arrival && !arrived.current) instance.turnTo(arrival, ARRIVAL_MS);
          arrived.current = true;
          setError(null);
        } catch {
          setError('start');
        }
      })
      .catch(() => {
        if (!disposed) setError('load');
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
      moonDisplayAid: props.moonDisplayAid,
    });
  }, [props.reducedMotion, props.quality, props.horizon, props.skyBrightness, props.moonDisplayAid]);
  return (
    <>
      <div className="sky-scene" ref={hostRef} role="group" aria-label={m.sky.scene} />
      {error && (
        <div className="scene-error" role="alert">
          <p>
            {error === 'context'
              ? m.sky.contextLost
              : error === 'start'
                ? m.sky.startFailed
                : m.sky.loadFailed}
          </p>
          <button onClick={() => retry((n) => n + 1)}>{m.sky.retry}</button>
        </div>
      )}
    </>
  );
});
export default SkyScene;
