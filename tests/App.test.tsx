import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import App from '../src/App';
import { loadPreferences } from '../src/lib/persistence';

it('saves two device positions independently and keeps their sharing disclosure', async () => {
  const positions = [
    { latitude: 40.7, longitude: -74 },
    { latitude: 35.7, longitude: 139.7 },
  ];
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (success: PositionCallback) =>
        success({ coords: positions.shift() } as GeolocationPosition),
    },
  });
  const { scenarioProps } = await import('../src/dev/scenarios');
  render(<App {...scenarioProps('unavailable')} />);
  for (let i = 0; i < 2; i++) {
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Choose your place' })).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save current place' }));
    expect(loadPreferences().value.saved).toHaveLength(i + 1);
    fireEvent.click(screen.getByRole('button', { name: 'Close locations' }));
  }
  fireEvent.click(screen.getByRole('button', { name: 'Share this sky' }));
  expect(screen.getByText(/exact device coordinates: 35.70000, 139.70000/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Close sharing' }));
  fireEvent.click(screen.getByRole('button', { name: /Change location/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove saved place' }));
  expect(loadPreferences().value.saved.map((p) => p.latitude)).toEqual([40.7]);
});

vi.mock('../src/components/SkyScene', async () => ({
  default: (await import('react')).forwardRef(() => <div role="img" aria-label="Sky preview" />),
}));

it('changes place without changing the selected instant and controls playback', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  render(<App initialTime={new Date('2026-11-12T12:00Z')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Change date and time' }));
  expect(screen.getByLabelText('Local time')).toHaveValue('07:00');
  fireEvent.click(screen.getByRole('button', { name: 'Close time editor' }));
  fireEvent.click(screen.getByRole('button', { name: /Change location/ }));
  fireEvent.click(screen.getByRole('option', { name: /Tokyo/ }));
  await waitFor(() => expect(screen.getByText('Japan')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Change date and time' }));
  expect(screen.getByLabelText('Local time')).toHaveValue('21:00');
  fireEvent.click(screen.getByRole('button', { name: 'Close time editor' }));
  fireEvent.click(screen.getByRole('button', { name: 'Play time' }));
  expect(screen.getByRole('button', { name: 'Pause time' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Now' }));
  expect(screen.getByRole('button', { name: 'Pause time' })).toBeInTheDocument();
  expect(screen.getByText(/Following real time/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pause time' }));
  expect(screen.getByText(/Paused ·/)).toBeInTheDocument();
});

it('requires a choice between repeated-hour offsets', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(new Response('{}'))),
  );
  render(<App initialTime={new Date('2026-11-01T17:00Z')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Change date and time' }));
  fireEvent.change(screen.getByLabelText('Local time'), { target: { value: '01:30' } });
  expect(screen.getByRole('alert')).toHaveTextContent('occurs twice');
  fireEvent.click(screen.getByRole('button', { name: /UTC-05:00/ }));
  expect(screen.getByLabelText('Local time')).toHaveValue('01:30');
  expect(screen.getByRole('slider', { name: 'Time of day' })).toHaveAttribute(
    'aria-valuetext',
    '01:30 UTC-05:00',
  );
});

it('does not display source weather defaults when weather is unavailable', async () => {
  const { scenarioProps } = await import('../src/dev/scenarios');
  render(<App {...scenarioProps('unavailable')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Weather' }));
  await waitFor(() => expect(screen.getByText(/unavailable-weather/)).toBeInTheDocument());
  expect(screen.queryByText('1013')).not.toBeInTheDocument();
  expect(screen.queryByRole('slider', { name: /Cloud cover/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Custom simulation' }));
  expect(screen.getByRole('slider', { name: /Cloud cover/ })).toBeInTheDocument();
});

it('applies shared-link layers to the visit without saving them as the recipient defaults', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  const { explorationUrl } = await import('../src/lib/persistence');
  const { PRESETS } = await import('../src/lib/locations');
  const saved = loadPreferences().value.layers;
  window.location.hash = new URL(
    explorationUrl({
      version: 1,
      location: PRESETS[0],
      instant: '2026-11-12T12:00:00.000Z',
      camera: { heading: 0, altitude: 30, fov: 60 },
      layers: { stars: false, lines: true, labels: false },
      custom: null,
    }),
  ).hash;
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }));
    fireEvent.click(screen.getByRole('option', { name: /Tokyo/ }));
    await waitFor(() => expect(screen.getByText('Japan')).toBeInTheDocument());
    expect(loadPreferences().value.recent).toHaveLength(1);
    expect(loadPreferences().value.layers).toEqual(saved);
  } finally {
    window.location.hash = '';
  }
});
