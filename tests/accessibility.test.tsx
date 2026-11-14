import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { expect, it, vi } from 'vitest';
import App from '../src/App';
import { scenarioProps } from '../src/dev/scenarios';

vi.mock('../src/components/SkyScene', async () => ({
  default: (await import('react')).forwardRef(() => <div role="img" aria-label="Sky preview" />),
}));
async function audit() {
  const report = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
  expect(report.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }))).toEqual([]);
}
it('has no detected structural accessibility violations in the primary flows', async () => {
  render(<App {...scenarioProps('night')} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Forecast' })).toBeInTheDocument());
  await audit();
  fireEvent.click(screen.getByRole('button', { name: 'Change date and time' }));
  await audit();
  fireEvent.click(screen.getByRole('button', { name: 'Close time editor' }));
  fireEvent.click(screen.getByRole('button', { name: /Change location/ }));
  await audit();
  fireEvent.click(screen.getByRole('button', { name: 'Close locations' }));
  fireEvent.click(screen.getByRole('button', { name: 'Weather' }));
  await audit();
  fireEvent.click(screen.getByRole('button', { name: 'Custom simulation' }));
  await audit();
  fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
  await audit();
  fireEvent.click(screen.getByRole('button', { name: 'Objects' }));
  await audit();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find an object' }), { target: { value: 'Moon' } });
  fireEvent.click(screen.getByRole('button', { name: /Moon.*Below/ }));
  await audit();
  fireEvent.click(screen.getByRole('button', { name: 'Jump to next rise' }));
  await audit();
  fireEvent.click(screen.getByRole('button', { name: 'Share this sky' }));
  await audit();
}, 20000);
it('exposes the header and footer as page landmarks beside the main sky', () => {
  render(<App {...scenarioProps('night')} />);
  const main = screen.getByRole('main', { name: 'Sky exploration' });
  expect(main).not.toContainElement(screen.getByRole('banner'));
  expect(main).not.toContainElement(screen.getByRole('contentinfo'));
  expect(screen.getByRole('region', { name: 'Time controls' })).toBeInTheDocument();
});
it('names the time inputs by their visible labels', () => {
  render(<App {...scenarioProps('night')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Change date and time' }));
  expect(screen.getByLabelText('Date')).toHaveAttribute('type', 'date');
  expect(screen.getByLabelText('Local time')).toHaveAttribute('type', 'time');
  expect(screen.queryByLabelText('DATE')).toBeNull();
});
