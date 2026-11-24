import type { CameraView, MomentSnapshot } from '../contracts';
import type { HorizontalPosition } from '../types';
import { createSceneToGalactic } from '../domain/galactic';
import {
  limitingMagnitude,
  milkyWayVisibility,
  planetVisibilityFactors,
  starVisibilityFactors,
  weatherVisibility,
} from '../domain/starVisibility';
import { createProjection } from './projection';

export type MomentFraming = 'auto' | 'current';
const RAD = Math.PI / 180;
const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));
const wrap = (x: number) => ((x % 360) + 360) % 360;

function direction({ altitude, azimuth }: HorizontalPosition): [number, number, number] {
  const a = altitude * RAD;
  const z = azimuth * RAD;
  return [Math.cos(a) * Math.sin(z), Math.sin(a), -Math.cos(a) * Math.cos(z)];
}

/** Keep a little foreground when possible; never move an object to make room for it. */
function aim(target: HorizontalPosition, fov = 66, offset = 8): CameraView {
  return {
    heading: wrap(target.azimuth - offset),
    altitude: clamp(target.altitude - fov * 0.18, 19, 90),
    fov,
  };
}

type WeightedPosition = HorizontalPosition & { weight: number };

/** At most five planets: try spherical subset centers, scoring the actual picture rather than
 * arithmetic azimuth averages or a field of view wide enough to include opposite hemispheres. */
function planetView(planets: readonly WeightedPosition[], aspect: number): CameraView | undefined {
  let best: { view: CameraView; score: number } | undefined;
  for (let mask = 1; mask < 1 << planets.length; mask++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i < planets.length; i++) {
      if (!(mask & (1 << i))) continue;
      const p = planets[i];
      const d = direction(p);
      x += d[0] * p.weight;
      y += d[1] * p.weight;
      z += d[2] * p.weight;
    }
    const length = Math.hypot(x, y, z);
    if (length < 1e-6) continue;
    const center = {
      altitude: Math.asin(clamp(y / length, -1, 1)) / RAD,
      azimuth: wrap(Math.atan2(x, -z) / RAD),
    };
    for (const fov of [66, 80, 92]) {
      for (const offset of [8, 0, -8]) {
        const view = aim(center, fov, offset);
        const project = createProjection(view, aspect);
        let score = -(fov - 66) * 0.015;
        let count = 0;
        for (const p of planets) {
          const point = project(p.altitude, p.azimuth);
          if (!point.front || Math.abs(point.x) > 0.78 || Math.abs(point.y) > 0.78) continue;
          count++;
          // A group beats a lone planet; brightness and balanced placement break ties.
          score += 4 + p.weight - 0.25 * Math.hypot(point.x, point.y - 0.25);
        }
        if (count && (!best || score > best.score)) best = { view, score };
      }
    }
  }
  return best?.view;
}

/** Find an actual above-horizon part of the Galactic plane, favouring the bright inner Galaxy. */
function galaxyTarget(snapshot: MomentSnapshot): HorizontalPosition | undefined {
  const { sky, weather, skyBrightness } = snapshot;
  const share =
    milkyWayVisibility(limitingMagnitude(skyBrightness, sky.moon), sky.sunAltitude) *
    weatherVisibility(weather);
  if (share < 0.15) return undefined;
  const galactic = createSceneToGalactic(sky.starField);
  let best: (HorizontalPosition & { score: number }) | undefined;
  for (let altitude = 20; altitude <= 80; altitude += 10) {
    for (let azimuth = 0; azimuth < 360; azimuth += 10) {
      const [x, y, z] = galactic(direction({ altitude, azimuth }));
      const latitude = Math.asin(clamp(z, -1, 1)) / RAD;
      const longitude = Math.atan2(y, x) / RAD;
      const score =
        Math.exp(-(latitude * latitude) / 100) *
        (0.4 + 0.6 * Math.exp(-(longitude * longitude) / 3600)) *
        (0.6 + 0.4 * Math.sin(altitude * RAD));
      if (!best || score > best.score) best = { altitude, azimuth, score };
    }
  }
  return best && best.score > 0.2 ? best : undefined;
}

/** Image-only composition. An explicitly focused and still-centered object is recorded by App as
 * an object subject. An inferred centered constellation is NOT a deliberate selection. The current
 * view option preserves either one, and no image option changes the live camera or shared link. */
export function frameMoment(snapshot: MomentSnapshot, mode: MomentFraming): MomentSnapshot {
  if (mode === 'current' || snapshot.subject?.kind === 'object') return snapshot;
  const { sky, weather, skyBrightness, layers } = snapshot;
  // The postcard already clamps the sky panel to 1200 x 800..1500. Use its actual aspect
  // for automatic composition so a desktop or phone viewport cannot crop out the subject.
  const aspect = clamp(snapshot.aspect, 0.8, 1.5);
  let view: CameraView | undefined;
  if (sky.sun.visible || sky.sunAltitude >= -2) {
    view = aim(sky.sun);
  } else if (weather.cloudCover < 85) {
    if (sky.moon.visible && sky.moon.illumination >= 0.03) {
      view = aim(sky.moon);
    } else {
      const planets = sky.planets
        .filter((p) => p.visible && planetVisibilityFactors(p, sky, weather, skyBrightness).combined >= 0.2)
        .map((p) => ({ ...p, weight: 1 + clamp(-p.magnitude, 0, 4) * 0.25 }));
      view = planetView(planets, aspect);
      if (!view && sky.sunAltitude >= -6) view = aim(sky.sun);
      if (!view && layers.stars) {
        const galaxy = galaxyTarget(snapshot);
        if (galaxy) view = aim(galaxy);
        else {
          let best: { star: HorizontalPosition; score: number } | undefined;
          for (const star of sky.stars) {
            if (star.altitude < 8) continue;
            const visibility = starVisibilityFactors(star, sky, weather, skyBrightness).combined;
            const score = visibility * (4 - clamp(star.magnitude, -2, 3));
            if (visibility >= 0.5 && (!best || score > best.score)) best = { star, score };
          }
          if (best) view = aim(best.star);
        }
      }
    }
  } else if (sky.sunAltitude >= -6) {
    view = aim(sky.sun);
  }
  return view ? { ...snapshot, aspect, view, subject: undefined } : snapshot;
}
