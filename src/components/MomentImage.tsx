import { loadCityImage } from '../moment/city';
import { useEffect, useRef, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import type { MomentSnapshot } from '../lib/moment';
import type { SkyCapture } from '../renderer/createSkyRenderer';
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
  capture: (options: { ridge: boolean }) => SkyCapture | null;
  link: string;
}) {
  const i18n = useI18n();
  const { m } = i18n;
  const [style, setStyle] = useState<MomentStyle>('realistic');
  const [horizon, setHorizon] = useState<HorizonVariant>('ridge');
  const [image, setImage] = useState<{ url: string; blob: Blob } | null>(null);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const shown = useRef<string | null>(null);
  const latest = useRef(capture);
  latest.current = capture;
  useEffect(() => {
    // Only the latest request is shown; a slower earlier one is discarded.
    const ticket = ++request.current;
    setFailed(false);
    // The previous image goes at once: it no longer matches the choices shown, and must not be saved
    // or sent as if it did.
    if (shown.current) URL.revokeObjectURL(shown.current);
    shown.current = null;
    setImage(null);
    const place = isDeviceLocation(snapshot.location)
      ? m.moment.devicePlace
      : placeLabel(snapshot.location, i18n).name;
    const artwork =
      style === 'illustrated' && horizon === 'city'
        ? loadCityImage(snapshot.sky.sunAltitude, snapshot.sky.sun.azimuth)
        : null;
    Promise.all([labelFontReady(place + m.moment.attribution + m.phases[snapshot.sky.moon.phase]), artwork])
      .then(
        ([, cityImage]) =>
          new Promise<Blob | null>((resolve) => {
            const frame = style === 'realistic' ? latest.current({ ridge: horizon === 'ridge' }) : null;
            if (style === 'realistic' && !frame) return resolve(null);
            drawPostcard({
              snapshot,
              style,
              horizon,
              capture: frame,
              cityImage,
              i18n,
              site: window.location.host,
            }).toBlob(resolve, 'image/png');
          }),
      )
      .then(
        (blob) => {
          if (ticket !== request.current) return;
          if (!blob) return setFailed(true);
          const url = URL.createObjectURL(blob);
          shown.current = url;
          setImage({ url, blob });
        },
        () => ticket === request.current && setFailed(true),
      );
  }, [snapshot, style, horizon, i18n, m]);
  useEffect(
    () => () => {
      // Work still pending when the dialog closes is discarded before it allocates a URL.
      request.current++;
      if (shown.current) URL.revokeObjectURL(shown.current);
      shown.current = null;
    },
    [],
  );

  // The moment's own civil date, as printed on the image, not the UTC one.
  const date = getZonedParts(snapshot.instant, snapshot.location.timezone).date;
  const file = image && new File([image.blob], `elsewhere-sky-${date}.png`, { type: 'image/png' });
  const canSend = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const place = isDeviceLocation(snapshot.location)
    ? m.moment.devicePlace
    : placeLabel(snapshot.location, i18n).name;
  return (
    <section className="moment-image" aria-labelledby="moment-title" style={{ fontFamily: FONT }}>
      <h3 id="moment-title">{m.moment.section}</h3>
      <p className="moment-note">{m.moment.note}</p>
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
      {failed ? (
        <p className="form-status" role="status">
          {m.moment.failed}
        </p>
      ) : image ? (
        <img className="moment-preview" src={image.url} alt={m.moment.alt({ place })} />
      ) : (
        <p className="form-status" role="status">
          {m.moment.drawing}
        </p>
      )}
      {image && !failed && (
        <div className="moment-actions">
          <a className="secondary-button" href={image.url} download={file!.name}>
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
        </div>
      )}
    </section>
  );
}
