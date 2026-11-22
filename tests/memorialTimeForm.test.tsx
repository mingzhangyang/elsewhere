import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MemorialTimeForm from '../src/components/MemorialTimeForm';
import { setLanguage } from '../src/i18n';
import { createReferenceDraft, setReferenceTime, type MemorialTime } from '../src/lib/memorialTime';
import { PRESETS } from '../src/lib/locations';
import { searchLocations } from '../src/services/placeSearch';

vi.mock('../src/services/placeSearch', () => ({ searchLocations: vi.fn() }));

const lookup = vi.mocked(searchLocations);
const city = (id: string) => PRESETS.find((place) => place.id === id)!;

beforeEach(async () => {
  lookup.mockReset();
  await act(() => setLanguage('en'));
});

afterEach(async () => {
  await act(() => setLanguage('en'));
});

function start(initialDraft?: Parameters<typeof MemorialTimeForm>[0]['initialDraft']) {
  const onResolved = vi.fn<(value: MemorialTime) => void>();
  render(<MemorialTimeForm initialDraft={initialDraft} onResolved={onResolved} />);
  return onResolved;
}

function chooseCity(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /Choose a city|Change location/ }));
  const list = screen.getByRole('listbox', { name: 'Locations' });
  fireEvent.click(within(list).getByRole('option', { name: new RegExp(name) }));
}

function fill(localDate: string, localTime: string) {
  fireEvent.change(screen.getByLabelText('Gregorian date'), { target: { value: localDate } });
  fireEvent.change(screen.getByLabelText(/^Local time at the event/), { target: { value: localTime } });
}

function checkTime() {
  fireEvent.click(screen.getByRole('button', { name: 'Check time' }));
}

describe('memorial event creator input (SM1-B)', () => {
  it('requires an explicitly selected city and does not submit when a city option is clicked', async () => {
    const onResolved = start();
    fill('2026-02-15', '08:30');
    checkTime();
    expect(screen.getByRole('alert')).toHaveTextContent('Select an event city');
    expect(onResolved).not.toHaveBeenCalled();

    const emptyCityTrigger = screen.getByRole('button', { name: 'Choose a city' });
    expect(emptyCityTrigger).toHaveAttribute('data-location-empty', 'true');
    fireEvent.click(emptyCityTrigger);
    expect(screen.queryByRole('button', { name: 'Use my location' })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /New York/ }));
    expect(screen.getByRole('button', { name: 'Change location, New York' })).not.toHaveAttribute(
      'data-location-empty',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
    checkTime();
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
  });

  it('keeps the original civil date and clock when the city changes, and recalculates UTC', async () => {
    const onResolved = start();
    chooseCity('New York');
    fill('2026-02-15', '08:30');
    checkTime();
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(onResolved.mock.lastCall?.[0]).toMatchObject({
      kind: 'exact',
      localDate: '2026-02-15',
      localTime: '08:30',
      utc: '2026-02-15T13:30:00.000Z',
    });

    chooseCity('Beijing');
    expect(screen.getByLabelText('Gregorian date')).toHaveValue('2026-02-15');
    expect(screen.getByLabelText(/^Local time at the event/)).toHaveValue('08:30');
    expect(screen.queryByText(/Resolved:/)).not.toBeInTheDocument();
    checkTime();
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(2));
    expect(onResolved.mock.lastCall?.[0]).toMatchObject({
      kind: 'exact',
      location: { id: 'beijing', timezone: 'Asia/Shanghai' },
      localDate: '2026-02-15',
      localTime: '08:30',
      utc: '2026-02-15T00:30:00.000Z',
    });
  });

  it('keeps unknown birth time labelled as a reference, even when edited or moved', async () => {
    const onResolved = start();
    chooseCity('New York');
    fireEvent.change(screen.getByLabelText('Gregorian date'), { target: { value: '2026-07-16' } });
    fireEvent.click(screen.getByRole('radio', { name: 'I don’t know the time' }));
    expect(screen.getByLabelText(/^Reference local time/)).toHaveValue('22:00');
    checkTime();
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(onResolved.mock.lastCall?.[0]).toMatchObject({
      kind: 'reference',
      reference: { localTime: '22:00', source: 'default' },
      utc: '2026-07-17T02:00:00.000Z',
    });

    fireEvent.change(screen.getByLabelText(/^Reference local time/), { target: { value: '06:15' } });
    checkTime();
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(2));
    expect(onResolved.mock.lastCall?.[0]).toMatchObject({
      kind: 'reference',
      reference: { localTime: '06:15', source: 'user' },
      utc: '2026-07-16T10:15:00.000Z',
    });

    chooseCity('Beijing');
    expect(screen.getByLabelText(/^Reference local time/)).toHaveValue('06:15');
    checkTime();
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(3));
    expect(onResolved.mock.lastCall?.[0]).toMatchObject({
      kind: 'reference',
      reference: { localTime: '06:15', source: 'user' },
      utc: '2026-07-15T22:15:00.000Z',
    });
  });

  it('rejects the spring gap and requires an explicit autumn DST candidate', async () => {
    const onResolved = start();
    chooseCity('New York');
    fill('2026-03-08', '02:30');
    checkTime();
    expect(await screen.findByRole('alert')).toHaveTextContent('never occurred');
    expect(onResolved).not.toHaveBeenCalled();

    fill('2026-11-01', '01:30');
    checkTime();
    const ambiguous = await screen.findByRole('group', { name: /occurred twice/ });
    const candidates = within(ambiguous).getAllByRole('button');
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toHaveTextContent('-04:00');
    expect(candidates[1]).toHaveTextContent('-05:00');
    expect(onResolved).not.toHaveBeenCalled();
    fireEvent.click(candidates[0]);
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(onResolved.mock.lastCall?.[0]).toMatchObject({
      utc: '2026-11-01T05:30:00.000Z',
      offset: '-04:00',
      disambiguation: 'earlier',
    });

    fireEvent.change(screen.getByLabelText(/^Local time at the event/), { target: { value: '01:31' } });
    checkTime();
    expect(await screen.findByRole('group', { name: /occurred twice/ })).toBeInTheDocument();
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a previous city’s DST choice when returning to the fold', async () => {
    const onResolved = start();
    chooseCity('New York');
    fill('2026-11-01', '01:30');
    checkTime();
    fireEvent.click(
      within(await screen.findByRole('group', { name: /occurred twice/ })).getAllByRole('button')[1],
    );
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(onResolved.mock.lastCall?.[0].disambiguation).toBe('later');

    chooseCity('Beijing');
    chooseCity('New York');
    checkTime();
    expect(await screen.findByRole('group', { name: /occurred twice/ })).toBeInTheDocument();
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('uses the existing debounced city search with accessible keyboard selection', async () => {
    lookup.mockResolvedValue([city('sydney')]);
    const onResolved = start();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a city' }));
    const input = screen.getByRole('combobox', { name: 'Search for a location' });
    fireEvent.change(input, { target: { value: 'Syd' } });
    await waitFor(() => expect(lookup).toHaveBeenCalledWith('Syd', 'en', expect.anything()));
    expect(await screen.findByRole('option', { name: /Sydney/ })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Change location, Sydney' })).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
    expect(screen.getByText(/^Time zone: Australia\/Sydney$/)).toBeInTheDocument();
  });

  it('rewords an error after switching the interface language', async () => {
    const onResolved = start();
    chooseCity('New York');
    fill('2026-03-08', '02:30');
    checkTime();
    expect(await screen.findByRole('alert')).toHaveTextContent('never occurred');
    await act(() => setLanguage('zh-Hans'));
    expect(screen.getByRole('heading', { name: '选择纪念时刻' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('这个时间不存在');
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('rejects malformed civil input without Date overflow correction', async () => {
    const onResolved = start();
    chooseCity('New York');
    fill('1900-02-29', '08:30');
    checkTime();
    expect(await screen.findByRole('alert')).toHaveTextContent('valid Gregorian date');
    expect(onResolved).not.toHaveBeenCalled();
    fill('2026-10-05', '24:50');
    checkTime();
    expect(await screen.findByRole('alert')).toHaveTextContent('valid local time');
  });

  it('ignores an asynchronous resolution that completes after the user edits the form', async () => {
    const onResolved = start();
    chooseCity('New York');
    fill('2026-02-15', '08:30');
    checkTime();
    fireEvent.change(screen.getByLabelText('Gregorian date'), { target: { value: '2026-02-16' } });
    await act(async () => {});
    expect(onResolved).not.toHaveBeenCalled();
    expect(screen.queryByText(/Resolved:/)).not.toBeInTheDocument();
    checkTime();
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(onResolved.mock.lastCall?.[0].localDate).toBe('2026-02-16');
  });

  it('accepts a pre-existing reference draft without silently upgrading its precision', async () => {
    const onResolved = start(setReferenceTime(createReferenceDraft(city('beijing'), '2026-07-16'), '07:45'));
    expect(screen.getByRole('radio', { name: 'I don’t know the time' })).toBeChecked();
    expect(screen.getByLabelText(/^Reference local time/)).toHaveValue('07:45');
    checkTime();
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(onResolved.mock.lastCall?.[0]).toMatchObject({
      kind: 'reference',
      reference: { localTime: '07:45', source: 'user' },
    });
  });

  it('uses labelled controls and has no detectable structural accessibility issues', async () => {
    start();
    chooseCity('New York');
    expect(screen.getByRole('radio', { name: 'I know the time' })).toBeChecked();
    expect(screen.getByLabelText('Gregorian date')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText(/^Local time at the event/)).toHaveAttribute('type', 'time');
    const report = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(report.violations.map((issue) => issue.id)).toEqual([]);
  });
});
