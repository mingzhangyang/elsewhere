import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { setLanguage } from '../src/i18n';
import { PRESETS } from '../src/lib/locations';
import type { MomentSnapshot } from '../src/lib/moment';
import type { SkyCaptureOptions } from '../src/renderer/createSkyRenderer';
import { defaultWeatherValues } from '../src/domain/weather';

// PNG encoding is held until each test releases it, to force slow and out-of-order results.
type PostcardInputRecord = {
  style: string;
  weather: { cloudCover: number; precipitation: number };
  provenance: string;
  view: MomentSnapshot['view'];
};
const postcardInputs = vi.hoisted(() => [] as PostcardInputRecord[]);
const pending: ((blob: Blob | null) => void)[] = [];
vi.mock('../src/moment/postcard', () => ({
  FONT: 'sans-serif',
  MOMENT_STYLES: ['realistic', 'illustrated'],
  drawPostcard: (options: { style: string; snapshot: MomentSnapshot }) => {
    postcardInputs.push({
      style: options.style,
      weather: {
        cloudCover: options.snapshot.weather.cloudCover,
        precipitation: options.snapshot.weather.precipitation,
      },
      provenance: options.snapshot.provenance.kind,
      view: options.snapshot.view,
    });
    return { toBlob: (done: (blob: Blob | null) => void) => pending.push(done) };
  },
}));
vi.mock('../src/moment/landscapeArt', () => ({
  loadLandscapeArt: vi.fn(async () => new Image()),
}));
const { default: MomentImage } = await import('../src/components/MomentImage');

let created: string[] = [];
let revoked: string[] = [];
beforeAll(() => setLanguage('en'));
beforeEach(() => {
  pending.length = 0;
  postcardInputs.length = 0;
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  created = [];
  revoked = [];
  let n = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => {
      const url = `blob:test-${++n}`;
      created.push(url);
      return url;
    },
    revokeObjectURL: (url: string) => revoked.push(url),
  });
});

// 00:30 UTC on January 10 is the evening of January 9 in New York.
const snapshot = {
  location: PRESETS[0],
  instant: new Date('2026-01-10T00:30:00Z'),
  sky: {
    sunAltitude: -18,
    sun: { altitude: -18, azimuth: 270, visible: false },
    moon: { phase: 'full', altitude: 40, azimuth: 140, visible: true, illumination: 1 },
    planets: [],
    stars: [],
  },
  view: { heading: 0, altitude: 18, fov: 66 },
  aspect: 1.6,
  layers: { stars: true, lines: true, labels: true },
  skyBrightness: 'dark',
  weather: { ...defaultWeatherValues(), cloudCover: 95, precipitation: 3, weatherCode: 63 },
  provenance: { kind: 'source', source: 'forecast' },
} as unknown as MomentSnapshot;
const capture = () => ({ image: document.createElement('canvas'), target: null });
const settle = () => act(async () => {});
const release = async (index: number) => {
  await act(async () => pending[index](new Blob(['png'], { type: 'image/png' })));
  const staged = document.querySelector<HTMLImageElement>('.moment-preview-staged');
  if (staged) await act(async () => fireEvent.load(staged));
};

it('places image controls in the supplied sidebar without moving the preview', async () => {
  const sidebar = document.createElement('div');
  document.body.appendChild(sidebar);
  const { container, unmount } = render(
    <MomentImage snapshot={snapshot} capture={capture} link="" controlsTarget={sidebar} />,
  );
  await settle();
  expect(sidebar).toContainElement(screen.getByRole('checkbox', { name: /Clear Sky for image/ }));
  expect(sidebar).toContainElement(screen.getByRole('button', { name: 'Illustrated' }));
  expect(container.querySelector('.moment-options')).not.toBeInTheDocument();
  expect(container.querySelector('.moment-preview-slot')).toHaveAttribute('aria-busy', 'true');
  unmount();
  sidebar.remove();
});

it('keeps a stable preview slot, hides stale exports, and ignores an out-of-order result', async () => {
  render(<MomentImage snapshot={snapshot} capture={capture} link="https://example.test/#sky" />);
  await settle();
  await release(0);
  expect(screen.getByRole('img', { name: /New York/ })).toHaveAttribute('src', 'blob:test-1');
  // Named by the moment's own date, as printed, not the UTC one.
  expect(screen.getByRole('link', { name: 'Save image' })).toHaveAttribute(
    'download',
    'elsewhere-sky-2026-01-09.png',
  );

  const slot = document.querySelector('.moment-preview-slot');
  expect(slot).toHaveAttribute('aria-busy', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Illustrated' }));
  expect(slot).toHaveAttribute('aria-busy', 'true');
  expect(document.querySelector('.moment-preview')).toHaveAttribute('src', 'blob:test-1');
  expect(document.querySelector('.moment-preview')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Drawing');
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
  expect(slot).toHaveAttribute('aria-busy', 'false');
  expect(revoked).toContain('blob:test-1');
});

it('keeps the previous preview and loading animation until the replacement decodes', async () => {
  let finishDecode = () => {};
  const decodePending = new Promise<void>((resolve) => {
    finishDecode = resolve;
  });
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn().mockResolvedValueOnce(undefined).mockReturnValueOnce(decodePending),
  });
  render(<MomentImage snapshot={snapshot} capture={capture} link="" />);
  await settle();
  await release(0);
  fireEvent.click(screen.getByRole('button', { name: 'Illustrated' }));
  await settle();
  await release(1);
  const slot = document.querySelector('.moment-preview-slot');
  expect(slot).toHaveAttribute('aria-busy', 'true');
  expect(document.querySelector('.moment-preview')).toHaveAttribute('src', 'blob:test-1');
  expect(document.querySelector('.moment-preview-staged')).toHaveAttribute('src', 'blob:test-2');
  expect(screen.getByRole('status')).toHaveTextContent('Drawing');
  expect(screen.queryByRole('link', { name: 'Save image' })).not.toBeInTheDocument();
  expect(revoked).not.toContain('blob:test-1');
  await act(async () => finishDecode());
  expect(slot).toHaveAttribute('aria-busy', 'false');
  expect(screen.getByRole('img', { name: /New York/ })).toHaveAttribute('src', 'blob:test-2');
  expect(screen.getByRole('link', { name: 'Save image' })).toBeVisible();
  expect(revoked).toContain('blob:test-1');
});

it('keeps the old image on decode failure and recovers on a later redraw', async () => {
  const decode = vi.fn().mockResolvedValue(undefined);
  decode.mockResolvedValueOnce(undefined);
  decode.mockRejectedValueOnce(new Error('corrupt PNG'));
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: decode,
  });
  render(<MomentImage snapshot={snapshot} capture={capture} link="" />);
  await settle();
  await release(0);
  fireEvent.click(screen.getByRole('button', { name: 'Illustrated' }));
  await settle();
  await release(1);
  expect(document.querySelector('.moment-preview')).toHaveAttribute('src', 'blob:test-1');
  expect(document.querySelector('.moment-preview-slot')).toHaveAttribute('aria-busy', 'false');
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Save image' })).not.toBeInTheDocument();
  expect(revoked).toContain('blob:test-2');
  expect(revoked).not.toContain('blob:test-1');
  fireEvent.click(screen.getByRole('button', { name: 'Realistic' }));
  await settle();
  await release(2);
  expect(screen.getByRole('img', { name: /New York/ })).toHaveAttribute('src', 'blob:test-3');
  expect(revoked).toContain('blob:test-1');
});

it('revokes a staged image if its load fails or the dialog unmounts', async () => {
  const { unmount } = render(<MomentImage snapshot={snapshot} capture={capture} link="" />);
  await settle();
  await act(async () => pending[0](new Blob(['png'], { type: 'image/png' })));
  const staged = document.querySelector<HTMLImageElement>('.moment-preview-staged');
  expect(staged).toHaveAttribute('src', 'blob:test-1');
  if (staged) fireEvent.error(staged);
  expect(revoked).toEqual(['blob:test-1']);
  expect(document.querySelector('.moment-preview-slot')).toHaveAttribute('aria-busy', 'false');
  unmount();
  expect(revoked).toEqual(['blob:test-1']);
});

it('invalidates a candidate whose decode resolves after a newer redraw', async () => {
  let finishDecode = () => {};
  const decodePending = new Promise<void>((resolve) => {
    finishDecode = resolve;
  });
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn().mockReturnValueOnce(decodePending),
  });
  const { unmount } = render(<MomentImage snapshot={snapshot} capture={capture} link="" />);
  await settle();
  await act(async () => pending[0](new Blob(['png'], { type: 'image/png' })));
  const staged = document.querySelector<HTMLImageElement>('.moment-preview-staged');
  if (staged) await act(async () => fireEvent.load(staged));
  fireEvent.click(screen.getByRole('button', { name: 'Illustrated' }));
  await settle();
  expect(revoked).toEqual(['blob:test-1']);
  await act(async () => finishDecode());
  expect(document.querySelector('.moment-preview')).not.toBeInTheDocument();
  unmount();
  expect(revoked).toEqual(['blob:test-1']);
});

it('allocates nothing for an image that finishes after the dialog closed', async () => {
  const { unmount } = render(<MomentImage snapshot={snapshot} capture={capture} link="" />);
  await settle();
  unmount();
  await release(0);
  expect(created).toEqual([]);
});

it('uses Clear Sky in both styles without modifying source weather', async () => {
  const captured: SkyCaptureOptions[] = [];
  const captureWeather = (options: SkyCaptureOptions) => {
    captured.push(options);
    return capture();
  };
  render(<MomentImage snapshot={snapshot} capture={captureWeather} link="https://example.test/#sky" />);
  const clear = screen.getByRole('checkbox', { name: /Clear Sky for image/ });
  expect(clear).toBeChecked();
  await settle();
  expect(postcardInputs[0]).toMatchObject({
    style: 'realistic',
    weather: { cloudCover: 0, precipitation: 0 },
    provenance: 'clear',
  });
  expect(captured[0].weather).toMatchObject({ cloudCover: 0, precipitation: 0, weatherCode: 0 });
  // Source data is untouched even though the preview and the renderer capture use clear conditions.
  expect(snapshot.weather.cloudCover).toBe(95);
  expect(snapshot.weather.precipitation).toBe(3);
  expect(snapshot.provenance.kind).toBe('source');

  fireEvent.click(screen.getByRole('button', { name: 'Illustrated' }));
  await settle();
  expect(postcardInputs[1]).toMatchObject({
    style: 'illustrated',
    weather: { cloudCover: 0 },
    provenance: 'clear',
  });

  fireEvent.click(clear);
  await settle();
  expect(clear).not.toBeChecked();
  expect(postcardInputs[2]).toMatchObject({
    style: 'illustrated',
    weather: { cloudCover: 95, precipitation: 3 },
    provenance: 'source',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Realistic' }));
  await settle();
  expect(captured.at(-1)?.weather).toBeUndefined();
  expect(postcardInputs.at(-1)?.weather.cloudCover).toBe(95);
});

it('invalidates the previous download while changing the Clear Sky image option', async () => {
  render(<MomentImage snapshot={snapshot} capture={capture} link="" />);
  await settle();
  await release(0);
  expect(screen.getByRole('link', { name: 'Save image' })).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', { name: /Clear Sky for image/ }));
  expect(screen.queryByRole('link', { name: 'Save image' })).not.toBeInTheDocument();
  await settle();
  await release(1);
  expect(screen.getByRole('link', { name: 'Save image' })).toBeVisible();
});

it('defaults to smart framing, uses the same view in both styles, and preserves the original view', async () => {
  const captured: SkyCaptureOptions[] = [];
  render(
    <MomentImage
      snapshot={snapshot}
      capture={(options) => {
        captured.push(options);
        return capture();
      }}
      link="https://example.test/#sky"
    />,
  );
  const smart = screen.getByRole('button', { name: 'Smart framing' });
  const current = screen.getByRole('button', { name: 'Current view' });
  expect(smart).toHaveAttribute('aria-pressed', 'true');
  await settle();
  const auto = postcardInputs[0].view;
  expect(auto.heading).not.toBe(snapshot.view.heading);
  expect(captured[0].snapshot?.view).toEqual(auto);
  await release(0);
  fireEvent.click(screen.getByRole('button', { name: 'Illustrated' }));
  await settle();
  expect(postcardInputs[1].view).toEqual(auto);
  await release(1);
  fireEvent.click(current);
  expect(screen.queryByRole('link', { name: 'Save image' })).not.toBeInTheDocument();
  await settle();
  expect(postcardInputs[2].view).toEqual(snapshot.view);
  expect(snapshot.view.heading).toBe(0);
});

it('finishes both no-op framing toggles with Clear Sky off', async () => {
  render(<MomentImage snapshot={snapshot} capture={capture} link="" />);
  await settle();
  await release(0);
  fireEvent.click(screen.getByRole('checkbox', { name: /Clear Sky for image/ }));
  await settle();
  await release(1);
  const slot = document.querySelector('.moment-preview-slot');
  expect(slot).toHaveAttribute('aria-busy', 'false');
  expect(postcardInputs[1].view).toBe(snapshot.view);

  // At night with 95% cloud cover neither mode changes the original snapshot.
  for (const [index, name] of ['Current view', 'Smart framing'].entries()) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.queryByRole('link', { name: 'Save image' })).not.toBeInTheDocument();
    await settle();
    expect(pending).toHaveLength(index + 3);
    expect(postcardInputs[index + 2].view).toBe(snapshot.view);
    await release(index + 2);
    expect(slot).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('img', { name: /New York/ })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Save image' })).toBeVisible();
  }
});
