import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import App from '../src/App';
import { explorationUrl, loadPreferences, savePreferences } from '../src/lib/persistence';
import { PRESETS } from '../src/lib/locations';

it('saves two device positions independently and keeps their sharing disclosure', async () => {
  const positions = [
    { latitude: 40.7, longitude: -74 },
    { latitude: 35.71234, longitude: 139.71234 },
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
    expect(loadPreferences().value.recent).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Close locations' }));
  }
  fireEvent.click(screen.getByRole('button', { name: 'Share this sky' }));
  // Shared at city level by default (principle 4); exact only when the person chooses it.
  const link = () => (screen.getByRole('textbox', { name: 'Sky link' }) as HTMLInputElement).value;
  expect(screen.getByText(/rounded to about 10 km in this link \(35.7, 139.7\)/)).toBeVisible();
  expect(link()).toContain('%22latitude%22%3A35.7%2C%22longitude%22%3A139.7%2C');
  expect(link()).not.toContain('35.71234');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Share my exact location' }));
  expect(screen.getByText(/exact device coordinates: 35.71234, 139.71234/)).toBeVisible();
  expect(link()).toContain('35.71234');
  fireEvent.click(screen.getByRole('button', { name: 'Close sharing' }));
  fireEvent.click(screen.getByRole('button', { name: /Change location/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove saved place' }));
  expect(loadPreferences().value.saved.map((p) => p.latitude)).toEqual([40.7]);
});

vi.mock('../src/components/SkyScene', async () => ({
  default: (await import('react')).forwardRef(() => <div role="img" aria-label="Sky preview" />),
}));

it('restores the most recently selected city while starting at the current time', () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  const trigger = () => screen.getByRole('button', { name: /Change location/ });
  const visit = render(<App />);
  expect(trigger()).toHaveTextContent('New York');

  fireEvent.click(trigger());
  fireEvent.click(screen.getByRole('option', { name: /Tokyo/ }));
  fireEvent.click(trigger());
  fireEvent.click(screen.getByRole('option', { name: /Beijing/ }));
  expect(loadPreferences().value.recent.map((place) => place.id)).toEqual(['beijing', 'tokyo']);

  visit.unmount();
  render(<App />);
  expect(trigger()).toHaveTextContent('Beijing');
  expect(screen.getByText(/Following real time/)).toBeInTheDocument();
});

it('opens shared places without overwriting the remembered city', () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  expect(savePreferences({ ...loadPreferences().value, recent: [PRESETS[2]] })).toBe(true);
  const originalHash = window.location.hash;
  window.location.hash = new URL(
    explorationUrl({
      version: 1,
      location: PRESETS[3],
      instant: '2026-11-12T12:00:00.000Z',
      camera: { heading: 0, altitude: 18, fov: 66 },
      layers: loadPreferences().value.layers,
      custom: null,
    }),
  ).hash;
  try {
    const sharedVisit = render(<App />);
    expect(screen.getByRole('button', { name: /Change location/ })).toHaveTextContent('London');
    expect(loadPreferences().value.recent[0].id).toBe('tokyo');

    sharedVisit.unmount();
    window.location.hash = '';
    render(<App />);
    expect(screen.getByRole('button', { name: /Change location/ })).toHaveTextContent('Tokyo');
  } finally {
    window.location.hash = originalHash;
  }
});

it('prefers an explicitly provided initial location over recent places', () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  expect(savePreferences({ ...loadPreferences().value, recent: [PRESETS[2]] })).toBe(true);
  render(<App initialLocation={PRESETS[3]} />);
  expect(screen.getByRole('button', { name: /Change location/ })).toHaveTextContent('London');
});

it('does not turn device coordinates into an automatic startup location', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (success: PositionCallback) =>
        success({ coords: { latitude: 39.12345, longitude: -77.12345 } } as GeolocationPosition),
    },
  });
  expect(savePreferences({ ...loadPreferences().value, recent: [PRESETS[2]] })).toBe(true);
  const visit = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Change location/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Choose your place' })).not.toBeInTheDocument(),
  );
  expect(loadPreferences().value.recent.map((place) => place.id)).toEqual(['tokyo']);

  visit.unmount();
  render(<App />);
  expect(screen.getByRole('button', { name: /Change location/ })).toHaveTextContent('Tokyo');
});

it('uses the default city if preferences cannot be read', () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  localStorage.setItem('elsewhere.preferences.v1', '{broken');
  render(<App />);
  expect(screen.getByRole('button', { name: /Change location/ })).toHaveTextContent('New York');
  expect(localStorage.getItem('elsewhere.preferences.v1')).toBe('{broken');
});

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
