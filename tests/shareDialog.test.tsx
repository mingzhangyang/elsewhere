import { act, createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';
import ShareDialog, {
  MomentUnavailable,
  type ShareDialogHandle,
  type ShareRequest,
} from '../src/components/ShareDialog';
import { setLanguage } from '../src/i18n';
import { normalizeLocation, PRESETS } from '../src/lib/locations';
import { parseExploration } from '../src/lib/persistence';

vi.mock('../src/components/MomentImage', async () => {
  const { createPortal } = await import('react-dom');
  return {
    default: ({ controlsTarget }: { controlsTarget?: HTMLElement | null }) => {
      const controls = (
        <div className="moment-image-controls" data-testid="image-controls">
          <button>Illustrated</button>
          <button>Save image</button>
        </div>
      );
      return (
        <section className="moment-image">
          {controlsTarget ? createPortal(controls, controlsTarget) : controls}
          <div className="moment-preview-slot" aria-busy="true" />
        </section>
      );
    },
  };
});

beforeAll(() => setLanguage('en'));

const device = normalizeLocation({
  ...PRESETS[2],
  latitude: 35.71234,
  longitude: 139.71234,
  source: 'device',
});
const request = {
  exploration: {
    version: 1,
    location: device,
    instant: '2026-11-15T12:00:00.000Z',
    camera: { heading: 0, altitude: 18, fov: 66 },
    layers: { stars: true, lines: false, labels: true },
    custom: null,
  },
  snapshot: {},
} as unknown as ShareRequest;

function openDialog() {
  const ref = createRef<ShareDialogHandle>();
  render(<ShareDialog ref={ref} includesCustomWeather={false} onNotice={() => {}} capture={() => null} />);
  act(() => ref.current!.open(request));
}
const copyButton = () => screen.getByRole('button', { name: /^(Copy link|Copied)$/ });
const exact = () => screen.getByRole('checkbox', { name: 'Share my exact location' });

it('says Copied only while the copied link is the one on screen (precise → copy → rounded)', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  openDialog();
  fireEvent.click(exact());
  await act(async () => fireEvent.click(copyButton()));
  expect(parseExploration(new URL(writeText.mock.calls[0][0]).hash).value?.location.latitude)
    .toBe(35.71234);
  expect(copyButton()).toHaveTextContent('Copied');
  // Back to the rounded link: the clipboard still holds the precise one, so no confirmation.
  fireEvent.click(exact());
  expect(copyButton()).toHaveTextContent('Copy link');
  await act(async () => fireEvent.click(copyButton()));
  expect(parseExploration(new URL(writeText.mock.calls.at(-1)![0]).hash).value?.location.latitude)
    .toBe(35.7);
  expect(copyButton()).toHaveTextContent('Copied');
});

it('a copy still in flight when the link changes is not confirmed for the new link', async () => {
  let finish = () => {};
  vi.stubGlobal('navigator', {
    clipboard: { writeText: () => new Promise<void>((resolve) => (finish = resolve)) },
  });
  openDialog();
  fireEvent.click(exact());
  fireEvent.click(copyButton());
  fireEvent.click(exact());
  await act(async () => finish());
  expect(copyButton()).toHaveTextContent('Copy link');
});

it('automatically shows a preview and puts image controls beside link controls', async () => {
  openDialog();
  const dialog = screen.getByRole('dialog', { name: 'Share this sky' });
  const linkPanel = dialog.querySelector('.share-link-panel');
  const imagePanel = dialog.querySelector('.share-image-panel');

  expect(linkPanel).toContainElement(screen.getByRole('textbox', { name: 'Sky link' }));
  expect(linkPanel).toContainElement(copyButton());
  expect(linkPanel).toContainElement(exact());
  expect(imagePanel?.querySelector('.moment-preview-slot')).toBeInTheDocument();
  expect(imagePanel).not.toContainElement(screen.getByRole('textbox', { name: 'Sky link' }));
  expect(imagePanel).not.toContainElement(screen.queryByRole('button', { name: 'Illustrated' }));
  expect(dialog).not.toContainElement(screen.queryByRole('button', { name: 'Make an image' }));
  const imageControls = await screen.findByTestId('image-controls');
  expect(linkPanel).toContainElement(imageControls);
  expect(linkPanel).toContainElement(screen.getByRole('button', { name: 'Save image' }));
});

it('keeps the fixed-size preview slot when the lazy image module fails', () => {
  const { container } = render(<MomentUnavailable />);
  const slot = container.querySelector('.moment-preview-slot');
  expect(slot).toBeInTheDocument();
  expect(slot).toHaveAttribute('aria-busy', 'false');
  expect(slot?.querySelector('.moment-preview-transition')).toHaveAttribute('role', 'status');
});
