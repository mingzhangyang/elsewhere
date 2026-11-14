import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Check, Share2, X } from 'lucide-react';
import type { LocationInfo } from '../types';
import { isDeviceLocation } from '../lib/locations';

export interface ShareDialogHandle {
  open: (link: string) => void;
}

interface Props {
  location: LocationInfo;
  includesCustomWeather: boolean;
  onNotice: (message: string) => void;
}

const ShareDialog = forwardRef<ShareDialogHandle, Props>(function ShareDialog(
  { location, includesCustomWeather, onNotice },
  ref,
) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      open: (next) => {
        setLink(next);
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
      onNotice('Select the link and copy it with your keyboard.');
    }
  };
  return (
    <dialog ref={dialog} className="share-dialog" aria-labelledby="share-title">
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">Keep a moment</p>
          <h2 id="share-title">Share this sky</h2>
        </div>
        <button className="icon-button" aria-label="Close sharing" onClick={() => dialog.current?.close()}>
          <X />
        </button>
      </div>
      <p>
        This link includes the place, exact time, camera view, layers
        {includesCustomWeather ? ', and custom weather' : ''}.
      </p>
      {isDeviceLocation(location) && (
        <p className="privacy-note">
          It includes your exact device coordinates: {location.latitude.toFixed(5)},{' '}
          {location.longitude.toFixed(5)}. Share only if you want the recipient to see this location.
        </p>
      )}
      <label className="share-field">
        Sky link
        <input ref={input} readOnly value={link} onFocus={(e) => e.target.select()} />
      </label>
      <button className="primary-button full" onClick={copy}>
        {copied ? <Check size={17} /> : <Share2 size={17} />}
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </dialog>
  );
});
export default ShareDialog;
