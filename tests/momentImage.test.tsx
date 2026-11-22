import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { setLanguage } from '../src/i18n';
import { PRESETS } from '../src/lib/locations';
import type { MomentSnapshot } from '../src/lib/moment';

// PNG encoding is held until each test releases it, to force slow and out-of-order results.
const pending: ((blob: Blob | null) => void)[] = [];
vi.mock('../src/moment/postcard', () => ({
  FONT: 'sans-serif',
  MOMENT_STYLES: ['realistic', 'illustrated'],
  drawPostcard: () => ({ toBlob: (done: (blob: Blob | null) => void) => pending.push(done) }),
}));
vi.mock('../src/moment/landscapeArt', () => ({
  loadLandscapeArt: vi.fn(async () => new Image()),
}));
const { default: MomentImage } = await import('../src/components/MomentImage');

let created: string[] = [];
beforeAll(() => setLanguage('en'));
beforeEach(() => {
  pending.length = 0;
  created = [];
  let n = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => {
      const url = `blob:test-${++n}`;
      created.push(url);
      return url;
    },
    revokeObjectURL: () => {},
  });
});

// 00:30 UTC on January 10 is the evening of January 9 in New York.
const snapshot = {
  location: PRESETS[0],
  instant: new Date('2026-01-10T00:30:00Z'),
  sky: { sunAltitude: -18, sun: { azimuth: 270 }, moon: { phase: 'full' } },
} as unknown as MomentSnapshot;
const capture = () => ({ image: document.createElement('canvas'), target: null });
const settle = () => act(async () => {});
const release = async (index: number) => {
  await act(async () => pending[index](new Blob(['png'], { type: 'image/png' })));
};

it('hides the previous image while another variant draws, and ignores a stale result', async () => {
  render(<MomentImage snapshot={snapshot} capture={capture} link="https://example.test/#sky" />);
  await settle();
  await release(0);
  expect(screen.getByRole('img', { name: /New York/ })).toHaveAttribute('src', 'blob:test-1');
  // Named by the moment's own date, as printed, not the UTC one.
  expect(screen.getByRole('link', { name: 'Save image' })).toHaveAttribute(
    'download',
    'elsewhere-sky-2026-01-09.png',
  );

  fireEvent.click(screen.getByRole('button', { name: 'Illustrated' }));
  expect(screen.queryByRole('img', { name: /New York/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Save image' })).not.toBeInTheDocument();
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Sea' }));
  await settle();
  expect(pending).toHaveLength(3);
  await release(1); // the superseded Illustrated + Ridge image
  expect(screen.queryByRole('img', { name: /New York/ })).not.toBeInTheDocument();
  expect(created).toEqual(['blob:test-1']);
  await release(2);
  expect(screen.getByRole('img', { name: /New York/ })).toHaveAttribute('src', 'blob:test-2');
});

it('allocates nothing for an image that finishes after the dialog closed', async () => {
  const { unmount } = render(<MomentImage snapshot={snapshot} capture={capture} link="" />);
  await settle();
  unmount();
  await release(0);
  expect(created).toEqual([]);
});
