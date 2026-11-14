import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import ObjectPanel from '../src/components/ObjectPanel';
import { calculateSky } from '../src/domain/astronomy';
import { aboveHorizon, skyObjects } from '../src/lib/exploration';
import type { Preferences } from '../src/lib/persistence';
import { defaultWeatherValues } from '../src/domain/weather';
import { NEW_YORK } from './fixtures/locations';

const preferences: Preferences = {
  version: 1,
  layers: { stars: true, lines: false, labels: true },
  saved: [],
  recent: [],
  hintDismissed: false,
  reducedMotion: false,
  quality: 'auto',
  horizon: 'flat',
  skyBrightness: 'dark',
};
const panel = (sky: ReturnType<typeof calculateSky>) => (
  <ObjectPanel
    sky={sky}
    timeZone={NEW_YORK.timezone}
    selectedId={null}
    preferences={preferences}
    weather={defaultWeatherValues()}
    clearSky={false}
    onSelect={() => {}}
    onFocus={() => {}}
    onRise={() => {}}
    onClearSky={() => {}}
  />
);
const upCount = (sky: ReturnType<typeof calculateSky>) => skyObjects(sky).filter(aboveHorizon).length;

it('announces the object count when the reader filters, not when playback moves the sky', () => {
  const dusk = calculateSky(NEW_YORK, new Date('2026-11-13T00:00Z'));
  const later = calculateSky(NEW_YORK, new Date('2026-11-13T03:00Z'));
  expect(upCount(dusk)).not.toBe(upCount(later));

  const { rerender } = render(panel(dusk));
  const status = screen.getByRole('status');
  expect(status).toBeEmptyDOMElement();
  rerender(panel(later));
  expect(status).toBeEmptyDOMElement();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Find an object' }), {
    target: { value: 'Sirius' },
  });
  expect(status).toHaveTextContent('1 matching object.');
  rerender(panel(dusk));
  expect(status).toHaveTextContent('1 matching object.');

  fireEvent.click(screen.getByRole('button', { name: 'All objects' }));
  expect(status).toHaveTextContent(`Showing 40 of ${skyObjects(dusk).length}.`);
});
