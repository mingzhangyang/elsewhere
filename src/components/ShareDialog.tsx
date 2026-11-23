import { forwardRef, lazy, Suspense, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Check, ImageIcon, Share2, X } from 'lucide-react';
import type { AppNotice } from '../types';
import type { MomentSnapshot } from '../lib/moment';
import type { SkyCapture, SkyCaptureOptions } from '../renderer/createSkyRenderer';
import { cityLevel, explorationUrl, type Exploration } from '../lib/persistence';
import { isDeviceLocation } from '../lib/locations';
import { useI18n } from '../i18n';
import { objectName } from '../i18n/names';

// The keepsake image and its drawing code load only when someone asks for an image. A failed
// download (offline, a replaced deployment) says so in the dialog rather than breaking the app.
const MomentImage = lazy(() => import('./MomentImage').catch(() => ({ default: MomentUnavailable })));
function MomentUnavailable() {
  const { m } = useI18n();
  return (
    <p className="form-status" role="status">
      {m.moment.failed}
    </p>
  );
}

export interface ShareRequest {
  /** The exploration as it is on screen, with the place's exact coordinates. */
  exploration: Exploration;
  /** What the keepsake image is drawn from; its subject is the object or pattern the link turns to. */
  snapshot: MomentSnapshot;
}
export interface ShareDialogHandle {
  open: (request: ShareRequest) => void;
}

interface Props {
  includesCustomWeather: boolean;
  onNotice: (notice: AppNotice) => void;
  capture: (options: SkyCaptureOptions) => SkyCapture | null;
}

const ShareDialog = forwardRef<ShareDialogHandle, Props>(function ShareDialog(
  { includesCustomWeather, onNotice, capture },
  ref,
) {
  const i18n = useI18n();
  const { m } = i18n;
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Codes and objects, not text, so everything follows a language change while the dialog is open.
  const [request, setRequest] = useState<ShareRequest | null>(null);
  const [precise, setPrecise] = useState(false);
  // The link last written to the clipboard: "Copied" shows only while it is the link on screen, so
  // unticking "exact location" after copying never leaves a precise link looking like the rounded one.
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [imageShown, setImageShown] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      open: (next) => {
        setRequest(next);
        setPrecise(false);
        setCopiedLink(null);
        setImageShown(false);
        dialog.current?.showModal();
      },
    }),
    [],
  );
  const location = request?.exploration.location;
  const device = !!location && isDeviceLocation(location);
  // A device location is shared at city level unless the person ticks the box (principle 4).
  const shared = useMemo(
    () =>
      request && {
        ...request.exploration,
        location: precise ? request.exploration.location : cityLevel(request.exploration.location),
      },
    [request, precise],
  );
  const link = shared ? explorationUrl(shared) : '';
  const subject = request?.snapshot.subject;
  const subjectName =
    subject?.kind === 'object'
      ? objectName(subject.object, i18n)
      : subject
        ? m.patterns[subject.id]
        : undefined;
  const copied = !!link && copiedLink === link;
  const copy = async () => {
    const text = link;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(text);
    } catch {
      input.current?.select();
      onNotice({ code: 'copy-manually' });
    }
  };
  return (
    <dialog ref={dialog} className="share-dialog" aria-labelledby="share-title">
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">{m.share.eyebrow}</p>
          <h2 id="share-title">{m.share.title}</h2>
        </div>
        <button className="icon-button" aria-label={m.share.close} onClick={() => dialog.current?.close()}>
          <X />
        </button>
      </div>
      <p>
        {m.moment.sentences([
          m.share.includes({ focus: subjectName, customWeather: includesCustomWeather }),
          ...(subjectName ? [m.share.arrival({ subject: subjectName })] : []),
        ])}
      </p>
      {device && shared && (
        <>
          <p className="privacy-note">
            {precise
              ? m.share.device({ latitude: shared.location.latitude, longitude: shared.location.longitude })
              : m.share.deviceRounded({
                  latitude: shared.location.latitude,
                  longitude: shared.location.longitude,
                })}
          </p>
          <label className="share-precise">
            <input type="checkbox" checked={precise} onChange={(event) => setPrecise(event.target.checked)} />
            {m.share.precise}
          </label>
        </>
      )}
      <label className="share-field">
        {m.share.field}
        <input ref={input} readOnly value={link} onFocus={(e) => e.target.select()} />
      </label>
      <button className="primary-button full" onClick={copy}>
        {copied ? <Check size={17} /> : <Share2 size={17} />}
        {copied ? m.share.copied : m.share.copy}
      </button>
      {request &&
        (imageShown ? (
          <Suspense
            fallback={
              <p className="form-status" role="status">
                {m.moment.drawing}
              </p>
            }
          >
            <MomentImage snapshot={request.snapshot} capture={capture} link={link} />
          </Suspense>
        ) : (
          <button className="secondary-button full moment-make" onClick={() => setImageShown(true)}>
            <ImageIcon size={17} />
            {m.moment.make}
          </button>
        ))}
    </dialog>
  );
});
export default ShareDialog;
