import {
  SkyArtworkExportError,
  type SkyArtworkPng,
  type SkyArtworkUrlLease,
  type SkyArtworkUrlPort,
} from './skyArtworkExport';

/** These actions must be initiated by a direct user gesture in SM3-C. */
export type SkyArtworkShareCapability = 'files' | 'text-only' | 'unavailable' | 'file-unsupported';

export interface SkyArtworkSharePort {
  share?(data: ShareData): Promise<void>;
  canShare?(data: ShareData): boolean;
}

export function skyArtworkShareCapability(
  output: SkyArtworkPng,
  port: SkyArtworkSharePort | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): SkyArtworkShareCapability {
  if (!port || typeof port.share !== 'function') return 'unavailable';
  let file: File;
  try {
    file = output.file;
  } catch (error) {
    if (error instanceof SkyArtworkExportError && error.code === 'file-unsupported') {
      return 'file-unsupported';
    }
    throw error;
  }
  if (typeof port.canShare !== 'function') return 'text-only';
  try {
    return port.canShare({ files: [file] }) ? 'files' : 'text-only';
  } catch {
    return 'text-only';
  }
}

export type SkyArtworkShareResult = 'shared' | 'cancelled';

/**
 * Synchronous up to navigator.share(). The caller MUST call from a real click/tap,
 * after preparing the File in advance; do not await PNG creation inside the gesture.
 * Resolved share promises mean the browser reported success, not target app delivery.
 */
export function shareSkyArtwork(
  output: SkyArtworkPng,
  port: SkyArtworkSharePort | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): Promise<SkyArtworkShareResult> {
  if (skyArtworkShareCapability(output, port) !== 'files') {
    throw new SkyArtworkExportError('share-unavailable', 'This browser cannot share PNG files.');
  }
  let operation: Promise<void>;
  try {
    operation = port!.share!({ files: [output.file] });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return Promise.resolve('cancelled');
    }
    throw new SkyArtworkExportError('share-rejected', 'Browser refused to open the share sheet.', false, error);
  }
  return operation.then(
    () => 'shared' as const,
    (error: unknown) => {
      if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') {
        return 'cancelled' as const;
      }
      throw new SkyArtworkExportError('share-rejected', 'System image sharing failed or was denied.', false, error);
    },
  );
}

export interface SkyArtworkDownloadPort {
  /** A DOM anchor adapter is injectable so tests never trigger a real download. */
  readonly createAnchor?: () => HTMLAnchorElement;
  readonly append?: (anchor: HTMLAnchorElement) => void;
  readonly openImage?: (url: string) => boolean;
  readonly urls?: SkyArtworkUrlPort;
  readonly deferRelease?: (release: () => void) => void;
}

export interface SkyArtworkDownloadResult {
  /** Download requested != saved to Files or Photos. */
  readonly status: 'download-requested' | 'image-opened';
  readonly url: string;
  /** Explicit early cleanup for abandoned navigation or a disposed test host. */
  release(): void;
}

/**
 * A temporary Object URL is leased from the output and automatically revoked
 * after a bounded handoff interval. Do not revoke synchronously after .click():
 * WebKit and mobile download handlers may consume the URL asynchronously.
 */
export function downloadSkyArtwork(
  output: SkyArtworkPng,
  port: SkyArtworkDownloadPort = {},
): SkyArtworkDownloadResult {
  if (typeof document === 'undefined' && !port.createAnchor) {
    throw new SkyArtworkExportError('download-unavailable', 'No browser download environment.');
  }
  let lease: SkyArtworkUrlLease | null = null;
  let anchor: HTMLAnchorElement | null = null;
  try {
    lease = output.objectUrl(port.urls);
    anchor = port.createAnchor?.() ?? document.createElement('a');
    const supportsDownload = 'download' in anchor;
    let status: SkyArtworkDownloadResult['status'];
    if (supportsDownload) {
      anchor.href = lease.url;
      anchor.download = output.filename;
      anchor.rel = 'noopener';
      if (port.append) port.append(anchor);
      else document.body.append(anchor);
      anchor.click();
      status = 'download-requested';
    } else {
      const opened =
        port.openImage?.(lease.url) ??
        (typeof window !== 'undefined' && !!window.open(lease.url, '_blank', 'noopener'));
      if (!opened) {
        throw new SkyArtworkExportError('download-unavailable', 'Image download and opening are unavailable.');
      }
      status = 'image-opened';
    }
    const release = lease.release;
    const deferRelease =
      port.deferRelease ??
      ((callback: () => void) => {
        // Delayed revocation is a handoff heuristic, not an OS save receipt.
        setTimeout(callback, 60_000);
      });
    deferRelease(release);
    return { status, url: lease.url, release };
  } catch (error) {
    lease?.release();
    if (error instanceof SkyArtworkExportError) throw error;
    throw new SkyArtworkExportError('download-failed', 'The browser refused the PNG download.', false, error);
  } finally {
    anchor?.remove();
  }
}
