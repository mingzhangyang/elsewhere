import * as THREE from 'three';
import type { Star } from '../types';
import { CONSTELLATIONS } from '../lib/stars';
import { directionVector, makeTextSprite, setAtDirection } from './resources';

/** Topology and text textures are owned for the lifetime of this layer. */
export function createCelestialLayers(scene: THREE.Scene, catalog: Star[], text = makeTextSprite) {
  const labels = new Map(
    catalog
      .filter((star) => star.name && star.magnitude < 1.35)
      .map((star) => {
        const sprite = text(star.name, '#cbd7e9');
        scene.add(sprite);
        return [star.id, sprite] as const;
      }),
  );
  const patterns = CONSTELLATIONS.map((definition) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(definition.lines.length * 6), 3),
    );
    const material = new THREE.LineBasicMaterial({ color: 0x7da8d8, transparent: true, depthWrite: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    const label = text(definition.name, '#93afd2');
    label.scale.set(150, 30, 1);
    scene.add(lines, label);
    return { definition, lines, label };
  });
  function update(
    stars: Star[],
    flags: { stars: boolean; labels: boolean; constellations: boolean },
    opacity: number,
  ) {
    const byId = new Map(stars.map((star) => [star.id, star]));
    for (const [id, label] of labels) {
      const star = byId.get(id);
      label.visible = !!star && star.altitude > 5 && flags.labels && flags.stars && opacity > 0.01;
      if (star) setAtDirection(label, star.altitude + 1.8, star.azimuth, 1740);
      label.material.opacity = opacity;
      label.userData.eligible = label.visible;
    }
    for (const { definition, lines, label } of patterns) {
      const attribute = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
      let count = 0;
      const midpoint = new THREE.Vector3();
      for (const [aId, bId] of definition.lines) {
        const a = byId.get(aId),
          b = byId.get(bId);
        if (!a || !b) continue;
        for (const star of [a, b]) {
          const p = directionVector(star.altitude, star.azimuth).multiplyScalar(1760);
          attribute.setXYZ(count++, p.x, p.y, p.z);
          midpoint.add(p);
        }
      }
      attribute.needsUpdate = true;
      lines.geometry.setDrawRange(0, count);
      lines.visible = flags.constellations && opacity > 0.01;
      lines.material.opacity = opacity * 0.36;
      label.position.copy(midpoint.normalize().multiplyScalar(1710));
      label.visible = flags.constellations && flags.labels && midpoint.y > 0 && opacity > 0.01;
      label.material.opacity = opacity;
      label.userData.eligible = label.visible;
    }
  }
  const sprites = [...labels.values(), ...patterns.map((p) => p.label)];
  const projected = new THREE.Vector3();
  function layout(camera: THREE.PerspectiveCamera, width: number, height: number) {
    const occupied: { left: number; top: number; right: number; bottom: number }[] = [];
    for (const label of sprites) {
      label.visible = false;
      if (!label.userData.eligible) continue;
      projected.copy(label.position).project(camera);
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
      const depth = -projected.copy(label.position).applyMatrix4(camera.matrixWorldInverse).z;
      const scale = (2 * Math.tan((camera.fov * Math.PI) / 360) * depth) / height;
      label.scale.set(w * scale, h * scale, 1);
      label.visible = true;
      occupied.push(box);
    }
  }
  return { update, layout };
}
