import type { CameraView, MomentSnapshot } from '../contracts';
import type { HorizontalPosition } from '../types';
import { createSceneToGalactic } from '../domain/galactic';
import {
  limitingMagnitude,
  milkyWayVisibility,
  planetVisibilityFactors,
  starVisibilityFactors,
  weatherVisibility,
  twilightVisibility,
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

/** Postcard aspects keep the fixed 8° bias. Narrower output aspects shrink it and keep the
 * target inside the frame — an 8° shift at aspect 0.1 lands past the canvas edge. */
function aimForAspect(target: HorizontalPosition, aspect: number, fov = 66): CameraView {
  if (aspect >= 0.8) return aim(target, fov, 8);
  const scaled = 8 * (aspect / 0.8);
  let fallback = aim(target, fov, 0);
  for (const offset of [scaled, 0]) {
    const view = aim(target, fov, offset);
    fallback = view;
    const p = createProjection(view, aspect)(target.altitude, target.azimuth);
    if (p.front && Math.abs(p.x) <= 0.88 && Math.abs(p.y) <= 0.88) return view;
  }
  return fallback;
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
export function frameMoment(
  snapshot: MomentSnapshot,
  mode: MomentFraming,
  options?: { aspect?: number; milkyWay?: boolean },
): MomentSnapshot {
  if (mode === 'current' || snapshot.subject?.kind === 'object') return snapshot;
  const { sky, weather, skyBrightness, layers } = snapshot;
  // The postcard defaults to its clamped sky panel aspect; standalone callers supply the actual
  // output aspect so a desktop or phone viewport cannot crop out the subject.
  const aspect = options?.aspect ?? clamp(snapshot.aspect, 0.8, 1.5);
  let view: CameraView | undefined;
  if (sky.sun.visible || sky.sunAltitude >= -2) {
    view = aimForAspect(sky.sun, aspect);
  } else if (weather.cloudCover < 85) {
    if (sky.moon.visible && sky.moon.illumination >= 0.03) {
      view = aimForAspect(sky.moon, aspect);
    } else {
      const planets = sky.planets
        .filter((p) => p.visible && planetVisibilityFactors(p, sky, weather, skyBrightness).combined >= 0.2)
        .map((p) => ({ ...p, weight: 1 + clamp(-p.magnitude, 0, 4) * 0.25 }));
      view = planetView(planets, aspect);
      if (!view && sky.sunAltitude >= -6) view = aimForAspect(sky.sun, aspect);
      if (!view && layers.stars) {
        const galaxy = options?.milkyWay === false ? undefined : galaxyTarget(snapshot);
        if (galaxy) view = aimForAspect(galaxy, aspect);
        else {
          let best: { star: HorizontalPosition; score: number } | undefined;
          for (const star of sky.stars) {
            if (star.altitude < 8) continue;
            const visibility = starVisibilityFactors(star, sky, weather, skyBrightness).combined;
            const score = visibility * (4 - clamp(star.magnitude, -2, 3));
            if (visibility >= 0.5 && (!best || score > best.score)) best = { star, score };
          }
          if (best) view = aimForAspect(best.star, aspect);
        }
      }
    }
  } else if (sky.sunAltitude >= -6) {
    view = aimForAspect(sky.sun, aspect);
  }
  return view ? { ...snapshot, aspect, view, subject: undefined } : snapshot;
}

/** Aim at the actual above-horizon members of a requested pattern, including across north. */
export function framePattern(
  snapshot: MomentSnapshot,
  lines: readonly (readonly string[])[],
  aspect: number,
): MomentSnapshot {
  const { sky, weather } = snapshot;
  if (twilightVisibility(sky.sunAltitude) * weatherVisibility(weather) <= 0.01) return snapshot;
  const byId = new Map(sky.stars.map((star) => [star.id, star]));
  const ids = new Set<string>();
  for (const [a, b] of lines) {
    const sa = byId.get(a);
    const sb = byId.get(b);
    if (sa && sb && sa.altitude > 0 && sb.altitude > 0 && a !== b) {
      ids.add(a);
      ids.add(b);
    }
  }
  if (ids.size < 2) return snapshot;
  const stars = [...ids].map((id) => byId.get(id)!);
  const sum = [0, 0, 0];
  for (const star of stars) {
    const d = direction(star);
    for (let i = 0; i < 3; i++) sum[i] += d[i];
  }
  const length = Math.hypot(...sum);
  if (length < 1e-6) return snapshot;
  const heading = wrap(Math.atan2(sum[0], -sum[2]) / RAD);
  const altitude = Math.asin(clamp(sum[1] / length, -1, 1)) / RAD;
  let best: { view: CameraView; count: number; edges: number } | undefined;
  // Prefer foreground room and a narrow composition, widen/center only when needed.
  for (const fov of [66, 80, 92]) {
    for (const tilt of [clamp(altitude - 15, 12, 90), altitude]) {
      const view = { heading, altitude: tilt, fov };
      const project = createProjection(view, aspect);
      const inside = new Set(
        stars
          .filter((star) => {
            const p = project(star.altitude, star.azimuth);
            return p.front && Math.abs(p.x) <= 0.88 && Math.abs(p.y) <= 0.88;
          })
          .map((star) => star.id),
      );
      const edges = lines.filter(([a, b]) => a !== b && inside.has(a) && inside.has(b)).length;
      const count = inside.size;
      if (edges && (!best || count > best.count || (count === best.count && edges > best.edges))) {
        best = { view, count, edges };
      }
    }
  }
  return best ? { ...snapshot, view: best.view, aspect, subject: undefined } : snapshot;
}
