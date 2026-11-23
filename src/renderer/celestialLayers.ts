import * as THREE from 'three';
import type { Star } from '../types';
import { CONSTELLATIONS, type PatternId } from '../domain/stars';
import { directionVector, makeTextSprite } from './resources';

/**
 * Topology and text textures are owned for the lifetime of this layer. Star order is fixed by the
 * catalog, so the stars each label and line needs are resolved to indices once; an update touches
 * only those few dozen stars, never the whole catalog.
 */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A labelled body outside the star catalog (a planet) as drawn at an instant. */
export interface BodyLabelState {
  altitude: number;
  azimuth: number;
  /** Display opacity of the drawn point, 0–1; the label shows only while the point does. */
  opacity: number;
}

/** Below this altitude, in degrees, a planet's label would crowd the horizon. */
const BODY_LABEL_MIN_ALTITUDE = 2;

/** Cloud dome is 20; keep text above clouds but below foreground precipitation (30). */
export const CELESTIAL_LABEL_RENDER_ORDER = 21;

/** Text is UI, not emitted light. Fade only at near-total overcast to avoid floating names. */
export function cloudLabelOpacity(cloudCover: number): number {
  return 1 - THREE.MathUtils.smoothstep(cloudCover, 90, 100);
}

/** How labels name stars and line patterns, in the interface language. */
export interface LabelNames {
  star: (star: Star) => string;
  pattern: (id: PatternId) => string;
}
const CATALOG_NAMES: LabelNames = { star: (star) => star.name, pattern: (id) => id };

/**
 * Builds the labels and line patterns. `bodies` are the labelled planets, already named. Names are
 * drawn into textures here, so a language change builds a new layer (and disposes this one).
 */
export function createCelestialLayers(
  parent: THREE.Object3D,
  catalog: Star[],
  text = makeTextSprite,
  bodies: readonly { id: string; name: string }[] = [],
  names: LabelNames = CATALOG_NAMES,
) {
  const bodyLabels = bodies.map((body) => {
    const sprite = text(body.name, '#f1dfb8');
    parent.add(sprite);
    return { id: body.id, sprite };
  });
  const indexOf = new Map(catalog.map((star, index) => [star.id, index]));
  const labels = catalog.flatMap((star, index) => {
    if (!star.name || star.magnitude >= 1.35) return [];
    const sprite = text(names.star(star), '#cbd7e9');
    parent.add(sprite);
    return [{ id: star.id, index, sprite }];
  });
  const patterns = CONSTELLATIONS.map((definition) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(definition.lines.length * 6), 3),
    );
    const material = new THREE.LineBasicMaterial({ color: 0x7da8d8, transparent: true, depthWrite: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    const label = text(names.pattern(definition.id), '#93afd2');
    label.scale.set(150, 30, 1);
    parent.add(lines, label);
    const ends = definition.lines.flat().map((id) => ({ id, index: indexOf.get(id) ?? -1 }));
    return { ends, lines, label };
  });
  const starAt = (stars: Star[], end: { id: string; index: number }) => {
    const star = stars[end.index];
    return star?.id === end.id ? star : undefined;
  };
  let patternsShown = false;
  /** Visibility and opacity for an instant; positions follow from `place`. */
  function update(
    stars: Star[],
    flags: { stars: boolean; labels: boolean; constellations: boolean },
    opacity: number,
    bodyStates: readonly BodyLabelState[] = [],
    cloudOpacity = 1,
  ) {
    const labelOpacity = opacity * cloudOpacity;
    const labelsShown = flags.labels && cloudOpacity > 0.01;
    bodyLabels.forEach(({ sprite }, i) => {
      const body = bodyStates[i];
      // Planets are not part of the stars layer; like the Sun and Moon they are always drawn.
      sprite.visible =
        !!body &&
        body.altitude > BODY_LABEL_MIN_ALTITUDE &&
        labelsShown &&
        body.opacity > 0.05;
      sprite.material.opacity = Math.min(1, (body?.opacity ?? 0) * 1.4) * cloudOpacity;
      sprite.userData.eligible = sprite.visible;
    });
    for (const entry of labels) {
      const star = starAt(stars, entry);
      const label = entry.sprite;
      label.visible = !!star && star.altitude > 5 && labelsShown && flags.stars && labelOpacity > 0.01;
      label.material.opacity = labelOpacity;
      label.userData.eligible = label.visible;
    }
    patternsShown = flags.constellations && opacity > 0.01;
    for (const { lines, label } of patterns) {
      lines.visible = patternsShown;
      lines.material.opacity = opacity * 0.36;
      label.material.opacity = labelOpacity;
      label.userData.patternLabel = labelsShown && patternsShown;
    }
    // At rest, each star and body is where its horizontal position says.
    place(
      (index, target) => {
        const star = stars[index];
        return star ? target.copy(directionVector(star.altitude, star.azimuth)) : null;
      },
      (index, target) => {
        const body = bodyStates[index];
        return body ? target.copy(directionVector(body.altitude, body.azimuth)) : null;
      },
    );
  }
  /** Just above a point: 1.8° toward the zenith along its vertical circle. */
  const above = (sprite: THREE.Sprite, apparent: THREE.Vector3) => {
    const altitude = Math.asin(THREE.MathUtils.clamp(apparent.y, -1, 1));
    const azimuth = Math.atan2(apparent.x, -apparent.z);
    lift.copy(directionVector(THREE.MathUtils.radToDeg(altitude) + 1.8, THREE.MathUtils.radToDeg(azimuth)));
    sprite.position.copy(lift).multiplyScalar(1740);
  };
  const direction = new THREE.Vector3();
  const point = new THREE.Vector3();
  const lift = new THREE.Vector3();
  /**
   * Positions labels and lines from each star's (and body's) apparent direction (`null` when
   * unknown). The renderer calls this every frame so they follow the points through playback.
   */
  function place(
    apparent: (index: number, target: THREE.Vector3) => THREE.Vector3 | null,
    bodyApparent?: (index: number, target: THREE.Vector3) => THREE.Vector3 | null,
  ) {
    bodyLabels.forEach(({ sprite }, i) => {
      if (bodyApparent?.(i, direction)) above(sprite, direction);
    });
    for (const { index, sprite } of labels) {
      if (apparent(index, direction)) above(sprite, direction);
    }
    for (const { ends, lines, label } of patterns) {
      const attribute = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
      let count = 0;
      const midpoint = new THREE.Vector3();
      for (let i = 0; i + 1 < ends.length; i += 2) {
        if (ends[i].index < 0 || ends[i + 1].index < 0) continue;
        if (!apparent(ends[i].index, direction)) continue;
        if (!apparent(ends[i + 1].index, point)) continue;
        for (const p of [direction, point]) {
          p.multiplyScalar(1760);
          attribute.setXYZ(count++, p.x, p.y, p.z);
          midpoint.add(p);
        }
      }
      attribute.needsUpdate = true;
      lines.geometry.setDrawRange(0, count);
      label.position.copy(midpoint.normalize().multiplyScalar(1710));
      label.visible = !!label.userData.patternLabel && midpoint.y > 0;
      label.userData.eligible = label.visible;
    }
  }
  // Layout priority: planets, then bright stars, then pattern names.
  const sprites = [
    ...bodyLabels.map((entry) => entry.sprite),
    ...labels.map((entry) => entry.sprite),
    ...patterns.map((p) => p.label),
  ];
  for (const sprite of sprites) sprite.renderOrder = CELESTIAL_LABEL_RENDER_ORDER;
  const world = new THREE.Vector3();
  const projected = new THREE.Vector3();
  /**
   * Shows the labels that fit, in priority order, skipping any that would overlap one already
   * shown or a `blocked` screen box (interface panels drawn over the sky, in host pixels).
   */
  function layout(camera: THREE.PerspectiveCamera, width: number, height: number, blocked: ScreenBox[] = []) {
    const occupied: ScreenBox[] = [...blocked];
    for (const label of sprites) {
      label.visible = false;
      if (!label.userData.eligible) continue;
      label.getWorldPosition(world);
      projected.copy(world).project(camera);
      if (projected.z > 1 || projected.z < -1) continue;
      const h = 22,
        w = h * (label.userData.aspect ?? 4);
      const x = ((projected.x + 1) * width) / 2,
        y = ((1 - projected.y) * height) / 2;
      const box = { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 };
      if (box.left < 8 || box.right > width - 8 || box.top < 8 || box.bottom > height - 8) continue;
      if (
        occupied.some(
          (b) =>
            box.left < b.right + 8 &&
            box.right > b.left - 8 &&
            box.top < b.bottom + 6 &&
            box.bottom > b.top - 6,
        )
      )
        continue;
      const depth = -projected.copy(world).applyMatrix4(camera.matrixWorldInverse).z;
      const scale = (2 * Math.tan((camera.fov * Math.PI) / 360) * depth) / height;
      label.scale.set(w * scale, h * scale, 1);
      label.visible = true;
      occupied.push(box);
    }
  }
  /** Removes this layer's objects and frees their GPU resources (the catalog changed). */
  function dispose() {
    for (const sprite of sprites) {
      parent.remove(sprite);
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    for (const { lines } of patterns) {
      parent.remove(lines);
      lines.geometry.dispose();
      lines.material.dispose();
    }
  }
  return { update, place, layout, dispose };
}
