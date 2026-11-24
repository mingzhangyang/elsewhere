import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import App from '../src/App';
import { scenarioProps } from '../src/dev/scenarios';
import { parseExploration, type CameraView } from '../src/lib/persistence';

// SkyScene is not memoized, so it renders exactly when App renders: its count is App's render count.
const scene = vi.hoisted(() => ({
  renders: 0,
  onCameraChange: undefined as ((v: CameraView) => void) | undefined,
  onAspectChange: undefined as ((aspect: number) => void) | undefined,
}));
vi.mock('../src/components/SkyScene', async () => ({
  default: (await import('react')).forwardRef(function MockScene(props: {
    onCameraChange?: (view: CameraView) => void;
    onAspectChange?: (aspect: number) => void;
  }) {
    scene.renders++;
    scene.onCameraChange = props.onCameraChange;
    scene.onAspectChange = props.onAspectChange;
    return <div role="img" aria-label="Sky preview" />;
  }),
}));

it('follows camera drags in the compass and share link without re-rendering the app', () => {
  render(<App {...scenarioProps('night')} />);
  const before = scene.renders;
  act(() => {
    for (let heading = 80; heading <= 90; heading += 0.25)
      scene.onCameraChange!({ heading, altitude: 25, fov: 50 });
  });
  expect(scene.renders).toBe(before);
  expect(screen.getByRole('img', { name: 'Facing E, 90 degrees' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Share this sky' }));
  const link = (screen.getByRole('textbox', { name: 'Sky link' }) as HTMLInputElement).value;
  expect(parseExploration(new URL(link).hash).value!.camera).toEqual({ heading: 90, altitude: 25, fov: 50 });
});

it('keeps the compass within 0–359 degrees', () => {
  render(<App {...scenarioProps('night')} />);
  act(() => scene.onCameraChange!({ heading: 359.7, altitude: 18, fov: 66 }));
  expect(screen.getByRole('img', { name: 'Facing N, 0 degrees' })).toBeInTheDocument();
});

it('updates the minimap footprint on resize and zoom without changing persisted camera state', () => {
  const { container } = render(<App {...scenarioProps('night')} />);
  const before = scene.renders;
  const footprint = () => container.querySelector('.sky-minimap-footprint')?.getAttribute('d');
  expect(footprint()).toBeUndefined();
  act(() => scene.onAspectChange!(1));
  const square = footprint();
  expect(square).toBeTruthy();
  act(() => scene.onAspectChange!(2));
  const wide = footprint();
  expect(wide).not.toBe(square);
  act(() => scene.onCameraChange!({ heading: 0, altitude: 18, fov: 10 }));
  expect(footprint()).not.toBe(wide);
  expect(scene.renders).toBe(before);
  fireEvent.click(screen.getByRole('button', { name: 'Share this sky' }));
  const link = (screen.getByRole('textbox', { name: 'Sky link' }) as HTMLInputElement).value;
  expect(parseExploration(new URL(link).hash).value!.camera).toEqual({ heading: 0, altitude: 18, fov: 10 });
});
