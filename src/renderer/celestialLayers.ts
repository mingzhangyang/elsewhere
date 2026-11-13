import * as THREE from 'three';
import type { Star } from '../types';
import { CONSTELLATIONS } from '../lib/stars';
import { directionVector, makeTextSprite, setAtDirection } from './resources';

/** Topology and text textures are owned for the lifetime of this layer. */
export function createCelestialLayers(scene: THREE.Scene, catalog: Star[], text = makeTextSprite) {
  const labels = new Map(catalog.filter((star) => star.name && star.magnitude < 1.35).map((star) => {
    const sprite = text(star.name, '#cbd7e9');
    scene.add(sprite);
    return [star.id, sprite] as const;
  }));
  const patterns = CONSTELLATIONS.map((definition) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(definition.lines.length * 6), 3));
    const material = new THREE.LineBasicMaterial({ color: 0x7da8d8, transparent: true, depthWrite: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    const label = text(definition.name, '#93afd2');
    label.scale.set(150, 30, 1);
    scene.add(lines, label);
    return { definition, lines, label };
  });
  function update(stars: Star[], flags: { stars: boolean; labels: boolean; constellations: boolean }, opacity: number) {
    const byId = new Map(stars.map((star) => [star.id, star]));
    for (const [id, label] of labels) {
      const star = byId.get(id);
      label.visible = !!star && star.altitude > 5 && flags.labels && flags.stars && opacity > .01;
      if (star) setAtDirection(label, star.altitude + 1.8, star.azimuth, 1740);
      label.material.opacity = opacity;
    }
    for (const { definition, lines, label } of patterns) {
      const attribute = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
      let count = 0;
      const midpoint = new THREE.Vector3();
      for (const [aId, bId] of definition.lines) {
        const a = byId.get(aId), b = byId.get(bId);
        if (!a || !b) continue;
        for (const star of [a, b]) {
          const p = directionVector(star.altitude, star.azimuth).multiplyScalar(1760);
          attribute.setXYZ(count++, p.x, p.y, p.z);
          midpoint.add(p);
        }
      }
      attribute.needsUpdate = true;
      lines.geometry.setDrawRange(0, count);
      lines.visible = flags.constellations && opacity > .01;
      lines.material.opacity = opacity * .36;
      label.position.copy(midpoint.normalize().multiplyScalar(1710));
      label.visible = flags.constellations && flags.labels && midpoint.y > 0 && opacity > .01;
      label.material.opacity = opacity;
    }
  }
  return { update };
}
