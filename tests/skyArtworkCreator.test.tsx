import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SkyArtworkCreator from '../src/components/SkyArtworkCreator';
import { setLanguage } from '../src/i18n';
import type { MemorialTime } from '../src/lib/memorialTime';

const testEvent: MemorialTime = {
  state: 'resolved',
  kind: 'exact',
  location: {
    id: 'fictional-test',
    name: 'Fictional City',
    country: 'United States',
    latitude: 40.71,
    longitude: -74.01,
    elevation: 0,
    timezone: 'America/New_York',
  },
  localDate: '2026-06-21',
  localTime: '21:15',
  utc: '2026-06-22T01:15:00.000Z',
  offset: '-04:00',
  disambiguation: null,
};

const probes = vi.hoisted(() => ({
  generate: vi.fn(),
  invalidate: vi.fn(),
  export: vi.fn(),
  cancel: vi.fn(),
  dispose: vi.fn(),
  draw: vi.fn(),
  download: vi.fn(),
  share: vi.fn(),
  model: vi.fn(),
}));

vi.mock('../src/components/MemorialTimeForm', () => ({
  default: ({
    onResolved,
    onInvalidated,
  }: {
    onResolved: (time: MemorialTime) => void;
    onInvalidated: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onResolved(testEvent)}>
        Generate imaginary sky
      </button>
      <button type="button" onClick={onInvalidated}>
        Change moment
      </button>
    </div>
  ),
}));
vi.mock('../src/services/skyChartSnapshot', () => ({
  createSkyChartSnapshotCoordinator: () => ({
    generate: probes.generate,
    invalidate: probes.invalidate,
  }),
}));
vi.mock('../src/lib/skyArtwork', () => ({
  createSkyArtwork: (input: unknown) => probes.model(input),
}));
vi.mock('../src/moment/skyChart', () => ({
  prepareSkyChartFonts: async () => ({ status: 'ready', family: 'system-ui' }),
  canvasSkyChartTextMetrics: () => ({ measure: () => 10 }),
  layoutSkyChartArtwork: (artwork: unknown) => ({ artwork }),
  drawSkyChartArtwork: (...args: unknown[]) => probes.draw(...args),
}));
vi.mock('../src/lib/skyArtworkExport', () => ({
  createSkyArtworkExportCoordinator: () => ({
    export: probes.export,
    cancel: probes.cancel,
    dispose: probes.dispose,
  }),
  createSkyArtworkFile: () => new File(['demo'], 'elsewhere-sky-2026-06-21.png', { type: 'image/png' }),
  releaseSkyArtworkExport: vi.fn(),
}));
vi.mock('../src/lib/skyArtworkDelivery', () => ({
  skyArtworkShareCapability: () => 'unavailable',
  downloadSkyArtwork: (...args: unknown[]) => probes.download(...args),
  shareSkyArtwork: (...args: unknown[]) => probes.share(...args),
}));

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
const png = { released: false, release: vi.fn(), filename: 'elsewhere-sky-2026-06-21.png' };
const readyStatus = { status: 'ready', snapshot: { utc: testEvent.utc } };

beforeEach(async () => {
  probes.generate.mockReset().mockResolvedValue(readyStatus);
  probes.invalidate.mockReset();
  probes.export.mockReset().mockResolvedValue(png);
  probes.cancel.mockReset();
  probes.dispose.mockReset();
  probes.draw.mockReset();
  probes.download.mockReset().mockReturnValue({ status: 'download-requested' });
  probes.share.mockReset();
  probes.model.mockReset().mockImplementation((input) => ({
    formatVersion: 1,
    ...input,
    title: input.title || 'The sky remembers',
    phrase: input.phrase,
  }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    canvas: {},
  } as CanvasRenderingContext2D);
  await act(() => setLanguage('en'));
});

describe('SM3-C creator state and resource ownership', () => {
  it('does not generate until a resolved civil time was supplied', () => {
    render(<SkyArtworkCreator initialDraft={null} onDraftChange={vi.fn()} onExplore={vi.fn()} />);
    expect(probes.generate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save PNG' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Explore this sky' })).toBeDisabled();
  });

  it('binds preview, save and explorer to a completed matching revision', async () => {
    const explore = vi.fn();
    render(<SkyArtworkCreator initialDraft={null} onDraftChange={vi.fn()} onExplore={explore} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate imaginary sky' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save PNG' })).toBeEnabled());
    expect(probes.generate).toHaveBeenCalledWith({ time: testEvent }, expect.any(Function));
    expect(probes.draw).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save PNG' }));
    expect(probes.download).toHaveBeenCalledWith(png);
    fireEvent.click(screen.getByRole('button', { name: 'Explore this sky' }));
    expect(explore).toHaveBeenCalledWith(testEvent);
  });

  it('retires the ready PNG immediately on a time edit, not after recomputing', async () => {
    render(<SkyArtworkCreator initialDraft={null} onDraftChange={vi.fn()} onExplore={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate imaginary sky' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save PNG' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Change moment' }));
    expect(screen.getByRole('button', { name: 'Save PNG' })).toBeDisabled();
    expect(probes.invalidate).toHaveBeenCalled();
    expect(probes.cancel).toHaveBeenCalled();
  });

  it('retains one science snapshot when editing the handwritten phrase or palette', async () => {
    render(<SkyArtworkCreator initialDraft={null} onDraftChange={vi.fn()} onExplore={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate imaginary sky' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save PNG' })).toBeEnabled());
    const first = probes.generate.mock.calls.length;
    fireEvent.change(screen.getByRole('textbox', { name: /^A note to remember/ }), {
      target: { value: 'A fictional galaxy 🌙' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save PNG' })).toBeEnabled());
    fireEvent.click(screen.getByRole('radio', { name: /Rose paper/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save PNG' })).toBeEnabled());
    expect(probes.generate).toHaveBeenCalledTimes(first);
    expect(probes.model.mock.lastCall?.[0]).toMatchObject({
      phrase: 'A fictional galaxy 🌙',
      theme: 'paper',
    });
  });

  it('ignores an old snapshot that resolves after the user edits the time', async () => {
    const slow = pending<typeof readyStatus>();
    probes.generate.mockReturnValueOnce(slow.promise);
    render(<SkyArtworkCreator initialDraft={null} onDraftChange={vi.fn()} onExplore={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate imaginary sky' }));
    await waitFor(() => expect(probes.generate).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Change moment' }));
    await act(async () => {
      slow.resolve(readyStatus);
      await slow.promise;
    });
    expect(probes.export).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save PNG' })).toBeDisabled();
  });

  it('preserves inputs for a retry and cancels resources when unmounted', async () => {
    probes.generate.mockRejectedValueOnce(new Error('Network unavailable'));
    const view = render(
      <SkyArtworkCreator initialDraft={null} onDraftChange={vi.fn()} onExplore={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate imaginary sky' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save PNG' })).toBeEnabled());
    view.unmount();
    expect(probes.dispose).toHaveBeenCalled();
    expect(probes.invalidate).toHaveBeenCalled();
  });
});
