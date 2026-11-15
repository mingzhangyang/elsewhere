import { act, createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';
import ShareDialog, { type ShareDialogHandle, type ShareRequest } from '../src/components/ShareDialog';
import { setLanguage } from '../src/i18n';
import { normalizeLocation, PRESETS } from '../src/lib/locations';

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
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('35.71234'));
  expect(copyButton()).toHaveTextContent('Copied');
  // Back to the rounded link: the clipboard still holds the precise one, so no confirmation.
  fireEvent.click(exact());
  expect(copyButton()).toHaveTextContent('Copy link');
  await act(async () => fireEvent.click(copyButton()));
  expect(writeText).toHaveBeenLastCalledWith(expect.not.stringContaining('35.71234'));
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
