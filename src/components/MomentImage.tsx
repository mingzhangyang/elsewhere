import { landscapeSeason } from '../moment/seasons';
import { loadLandscapeArt } from '../moment/landscapeArt';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { MomentSnapshot } from '../lib/moment';
import { momentImageSnapshot } from '../moment/imageWeather';
import { momentImageCopy } from '../moment/imageCopy';
import type { SkyCapture, SkyCaptureOptions } from '../renderer/createSkyRenderer';
import { useI18n } from '../i18n';
import { placeLabel } from '../i18n/names';
import { isDeviceLocation } from '../lib/locations';
import { labelFontReady } from '../renderer/labelFont';
import { drawPostcard, FONT, MOMENT_STYLES, type MomentStyle } from '../moment/postcard';
import { HORIZON_VARIANTS, type HorizonVariant } from '../moment/scenery';
import { getZonedParts } from '../domain/time';

type PreviewImage = { url: string; blob: Blob };
type PendingPreview = PreviewImage & { ticket: number };

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
}: {
  snapshot: MomentSnapshot;
  capture: (options: SkyCaptureOptions) => SkyCapture | null;
  link: string;
  controlsTarget?: HTMLElement | null;
}) {
  const i18n = useI18n();
  const { m } = i18n;
  const copy = momentImageCopy[i18n.locale];
  const [style, setStyle] = useState<MomentStyle>('realistic');
  const [horizon, setHorizon] = useState<HorizonVariant>('ridge');
  const [clearSkyImage, setClearSkyImage] = useState(true);
  const imageSnapshot = useMemo(
    () => momentImageSnapshot(snapshot, clearSkyImage),
    [snapshot, clearSkyImage],
  );
  const [image, setImage] = useState<PreviewImage | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingPreview | null>(null);
  const [failed, setFailed] = useState(false);
  const [drawing, setDrawing] = useState(true);
  const request = useRef(0);
  const shown = useRef<string | null>(null);
  const pendingUrl = useRef<string | null>(null);
  const retired = useRef<string[]>([]);
  const latest = useRef(capture);
  latest.current = capture;
  const ready = !!image && !drawing && !failed;
  useEffect(() => {
    // Only the latest request is shown; a slower earlier one is discarded.
    const ticket = ++request.current;
    // A superseded decode must never replace the visible bitmap or leak its object URL.
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
    pendingUrl.current = null;
    setPendingImage(null);
    setFailed(false);
    // Keep the previous image visible while the selected variant is redrawn.
    setDrawing(true);
    const place = isDeviceLocation(imageSnapshot.location)
      ? m.moment.devicePlace
      : placeLabel(imageSnapshot.location, i18n).name;
    const artwork =
      style === 'illustrated' && horizon !== 'ridge'
        ? loadLandscapeArt(
            horizon,
            landscapeSeason(imageSnapshot),
            imageSnapshot.sky.sunAltitude,
            imageSnapshot.sky.sun.azimuth,
          )
        : null;
    Promise.all([
      labelFontReady(
        place + m.moment.attribution + copy.clearSkyBadge + m.phases[imageSnapshot.sky.moon.phase],
      ),
      artwork,
    ])
      .then(
        ([, landscapeArt]) =>
          new Promise<Blob | null>((resolve) => {
            const frame =
              style === 'realistic'
                ? latest.current({
                    ridge: horizon === 'ridge',
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
          }),
      )
      .then(
        (blob) => {
          if (ticket !== request.current) return;
          if (!blob) {
            setDrawing(false);
            return setFailed(true);
          }
          const url = URL.createObjectURL(blob);
          pendingUrl.current = url;
          // toBlob is not image-ready: the staged <img> must load and decode first.
          setPendingImage({ url, blob, ticket });
        },
        () => {
          if (ticket === request.current) {
            setDrawing(false);
            setFailed(true);
          }
        },
      );
  }, [imageSnapshot, style, horizon, clearSkyImage, i18n, m, copy]);
  useEffect(
    () => () => {
      // Work still pending when the dialog closes is discarded before it allocates a URL.
      request.current++;
      if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
      if (shown.current) URL.revokeObjectURL(shown.current);
      for (const url of retired.current) URL.revokeObjectURL(url);
      pendingUrl.current = null;
      shown.current = null;
      retired.current = [];
    },
    [],
  );
  useEffect(() => {
    // Revoke the old preview only after React has committed the decoded replacement.
    for (const url of retired.current.splice(0)) URL.revokeObjectURL(url);
  }, [image]);

  const failPending = (candidate: PendingPreview) => {
    if (candidate.ticket !== request.current || pendingUrl.current !== candidate.url) return;
    pendingUrl.current = null;
    URL.revokeObjectURL(candidate.url);
    setPendingImage(null);
    setDrawing(false);
    setFailed(true);
  };
  const showPending = (candidate: PendingPreview, element: HTMLImageElement) => {
    // onLoad alone does not ensure the bitmap can be painted on slower devices.
    void Promise.resolve()
      .then(() => element.decode?.())
      .then(
        () => {
          if (candidate.ticket !== request.current || pendingUrl.current !== candidate.url) return;
          pendingUrl.current = null;
          if (shown.current) retired.current.push(shown.current);
          shown.current = candidate.url;
          setImage({ url: candidate.url, blob: candidate.blob });
          setPendingImage(null);
          setDrawing(false);
        },
        () => failPending(candidate),
      );
  };

  // The moment's own civil date, as printed on the image, not the UTC one.
  const date = getZonedParts(snapshot.instant, snapshot.location.timezone).date;
  const file =
    ready && image ? new File([image.blob], `elsewhere-sky-${date}.png`, { type: 'image/png' }) : null;
  const canSend = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const place = isDeviceLocation(snapshot.location)
    ? m.moment.devicePlace
    : placeLabel(snapshot.location, i18n).name;
  const controls = (
    <div className="moment-image-controls" style={{ fontFamily: FONT }}>
      <h3 id="moment-title">{copy.section}</h3>
      <label className="moment-clear-sky">
        <input
          type="checkbox"
          checked={clearSkyImage}
          onChange={(event) => {
            setDrawing(true);
            setClearSkyImage(event.target.checked);
          }}
        />
        {copy.clearSkyImage}
      </label>
      <div className="moment-options">
        <div role="group" aria-label={m.moment.style} className="segmented">
          {MOMENT_STYLES.map((value) => (
            <button
              key={value}
              aria-pressed={style === value}
              onClick={() => {
                if (style !== value) setDrawing(true);
                setStyle(value);
              }}
            >
              {m.moment.styles[value]}
            </button>
          ))}
        </div>
        <div role="group" aria-label={m.moment.horizon} className="segmented four">
          {HORIZON_VARIANTS.map((value) => (
            <button
              key={value}
              aria-pressed={horizon === value}
              onClick={() => {
                if (horizon !== value) setDrawing(true);
                setHorizon(value);
              }}
            >
              {m.moment.horizons[value]}
            </button>
          ))}
        </div>
      </div>
      <div className="moment-actions">
        {ready && image && (
          <a className="secondary-button" href={image.url} download={file!.name}>
            <Download size={17} />
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
      <div className="moment-preview-slot" aria-busy={drawing}>
        {image && (
          <img
            className="moment-preview"
            src={image.url}
            alt={m.moment.alt({ place })}
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
            onError={() => failPending(pendingImage)}
          />
        )}
        {!ready && (
          <div className="moment-preview-transition" role="status">
            <span className="moment-preview-orbit" aria-hidden="true" />
            {failed ? m.moment.failed : m.moment.drawing}
          </div>
        )}
      </div>
    </section>
  );
}
