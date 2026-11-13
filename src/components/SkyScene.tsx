import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { SkyState, Star as StarData, WeatherValues } from '../types';
import { CONSTELLATIONS } from '../lib/stars';
import { seededRandom } from '../lib/random';

type Props = {
  sky: SkyState;
  weather: WeatherValues;
  showStars: boolean;
  showConstellations: boolean;
  showLabels: boolean;
  onHeadingChange?: (heading: number) => void;
  onStarSelect?: (star: StarData | null) => void;
};

const SKY_VERTEX = `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = `
  precision highp float;
  varying vec3 vDirection;
  uniform float uSunAltitude;
  uniform vec3 uSunDirection;
  uniform float uCloud;
  uniform float uHaze;
  uniform float uWindSpeed;
  uniform float uWindDirection;
  uniform float uTime;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }
  float fbm(vec3 p) {
    float value = 0.0;
    float amp = 0.56;
    for (int i = 0; i < 4; i++) {
      value += amp * noise3(p);
      p *= 2.03;
      amp *= 0.49;
    }
    return value;
  }
  void main() {
    vec3 d = normalize(vDirection);
    float elevation = max(d.y, 0.0);
    float horizon = pow(1.0 - elevation, 4.8);
    float day = smoothstep(-0.055, 0.13, uSunAltitude);
    float twilight = smoothstep(-0.31, -0.10, uSunAltitude) * (1.0 - smoothstep(-0.045, 0.08, uSunAltitude));

    vec3 nightZenith = vec3(0.006, 0.013, 0.035);
    vec3 nightHorizon = vec3(0.020, 0.043, 0.092);
    vec3 dayZenith = vec3(0.045, 0.29, 0.62);
    vec3 dayHorizon = vec3(0.46, 0.66, 0.79);
    vec3 nightSky = mix(nightHorizon, nightZenith, pow(elevation, 0.52));
    vec3 daySky = mix(dayHorizon, dayZenith, pow(elevation, 0.42));
    vec3 color = mix(nightSky, daySky, day);
    vec3 warmHorizon = vec3(0.74, 0.28, 0.12);
    vec3 warmZenith = vec3(0.13, 0.12, 0.23);
    vec3 dusk = mix(warmHorizon, warmZenith, pow(elevation, 0.62));
    color = mix(color, dusk, twilight * (0.42 + horizon * 0.52));

    float solarGlow = pow(max(dot(d, normalize(uSunDirection)), 0.0), 11.0);
    float broadGlow = pow(max(dot(d, normalize(uSunDirection)), 0.0), 2.1);
    color += vec3(1.0, 0.47, 0.19) * solarGlow * (0.16 + twilight * 0.55);
    color += vec3(0.28, 0.22, 0.20) * broadGlow * day * 0.05;

    // Meteorological wind direction points FROM; clouds drift in the opposite direction.
    float angle = (uWindDirection + 180.0) * 0.0174532925;
    vec3 drift = vec3(sin(angle), 0.12, -cos(angle)) * (uWindSpeed * 0.0025) * uTime;
    vec3 cloudCoord = d * vec3(7.5, 4.6, 7.5) + drift;
    float cloudNoise = fbm(cloudCoord);
    float coverage = clamp(uCloud, 0.0, 1.0);
    float clouds = smoothstep(0.58 - coverage * 0.36, 0.88, cloudNoise) * coverage;
    float cloudAlpha = clamp(clouds * 1.10, 0.0, 0.86);
    vec3 cloudDay = vec3(0.72, 0.77, 0.79);
    vec3 cloudNight = vec3(0.045, 0.065, 0.105);
    vec3 cloudColor = mix(cloudNight, cloudDay, day);
    cloudColor = mix(cloudColor, vec3(0.61, 0.34, 0.28), twilight * 0.58);
    color = mix(color, cloudColor, cloudAlpha);

    float haze = clamp(uHaze, 0.0, 1.0) * horizon;
    color = mix(color, mix(vec3(0.15,0.19,0.24), vec3(0.78,0.72,0.64), day), haze * 0.60);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function directionVector(altitude: number, azimuth: number): THREE.Vector3 {
  const alt = THREE.MathUtils.degToRad(altitude);
  const az = THREE.MathUtils.degToRad(azimuth);
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(alt),
    Math.sin(alt),
    -Math.cos(az) * Math.cos(alt),
  );
}

function makeGlowTexture(): THREE.CanvasTexture {
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

function makeMoonTexture(): THREE.CanvasTexture {
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

function makeTextSprite(text: string, color = '#e8edf7'): THREE.Sprite {
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


function disposeGroupContents(group: THREE.Group): void {
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

function setAtDirection(object: THREE.Object3D, altitude: number, azimuth: number, radius: number): void {
  object.position.copy(directionVector(altitude, azimuth).multiplyScalar(radius));
}

export default function SkyScene({ sky, weather, showStars, showConstellations, showLabels, onHeadingChange, onStarSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneApi = useRef<{
    update: (nextSky: SkyState, nextWeather: WeatherValues, flags: { stars: boolean; constellations: boolean; labels: boolean }) => void;
    setHeading: (value: number) => void;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    const random = seededRandom(18431);
    const camera = new THREE.PerspectiveCamera(66, host.clientWidth / host.clientHeight, 0.1, 5000);
    camera.position.set(0, 0, 0);
    camera.rotation.order = 'YXZ';
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    host.appendChild(renderer.domElement);

    const skyUniforms = {
      uSunAltitude: { value: THREE.MathUtils.degToRad(sky.sunAltitude) },
      uSunDirection: { value: directionVector(sky.sun.altitude, sky.sun.azimuth) },
      uCloud: { value: weather.cloudCover / 100 },
      uHaze: { value: 0.08 },
      uWindSpeed: { value: weather.windSpeed },
      uWindDirection: { value: weather.windDirection },
      uTime: { value: 0 },
    };
    const skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: true,
    });
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(3000, 72, 48), skyMaterial);
    scene.add(skyDome);

    const ground = new THREE.Mesh(
      new THREE.SphereGeometry(1450, 80, 40, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x080e14, side: THREE.BackSide }),
    );
    scene.add(ground);

    // Low-poly distant ridge: a subtle 360-degree landscape boundary.
    const ridgeGeometry = new THREE.BufferGeometry();
    const ridgeVertices: number[] = [];
    const ridgeIndices: number[] = [];
    const ridgeSegments = 180;
    for (let i = 0; i <= ridgeSegments; i += 1) {
      const angle = (i / ridgeSegments) * Math.PI * 2;
      const wave = Math.sin(angle * 5.0) * 10 + Math.sin(angle * 11.0) * 4 + Math.cos(angle * 17.0) * 2;
      const radius = 1435;
      const topY = Math.max(-45, Math.min(18, wave - 14));
      ridgeVertices.push(Math.sin(angle) * radius, topY, -Math.cos(angle) * radius);
      ridgeVertices.push(Math.sin(angle) * radius, -220, -Math.cos(angle) * radius);
      if (i < ridgeSegments) {
        const a = i * 2;
        ridgeIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    ridgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ridgeVertices, 3));
    ridgeGeometry.setIndex(ridgeIndices);
    ridgeGeometry.computeVertexNormals();
    const ridge = new THREE.Mesh(ridgeGeometry, new THREE.MeshBasicMaterial({ color: 0x0b1319, side: THREE.DoubleSide }));
    scene.add(ridge);

    const sunGroup = new THREE.Group();
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(19, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe3a8, transparent: true, depthWrite: false }),
    );
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), color: 0xffd39a, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sunGlow.scale.set(170, 170, 1);
    sunGroup.add(sunGlow, sunDisc);
    scene.add(sunGroup);

    const moonGroup = new THREE.Group();
    const moonTexture = makeMoonTexture();
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(20, 64, 48),
      new THREE.MeshStandardMaterial({ map: moonTexture, roughness: 1, metalness: 0, color: 0xf6f2e8 }),
    );
    moonGroup.add(moonMesh);
    scene.add(moonGroup);
    const moonLight = new THREE.DirectionalLight(0xffffff, 2.2);
    moonLight.target = moonMesh;
    scene.add(moonLight);
    scene.add(new THREE.AmbientLight(0x35415a, 0.045));

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(90 * 3);
    const starSizes = new Float32Array(90);
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 1 } },
      vertexShader: `
        attribute float aSize;
        varying float vSize;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(aSize * (1700.0 / max(1.0, -mvPosition.z)), 1.0, 8.0);
          vSize = aSize;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying float vSize;
        void main() {
          vec2 p = gl_PointCoord - vec2(0.5);
          float r = length(p);
          if (r > 0.5) discard;
          float alpha = (1.0 - smoothstep(0.24, 0.5, r)) * uOpacity;
          gl_FragColor = vec4(vec3(0.78, 0.86, 1.0), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const starPoints = new THREE.Points(starGeometry, starMaterial);
    scene.add(starPoints);

    const starLabels = new THREE.Group();
    scene.add(starLabels);
    const constellationGroup = new THREE.Group();
    scene.add(constellationGroup);
    const constellationLabels = new THREE.Group();
    scene.add(constellationLabels);

    const rainCount = 720;
    const rainGeometry = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i += 1) {
      rainPositions[i * 3] = (random() - 0.5) * 70;
      rainPositions[i * 3 + 1] = random() * 58 - 20;
      rainPositions[i * 3 + 2] = -12 - random() * 62;
    }
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMaterial = new THREE.PointsMaterial({ color: 0xa8c9e9, size: 0.16, transparent: true, opacity: 0.0, depthWrite: false });
    const rainPoints = new THREE.Points(rainGeometry, rainMaterial);
    camera.add(rainPoints);
    scene.add(camera);

    let yaw = 0;
    let pitch = 0;
    let activeWeather = weather;
    let pointerDown = false;
    let pointerDragged = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let lastX = 0;
    let lastY = 0;
    let activeStars = sky.stars;
    let activeShowStars = showStars;
    let headingCallbackTimer = 0;
    const setHeading = (value: number) => {
      yaw = value;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      onHeadingChange?.(((-yaw * 180 / Math.PI) % 360 + 360) % 360);
    };
    const resetViewHandler = () => {
      yaw = 0;
      pitch = 0;
      camera.rotation.set(0, 0, 0, 'YXZ');
      camera.fov = 66;
      camera.updateProjectionMatrix();
      onHeadingChange?.(0);
    };
    window.addEventListener('sky-reset-view', resetViewHandler);
    const pointerDownHandler = (event: PointerEvent) => {
      pointerDown = true;
      pointerDragged = false;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const pointerMoveHandler = (event: PointerEvent) => {
      if (!pointerDown) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY) > 5) pointerDragged = true;
      lastX = event.clientX;
      lastY = event.clientY;
      yaw -= dx * 0.0038;
      pitch = THREE.MathUtils.clamp(pitch - dy * 0.0034, -1.50, 1.50);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      if (headingCallbackTimer % 4 === 0) onHeadingChange?.(((-yaw * 180 / Math.PI) % 360 + 360) % 360);
      headingCallbackTimer += 1;
    };
    const pointerUpHandler = (event: PointerEvent) => {
      pointerDown = false;
      if (pointerDragged || !activeShowStars) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.params.Points!.threshold = 22;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(starPoints, false)[0];
      const index = hit?.index;
      const star = typeof index === 'number' ? activeStars[index] : undefined;
      onStarSelect?.(star && star.altitude > 0 ? star : null);
    };
    const wheelHandler = (event: WheelEvent) => {
      camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * 0.025, 38, 92);
      camera.updateProjectionMatrix();
    };
    const contextHandler = (event: Event) => event.preventDefault();
    renderer.domElement.addEventListener('pointerdown', pointerDownHandler);
    renderer.domElement.addEventListener('pointermove', pointerMoveHandler);
    renderer.domElement.addEventListener('pointerup', pointerUpHandler);
    renderer.domElement.addEventListener('pointercancel', pointerUpHandler);
    renderer.domElement.addEventListener('wheel', wheelHandler, { passive: true });
    renderer.domElement.addEventListener('contextmenu', contextHandler);

    const resizeObserver = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    });
    resizeObserver.observe(host);

    const api = {
      update: (nextSky: SkyState, nextWeather: WeatherValues, flags: { stars: boolean; constellations: boolean; labels: boolean }) => {
        activeStars = nextSky.stars;
        activeShowStars = flags.stars;
        activeWeather = nextWeather;
        skyUniforms.uSunAltitude.value = THREE.MathUtils.degToRad(nextSky.sunAltitude);
        skyUniforms.uSunDirection.value.copy(directionVector(nextSky.sun.altitude, nextSky.sun.azimuth));
        skyUniforms.uCloud.value = nextWeather.cloudCover / 100;
        skyUniforms.uHaze.value = THREE.MathUtils.clamp(nextWeather.haze / 100, 0, 1);
        skyUniforms.uWindSpeed.value = nextWeather.windSpeed;
        skyUniforms.uWindDirection.value = nextWeather.windDirection;

        setAtDirection(sunGroup, nextSky.sun.altitude, nextSky.sun.azimuth, 1650);
        sunGroup.visible = nextSky.sun.visible;
        sunDisc.scale.setScalar(1650 * 695700 / nextSky.sun.distanceKm / 19);
        const sunOpacity = Math.max(0.025, 1 - nextWeather.cloudCover / 105);
        (sunDisc.material as THREE.MeshBasicMaterial).opacity = sunOpacity;
        (sunGlow.material as THREE.SpriteMaterial).opacity = sunOpacity;

        setAtDirection(moonGroup, nextSky.moon.altitude, nextSky.moon.azimuth, 1650);
        moonGroup.visible = nextSky.moon.visible;
        moonMesh.scale.setScalar(1650 * 1737.4 / nextSky.moon.distanceKm / 20);
        const moonDir = directionVector(nextSky.moon.altitude, nextSky.moon.azimuth);
        const sunDir = directionVector(nextSky.sun.altitude, nextSky.sun.azimuth);
        const towardSun = sunDir.clone().multiplyScalar(nextSky.sun.distanceKm).sub(moonDir.clone().multiplyScalar(nextSky.moon.distanceKm)).normalize();
        moonLight.position.copy(moonGroup.position.clone().add(towardSun.clone().multiplyScalar(120)));
        (moonMesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0.025, 1 - nextWeather.cloudCover / 105);
        (moonMesh.material as THREE.MeshStandardMaterial).transparent = true;

        const positions = starGeometry.attributes.position as THREE.BufferAttribute;
        const sizes = starGeometry.attributes.aSize as THREE.BufferAttribute;
        const idToStar = new Map(nextSky.stars.map((star) => [star.id, star]));
        nextSky.stars.forEach((star, index) => {
          const p = directionVector(star.altitude, star.azimuth).multiplyScalar(1770);
          positions.setXYZ(index, p.x, p.y, p.z);
          sizes.setX(index, Math.max(0.75, 3.35 - star.magnitude * 0.78));
        });
        positions.needsUpdate = true;
        sizes.needsUpdate = true;
        starGeometry.setDrawRange(0, nextSky.stars.length);
        const nightVisibility = 1 - THREE.MathUtils.smoothstep(nextSky.sunAltitude, -18, -3);
        const visibilityFactor = THREE.MathUtils.clamp(nextWeather.visibilityKm / 28, 0.1, 1)
          * (1 - nextWeather.cloudCover / 115)
          * (1 - THREE.MathUtils.clamp(nextWeather.haze / 125, 0, 0.85));
        starMaterial.uniforms.uOpacity.value = nightVisibility * visibilityFactor;
        starPoints.visible = flags.stars;

        disposeGroupContents(starLabels);
        if (flags.labels && flags.stars) {
          nextSky.stars.filter((star) => star.altitude > 7 && star.magnitude < 1.35).forEach((star) => {
            const label = makeTextSprite(star.name, '#cbd7e9');
            (label.material as THREE.SpriteMaterial).opacity = nightVisibility * visibilityFactor;
            setAtDirection(label, star.altitude + 1.8, star.azimuth, 1740);
            starLabels.add(label);
          });
        }

        disposeGroupContents(constellationGroup);
        disposeGroupContents(constellationLabels);
        if (flags.constellations) {
          for (const constellation of CONSTELLATIONS) {
            const visibleSegments: THREE.Vector3[] = [];
            const usedStars: THREE.Vector3[] = [];
            for (const [fromId, toId] of constellation.lines) {
              const a = idToStar.get(fromId);
              const b = idToStar.get(toId);
              if (!a || !b) continue;
              const av = directionVector(a.altitude, a.azimuth).multiplyScalar(1760);
              const bv = directionVector(b.altitude, b.azimuth).multiplyScalar(1760);
              visibleSegments.push(av, bv);
              usedStars.push(av, bv);
            }
            if (visibleSegments.length) {
              const geometry = new THREE.BufferGeometry().setFromPoints(visibleSegments);
              const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x7da8d8, transparent: true, opacity: 0.36 * nightVisibility * visibilityFactor, depthWrite: false }));
              constellationGroup.add(lines);
              const midpoint = usedStars.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / usedStars.length).normalize().multiplyScalar(1710);
              const label = makeTextSprite(constellation.name, '#93afd2');
              label.scale.set(150, 30, 1);
              label.position.copy(midpoint);
              label.visible = flags.labels;
              (label.material as THREE.SpriteMaterial).opacity = nightVisibility * visibilityFactor;
              constellationLabels.add(label);
            }
          }
        }
        const snowing = [71, 73, 75, 77, 85, 86].includes(nextWeather.weatherCode);
        rainMaterial.opacity = nextWeather.precipitation > 0.08 ? Math.min(0.72, 0.16 + nextWeather.precipitation * 0.08) : 0;
        rainMaterial.size = snowing ? 0.62 : nextWeather.precipitation > 2 ? 0.25 : 0.15;
        rainMaterial.color.set(snowing ? 0xe5efff : 0xa8c9e9);
      },
      setHeading,
    };
    sceneApi.current = api;
    api.update(sky, weather, { stars: showStars, constellations: showConstellations, labels: showLabels });

    let frame = 0;
    let previous = performance.now();
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      const delta = Math.min(0.08, (now - previous) / 1000);
      previous = now;
      skyUniforms.uTime.value += delta;
      const positions = rainGeometry.attributes.position as THREE.BufferAttribute;
      if (rainMaterial.opacity > 0) {
        for (let i = 0; i < rainCount; i += 1) {
          const snowing = [71, 73, 75, 77, 85, 86].includes(activeWeather.weatherCode);
          const y = positions.getY(i) - delta * (snowing ? 1.4 + activeWeather.windSpeed * 0.035 : 5 + activeWeather.windSpeed * 0.22);
          positions.setY(i, y < -26 ? 36 + random() * 14 : y);
          positions.setX(i, positions.getX(i) + Math.sin(THREE.MathUtils.degToRad(activeWeather.windDirection)) * delta * activeWeather.windSpeed * (snowing ? 0.055 : 0.018));
        }
        positions.needsUpdate = true;
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', pointerDownHandler);
      renderer.domElement.removeEventListener('pointermove', pointerMoveHandler);
      renderer.domElement.removeEventListener('pointerup', pointerUpHandler);
      renderer.domElement.removeEventListener('pointercancel', pointerUpHandler);
      renderer.domElement.removeEventListener('wheel', wheelHandler);
      renderer.domElement.removeEventListener('contextmenu', contextHandler);
      window.removeEventListener('sky-reset-view', resetViewHandler);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => {
            const textured = material as THREE.Material & { map?: THREE.Texture; alphaMap?: THREE.Texture };
            textured.map?.dispose();
            textured.alphaMap?.dispose();
            material.dispose();
          });
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      sceneApi.current = null;
    };
    // Initial scene objects are intentionally created once; mutable input is applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneApi.current?.update(sky, weather, {
      stars: showStars,
      constellations: showConstellations,
      labels: showLabels,
    });
  }, [sky, weather, showStars, showConstellations, showLabels]);

  return <div className="sky-scene" ref={hostRef} aria-label="Interactive three-dimensional sky. Drag to look around and scroll to zoom." />;
}
