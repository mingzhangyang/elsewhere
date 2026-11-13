import * as THREE from 'three';

export function directionVector(altitude: number, azimuth: number): THREE.Vector3 {
  const alt = THREE.MathUtils.degToRad(altitude);
  const az = THREE.MathUtils.degToRad(azimuth);
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(alt),
    Math.sin(alt),
    -Math.cos(az) * Math.cos(alt),
  );
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

export function makeMoonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#9c9b95';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 18431;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1800; i += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const r = 1 + random() * (i < 50 ? 16 : 6);
    const shade = Math.floor(100 + random() * 95);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${shade},${shade},${shade - 2},${0.06 + random() * 0.18})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - r * 0.18, y - r * 0.18, r * 0.72, Math.PI, Math.PI * 1.8);
    ctx.strokeStyle = 'rgba(45,46,47,0.13)';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function makeTextSprite(text: string, color = '#e8edf7'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '500 40px DM Sans, Arial';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.8)';
  ctx.shadowBlur = 10;
  ctx.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(118, 29, 1);
  return sprite;
}


export function disposeGroupContents(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((node) => {
      const renderable = node as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
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

export function setAtDirection(object: THREE.Object3D, altitude: number, azimuth: number, radius: number): void {
  object.position.copy(directionVector(altitude, azimuth).multiplyScalar(radius));
}

