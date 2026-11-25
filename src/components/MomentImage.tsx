import { calculateSky } from '../domain/astronomy';
import { loadStars } from '../services/starCatalog';
import { landscapeSeason } from '../moment/seasons';
import { loadLandscapeArt } from '../moment/landscapeArt';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Share2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { MomentSnapshot } from '../lib/moment';
import { momentImageSnapshot } from '../moment/imageWeather';
import { frameMoment, type MomentFraming } from '../moment/framing';
import { momentImageCopy, sdkImageCopy } from '../moment/imageCopy';
import type { MoonPortraitSettings } from '../moment/moonPortrait';
import type { SkyCapture, SkyCaptureOptions } from '../renderer/createSkyRenderer';
import { useI18n } from '../i18n';
import { placeLabel } from '../i18n/names';
import { isDeviceLocation } from '../lib/locations';
import { labelFontReady } from '../renderer/labelFont';
import { drawPostcard, FONT, MOMENT_STYLES, type MomentStyle } from '../moment/postcard';
import { HORIZON_VARIANTS, type HorizonVariant } from '../moment/scenery';
import { getZonedParts } from '../domain/time';

type PreviewImage = { url: string; blob: Blob };
type ImageStyle = MomentStyle | 'chart' | 'minimal' | 'moon';
const IMAGE_STYLES: ImageStyle[] = [...MOMENT_STYLES, 'chart', 'minimal', 'moon'];

/**
 * The keepsake image in the share dialog (ROADMAP phase 3 prototype), loaded only when asked for.
 * Two variant pairs for the test sessions: realistic or illustrated, and the ridge or a scenery
 * silhouette. The image is worded in the language shown, the sender's, and redrawn if it changes.
 */
export default function MomentImage({
  snapshot,
  capture,
  link,
  controlsTarget,
  initialStyle,
}: {
  snapshot: MomentSnapshot;
  capture: (options: SkyCaptureOptions) => SkyCapture | null;
  link: string;
  controlsTarget?: HTMLElement | null;
  initialStyle?: 'moon';
}) {
  const i18n = useI18n();
  const { m } = i18n;
  const copy = momentImageCopy[i18n.locale];
  const sdkCopy = sdkImageCopy[i18n.locale];
  const place = isDeviceLocation(snapshot.location)
    ? m.moment.devicePlace
    : placeLabel(snapshot.location, i18n).name;
  const [style, setStyle] = useState<ImageStyle>(initialStyle ?? 'realistic');
  const [moonSettings, setMoonSettings] = useState<MoonPortraitSettings>({
    orientation: 'observer',
    background: 'transparent',
    earthshine: true,
  });
  const [resolution, setResolution] = useState(1024);
  const [renderSize, setRenderSize] = useState(512);
  const [theme, setTheme] = useState<'midnight' | 'paper'>('midnight');
  const [lines, setLines] = useState(snapshot.layers.lines);
  const [retry, setRetry] = useState(0);
  const postcard = style === 'realistic' || style === 'illustrated';
  const [horizon, setHorizon] = useState<HorizonVariant>('ridge');
  const [clearSkyImage, setClearSkyImage] = useState(true);
  const [framing, setFraming] = useState<MomentFraming>('auto');
  const imageSnapshot = useMemo(
    () => frameMoment(momentImageSnapshot(snapshot, clearSkyImage), framing),
    [snapshot, clearSkyImage, framing],
  );
  const [image, setImage] = useState<PreviewImage | null>(null);
  const [pendingImage, setPendingImage] = useState<PreviewImage | null>(null);
  const [status, setStatus] = useState<'drawing' | 'failed' | 'ready'>('drawing');
  const request = useRef(0);
  const pendingUrl = useRef<string | null>(null);
  const latest = useRef(capture);
  latest.current = capture;
  const ready = !!image && status === 'ready';
  useEffect(() => {
    // Only the latest request is shown; a slower earlier one is discarded.
    const ticket = ++request.current;
    const controller = new AbortController();
    // A superseded decode must never replace the visible bitmap or leak its object URL.
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
    pendingUrl.current = null;
    setPendingImage(null);
    // Keep the previous image visible while the selected variant is redrawn.
    setStatus('drawing');
    const artwork =
      style === 'illustrated' && horizon !== 'ridge'
        ? loadLandscapeArt(
            horizon,
            landscapeSeason(imageSnapshot),
            imageSnapshot.sky.sunAltitude,
            imageSnapshot.sky.sun.azimuth,
          )
        : null;
    const draw = async (): Promise<Blob | null> => {
      if (style === 'moon') {
        const { drawMoonPortrait } = await import('../moment/moonPortrait');
        if (controller.signal.aborted) return null;
        const canvas = await drawMoonPortrait(snapshot, renderSize, moonSettings, controller.signal);
        return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      }
      if (style === 'chart' || style === 'minimal') {
        const { renderSkyChart, renderMinimalSkyMap } = await import(
          '../../packages/sky-engine/src/moment/diagram'
        );
        if (controller.signal.aborted) return null;
        let diagramSnapshot = snapshot;
        if (!snapshot.sky.stars.length) {
          await loadStars();
          if (controller.signal.aborted) return null;
          diagramSnapshot = {
            ...snapshot,
            sky: calculateSky(snapshot.location, snapshot.instant, snapshot.sky.events),
          };
        }
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 1200;
        const options = { theme, locale: i18n.locale };
        if (style === 'chart') renderSkyChart(canvas, diagramSnapshot, options);
        else
          renderMinimalSkyMap(canvas, diagramSnapshot, {
            ...options,
            composition: framing,
            layers: { lines },
          });
        return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      }
      const [, landscapeArt] = await Promise.all([
        labelFontReady(
          place + m.moment.attribution + copy.clearSkyBadge + m.phases[imageSnapshot.sky.moon.phase],
        ),
        artwork,
      ]);
      return new Promise<Blob | null>((resolve) => {
        if (ticket !== request.current) return resolve(null);
        const frame =
          style === 'realistic'
            ? latest.current({
                ridge: horizon === 'ridge',
                snapshot: imageSnapshot,
                ...(clearSkyImage ? { weather: imageSnapshot.weather } : {}),
              })
            : null;
        if (style === 'realistic' && !frame) return resolve(null);
        drawPostcard({
          snapshot: imageSnapshot,
          style,
          horizon,
          capture: frame,
          landscapeArt,
          i18n,
          site: window.location.host,
        }).toBlob(resolve, 'image/png');
      });
    };
    void draw().then(
      (blob) => {
        if (controller.signal.aborted || ticket !== request.current) return;
        if (!blob) return setStatus('failed');
        const url = URL.createObjectURL(blob);
        pendingUrl.current = url;
        // toBlob is not image-ready: the staged <img> must load and decode first.
        setPendingImage({ url, blob });
      },
      () => {
        if (!controller.signal.aborted && ticket === request.current) setStatus('failed');
      },
    );
    return () => controller.abort();
  }, [
    snapshot,
    imageSnapshot,
    style,
    horizon,
    clearSkyImage,
    framing,
    i18n,
    m,
    copy,
    place,
    moonSettings,
    renderSize,
    theme,
    lines,
    retry,
  ]);
  useEffect(
    () => () => {
      request.current++;
      if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
    },
    [],
  );
  // The previous bitmap is released after React commits its decoded replacement.
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url);
    },
    [image],
  );

  const finishPending = (candidate: PreviewImage, ok: boolean) => {
    if (pendingUrl.current !== candidate.url) return;
    pendingUrl.current = null;
    setPendingImage(null);
    setStatus(ok ? 'ready' : 'failed');
    if (ok) setImage({ url: candidate.url, blob: candidate.blob });
    else URL.revokeObjectURL(candidate.url);
  };
  const showPending = (candidate: PreviewImage, element: HTMLImageElement) => {
    void Promise.resolve()
      .then(() => element.decode?.())
      .then(
        () => finishPending(candidate, true),
        () => finishPending(candidate, false),
      );
  };

  // The moment's own civil date, as printed on the image, not the UTC one.
  const date = getZonedParts(snapshot.instant, snapshot.location.timezone).date;
  const filename =
    style === 'moon'
      ? `elsewhere-moon-${date}-${renderSize}.png`
      : `elsewhere-${style === 'chart' || style === 'minimal' ? style : 'sky'}-${date}.png`;
  const file =
    ready && image && (style !== 'moon' || renderSize === resolution)
      ? new File([image.blob], filename, { type: 'image/png' })
      : null;
  const canSend = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const changeMoon = (settings: Partial<MoonPortraitSettings>) => {
    request.current++;
    setStatus('drawing');
    setRenderSize(512);
    setMoonSettings((previous) => ({ ...previous, ...settings }));
  };
  const controls = (
    <div className="moment-image-controls" style={{ fontFamily: FONT }}>
      <h3 id="moment-title">{copy.section}</h3>
      {postcard && (
        <label className="moment-clear-sky">
          <input
            type="checkbox"
            checked={clearSkyImage}
            onChange={(event) => {
              setStatus('drawing');
              setClearSkyImage(event.target.checked);
            }}
          />
          {copy.clearSkyImage}
        </label>
      )}
      <div className="moment-options">
        <div role="group" aria-label={m.moment.style} className="segmented moment-types">
          {IMAGE_STYLES.map((value) => (
            <button
              key={value}
              aria-pressed={style === value}
              onClick={() => {
                if (style === value) return;
                request.current++;
                setStatus('drawing');
                setRenderSize(512);
                setStyle(value);
              }}
            >
              {value === 'realistic' || value === 'illustrated' ? m.moment.styles[value] : sdkCopy[value]}
            </button>
          ))}
        </div>
        {(postcard || style === 'minimal') && (
          <div role="group" aria-label={copy.framing} className="segmented">
            {(['auto', 'current'] as const).map((value) => (
              <button
                key={value}
                aria-pressed={framing === value}
                onClick={() => {
                  if (framing !== value) setStatus('drawing');
                  setFraming(value);
                }}
              >
                {value === 'auto' ? copy.autoFraming : copy.currentFraming}
              </button>
            ))}
          </div>
        )}
        {postcard && (
          <div role="group" aria-label={m.moment.horizon} className="segmented four">
            {HORIZON_VARIANTS.map((value) => (
              <button
                key={value}
                aria-pressed={horizon === value}
                onClick={() => {
                  if (horizon !== value) setStatus('drawing');
                  setHorizon(value);
                }}
              >
                {m.moment.horizons[value]}
              </button>
            ))}
          </div>
        )}
        {(style === 'chart' || style === 'minimal') && (
          <label className="moment-field">
            {sdkCopy.theme}
            <select
              value={theme}
              onChange={(event) => {
                request.current++;
                setStatus('drawing');
                setTheme(event.target.value as typeof theme);
              }}
            >
              <option value="midnight">{sdkCopy.midnight}</option>
              <option value="paper">{sdkCopy.paper}</option>
            </select>
          </label>
        )}
        {style === 'minimal' && (
          <label className="moment-field">
            <input
              type="checkbox"
              checked={lines}
              onChange={(event) => {
                request.current++;
                setStatus('drawing');
                setLines(event.target.checked);
              }}
            />
            {sdkCopy.lines}
          </label>
        )}
        {style === 'moon' && (
          <>
            <label className="moment-field">
              {sdkCopy.orientation}
              <select
                value={moonSettings.orientation}
                onChange={(event) =>
                  changeMoon({ orientation: event.target.value as MoonPortraitSettings['orientation'] })
                }
              >
                <option value="observer">{sdkCopy.observer}</option>
                <option value="north-up">{sdkCopy.northUp}</option>
              </select>
            </label>
            <label className="moment-field">
              {sdkCopy.background}
              <select
                value={moonSettings.background}
                onChange={(event) =>
                  changeMoon({ background: event.target.value as MoonPortraitSettings['background'] })
                }
              >
                <option value="transparent">{sdkCopy.transparent}</option>
                <option value="dark">{sdkCopy.dark}</option>
                <option value="light">{sdkCopy.light}</option>
              </select>
            </label>
            <label className="moment-field">
              <input
                type="checkbox"
                checked={moonSettings.earthshine}
                onChange={(event) => changeMoon({ earthshine: event.target.checked })}
              />
              {sdkCopy.earthshine}
            </label>
            <label className="moment-field">
              {sdkCopy.resolution}
              <select
                value={resolution}
                onChange={(event) => {
                  if (renderSize !== 512) {
                    request.current++;
                    setStatus('drawing');
                    setRenderSize(512);
                  }
                  setResolution(Number(event.target.value));
                }}
              >
                {[1024, 2048, 4096].map((size) => (
                  <option key={size} value={size}>
                    {size} × {size}
                  </option>
                ))}
              </select>
            </label>
            <small className="muted moment-types">{sdkCopy.credit}</small>
          </>
        )}
      </div>
      <div className="moment-actions">
        {status === 'failed' && (
          <button className="secondary-button" onClick={() => setRetry((value) => value + 1)}>
            {sdkCopy.retry}
          </button>
        )}
        {style === 'moon' && !file && status !== 'failed' && (
          <button
            className="secondary-button"
            disabled={!ready}
            onClick={() => {
              request.current++;
              setStatus('drawing');
              setRenderSize(resolution);
            }}
          >
            {sdkCopy.prepare}
          </button>
        )}
        {file && image && (
          <a className="secondary-button" href={image.url} download={file.name}>
            <span className="moment-download-icon" aria-hidden="true" />
            {m.moment.save}
          </a>
        )}
        {canSend && (
          <button
            className="secondary-button"
            onClick={() => navigator.share({ files: [file!], text: link }).catch(() => {})}
          >
            <Share2 size={17} />
            {m.moment.send}
          </button>
        )}
      </div>
    </div>
  );
  return (
    <section className="moment-image" aria-labelledby="moment-title" style={{ fontFamily: FONT }}>
      {controlsTarget ? createPortal(controls, controlsTarget) : controls}
      <div className="moment-preview-slot" aria-busy={status === 'drawing'}>
        {image && (
          <img
            className="moment-preview"
            src={image.url}
            alt={
              style === 'moon'
                ? sdkCopy.moon + ' · ' + m.phases[snapshot.sky.moon.phase] + ' · ' + place
                : style === 'chart' || style === 'minimal'
                  ? sdkCopy[style] + ' · ' + place
                  : m.moment.alt({ place })
            }
            aria-hidden={!ready}
          />
        )}
        {pendingImage && (
          <img
            className="moment-preview-staged"
            src={pendingImage.url}
            alt=""
            aria-hidden="true"
            onLoad={(event) => showPending(pendingImage, event.currentTarget)}
            onError={() => finishPending(pendingImage, false)}
          />
        )}
        {!ready && (
          <div className="moment-preview-transition" role="status">
            <span className="moment-preview-orbit" aria-hidden="true" />
            {status === 'failed' ? m.moment.failed : m.moment.drawing}
          </div>
        )}
      </div>
    </section>
  );
}
