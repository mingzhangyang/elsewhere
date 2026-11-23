import { landscapeSeason } from '../moment/seasons';
import { loadLandscapeArt } from '../moment/landscapeArt';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
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

/**
 * The keepsake image in the share dialog (ROADMAP phase 3 prototype), loaded only when asked for.
 * Two variant pairs for the test sessions: realistic or illustrated, and the ridge or a scenery
 * silhouette. The image is worded in the language shown, the sender's, and redrawn if it changes.
 */
export default function MomentImage({
  snapshot,
  capture,
  link,
}: {
  snapshot: MomentSnapshot;
  capture: (options: SkyCaptureOptions) => SkyCapture | null;
  link: string;
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
  const choices = useMemo(
    () => ({ imageSnapshot, style, horizon, clearSkyImage, i18n, m, copy }),
    [imageSnapshot, style, horizon, clearSkyImage, i18n, m, copy],
  );
  const [image, setImage] = useState<{ url: string; blob: Blob; choices: typeof choices } | null>(null);
  const [failedChoices, setFailedChoices] = useState<typeof choices | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const request = useRef(0);
  const urls = useRef(new Set<string>());
  const latest = useRef(capture);
  const current = image?.choices === choices ? image : null;
  const failed = failedChoices === choices;
  const ready = !!current && loadedUrl === current.url;
  latest.current = capture;
  useEffect(() => {
    const { imageSnapshot, style, horizon, clearSkyImage, i18n, m, copy } = choices;
    // Keep the old image dimmed in a fixed slot, but never expose it for saving or sharing.
    // The key also hides stale exports immediately, before this effect runs.
    const ticket = ++request.current;
    setFailedChoices(null);
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
          if (!blob) return setFailedChoices(choices);
          const url = URL.createObjectURL(blob);
          urls.current.add(url);
          setImage({ url, blob, choices });
        },
        () => ticket === request.current && setFailedChoices(choices),
      );
  }, [choices]);
  useEffect(
    () => () => {
      // Revoke the old image only after React has replaced it in the preview.
      if (image && urls.current.delete(image.url)) URL.revokeObjectURL(image.url);
    },
    [image],
  );
  useEffect(
    () => () => {
      // Cancel in-flight work and release even URLs allocated just before unmount.
      request.current++;
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    },
    [],
  );

  // The moment's own civil date, as printed on the image, not the UTC one.
  const date = getZonedParts(snapshot.instant, snapshot.location.timezone).date;
  const file =
    ready && current ? new File([current.blob], `elsewhere-sky-${date}.png`, { type: 'image/png' }) : null;
  const canSend = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const place = isDeviceLocation(snapshot.location)
    ? m.moment.devicePlace
    : placeLabel(snapshot.location, i18n).name;
  return (
    <section className="moment-image" aria-labelledby="moment-title" style={{ fontFamily: FONT }}>
      <h3 id="moment-title">{copy.section}</h3>
      <label className="moment-clear-sky">
        <input
          type="checkbox"
          checked={clearSkyImage}
          onChange={(event) => setClearSkyImage(event.target.checked)}
        />
        {copy.clearSkyImage}
      </label>
      <div className="moment-preview-slot" aria-busy={!ready && !failed}>
        {image && (
          <img
            className={ready ? 'moment-preview is-ready' : 'moment-preview is-stale'}
            src={image.url}
            alt={m.moment.alt({ place })}
            aria-hidden={!ready}
            onLoad={() => setLoadedUrl(image.url)}
            onError={() => setFailedChoices(image.choices)}
          />
        )}
        {!ready && (
          <div className="moment-preview-transition" role="status">
            {!failed && <span className="moment-preview-orbit" aria-hidden="true" />}
            <span>{failed ? m.moment.failed : m.moment.drawing}</span>
          </div>
        )}
      </div>
      <div className="moment-options">
        <div role="group" aria-label={m.moment.style} className="segmented">
          {MOMENT_STYLES.map((value) => (
            <button key={value} aria-pressed={style === value} onClick={() => setStyle(value)}>
              {m.moment.styles[value]}
            </button>
          ))}
        </div>
        <div role="group" aria-label={m.moment.horizon} className="segmented four">
          {HORIZON_VARIANTS.map((value) => (
            <button key={value} aria-pressed={horizon === value} onClick={() => setHorizon(value)}>
              {m.moment.horizons[value]}
            </button>
          ))}
        </div>
      </div>
      <div className="moment-actions">
        {ready && current && (
          <>
            <a className="secondary-button" href={current.url} download={file!.name}>
              <Download size={17} />
              {m.moment.save}
            </a>
            {canSend && (
              <button
                className="secondary-button"
                onClick={() => navigator.share({ files: [file!], text: link }).catch(() => {})}
              >
                <Share2 size={17} />
                {m.moment.send}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
