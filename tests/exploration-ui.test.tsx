import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import App from '../src/App';
import { scenarioProps } from '../src/dev/scenarios';
import { parseExploration } from '../src/lib/persistence';

vi.mock('../src/components/SkyScene', async () => ({
  default: (await import('react')).forwardRef(() => <div role="img" aria-label="Sky preview" />),
}));

it('starts with object discovery and keeps below-horizon objects searchable', async () => {
  render(<App {...scenarioProps('night')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Objects' }));
  expect(screen.getByRole('searchbox', { name: 'Find an object' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Moon' })).not.toBeInTheDocument();
  const search = screen.getByRole('searchbox', { name: 'Find an object' });
  fireEvent.change(search, { target: { value: 'Moon' } });
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Celestial objects' })).getByRole('button', { name: /Moon/ }),
  );
  expect(screen.getByText('Below the horizon')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Jump to next rise' }));
  expect(screen.getByRole('region', { name: 'Selected object' })).toHaveTextContent('Moon');
  expect(screen.getByRole('region', { name: 'Selected object' })).not.toHaveTextContent('Below the horizon');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Objects' })).toHaveFocus());
});
it('keeps selection feedback and restores weather after a clear-sky preview', async () => {
  render(<App {...scenarioProps('day')} weatherLoader={scenarioProps('overcast').weatherLoader} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Forecast' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Find the Moon' }));
  expect(screen.getByText('Heavy cloud cover')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Center in view' }));
  expect(screen.getByRole('button', { name: 'Objects' })).toHaveFocus();
  expect(screen.getByRole('region', { name: 'Selected object' })).toHaveTextContent('100% cloud cover');
  const preview = screen.getByRole('button', { name: 'Preview a clear sky' });
  preview.focus();
  fireEvent.click(preview);
  expect(screen.getByRole('button', { name: 'Restore atmosphere' })).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Clear-sky preview' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Selected object' })).toHaveTextContent('A pale daytime Moon');
  fireEvent.click(screen.getByRole('button', { name: 'Share this sky' }));
  const link = (screen.getByRole('textbox', { name: 'Sky link' }) as HTMLInputElement).value;
  const shared = parseExploration(new URL(link).hash).value!;
  expect(shared.clearSky).toBe(true);
  expect(shared.custom).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close sharing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore weather atmosphere' }));
  expect(screen.getByRole('region', { name: 'Selected object' })).toHaveTextContent('100% cloud cover');
});
