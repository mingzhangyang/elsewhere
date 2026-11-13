import * as THREE from 'three';

export function directionVector(altitude: number, azimuth: number): THREE.Vector3 {
  const alt = THREE.MathUtils.degToRad(altitude);
  const az = THREE.MathUtils.degToRad(azimuth);
  return new THREE.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
}

export function makeGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(255,250,220,1)');
  gradient.addColorStop(0.13, 'rgba(255,219,153,0.72)');
  gradient.addColorStop(0.36, 'rgba(255,154,79,0.2)');
  gradient.addColorStop(1, 'rgba(255,120,60,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

export function makeTextSprite(text: string, color = '#e8edf7'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = '500 32px Arial';
  canvas.width = Math.ceil(ctx.measureText(text).width) + 32;
  canvas.height = 56;
  ctx.font = '500 32px Arial';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.8)';
  ctx.shadowBlur = 10;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.userData.aspect = canvas.width / canvas.height;
  sprite.scale.set(118, 29, 1);
  return sprite;
}

export function disposeGroupContents(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((node) => {
      const renderable = node as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      renderable.geometry?.dispose();
      if (renderable.material) {
        const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
        materials.forEach((material) => {
          const textured = material as THREE.Material & { map?: THREE.Texture; alphaMap?: THREE.Texture };
          textured.map?.dispose();
          textured.alphaMap?.dispose();
          material.dispose();
        });
      }
    });
  }
}

export function setAtDirection(
  object: THREE.Object3D,
  altitude: number,
  azimuth: number,
  radius: number,
): void {
  object.position.copy(directionVector(altitude, azimuth).multiplyScalar(radius));
}
