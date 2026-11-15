import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Check, Share2, X } from 'lucide-react';
import type { AppNotice, LocationInfo } from '../types';
import type { SkyObject } from '../lib/exploration';
import { isDeviceLocation } from '../lib/locations';
import { useI18n } from '../i18n';
import { objectName } from '../i18n/names';

export interface ShareDialogHandle {
  /** `focus` is the object the link opens centered on, if any. */
  open: (link: string, focus?: SkyObject) => void;
}

interface Props {
  location: LocationInfo;
  includesCustomWeather: boolean;
  onNotice: (notice: AppNotice) => void;
}

const ShareDialog = forwardRef<ShareDialogHandle, Props>(function ShareDialog(
  { location, includesCustomWeather, onNotice },
  ref,
) {
  const i18n = useI18n();
  const { m } = i18n;
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState('');
  // The object, not its name, so the sentence follows a language change while the dialog is open.
  const [focus, setFocus] = useState<SkyObject>();
  const [copied, setCopied] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      open: (next, object) => {
        setLink(next);
        setFocus(object);
        setCopied(false);
        dialog.current?.showModal();
      },
    }),
    [],
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
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
        {m.share.includes({
          focus: focus && objectName(focus, i18n),
          customWeather: includesCustomWeather,
        })}
      </p>
      {isDeviceLocation(location) && (
        <p className="privacy-note">
          {m.share.device({ latitude: location.latitude, longitude: location.longitude })}
        </p>
      )}
      <label className="share-field">
        {m.share.field}
        <input ref={input} readOnly value={link} onFocus={(e) => e.target.select()} />
      </label>
      <button className="primary-button full" onClick={copy}>
        {copied ? <Check size={17} /> : <Share2 size={17} />}
        {copied ? m.share.copied : m.share.copy}
      </button>
    </dialog>
  );
});
export default ShareDialog;
