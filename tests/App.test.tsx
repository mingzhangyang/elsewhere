import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import App from '../src/App';

vi.mock('../src/components/SkyScene', () => ({ default: () => <div aria-label="Sky preview" /> }));

it('changes place without changing the selected instant and controls playback', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Tokyo', exact: true }));
  await waitFor(() => expect(screen.getByText('Japan')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Play time' }));
  expect(screen.getByRole('button', { name: 'Pause time' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'NOW', exact: true }));
  expect(screen.getByRole('button', { name: 'Play time' })).toBeInTheDocument();
});
