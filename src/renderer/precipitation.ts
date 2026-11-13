import * as THREE from 'three';

export function wrap(value: number, min: number, max: number): number {
  return ((((value - min) % (max - min)) + max - min) % (max - min)) + min;
}

/** Meteorological direction is FROM; particles and clouds move downwind. */
export function windVector(speed: number, direction: number): THREE.Vector3 {
  const angle = ((direction + 180) * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(angle) * speed, 0, -Math.cos(angle) * speed);
}

export function advancePrecipitation(
  positions: THREE.BufferAttribute,
  delta: number,
  wind: THREE.Vector3,
  snow: boolean,
) {
  for (let i = 0; i < positions.count; i++) {
    positions.setXYZ(
      i,
      wrap(positions.getX(i) + wind.x * delta, -35, 35),
      wrap(positions.getY(i) - delta * (snow ? 2 : 18), -26, 50),
      wrap(positions.getZ(i) + wind.z * delta, -74, -8),
    );
  }
  positions.needsUpdate = true;
}
