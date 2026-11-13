import { createCameraControls } from './cameraControls';
import * as THREE from 'three';
import type { SkyState, Star, WeatherValues } from '../types';
import type { CameraView, Preferences } from '../lib/persistence';
import { createCelestialLayers } from './celestialLayers';
import { seededRandom } from '../lib/random';
import { SKY_VERTEX, SKY_FRAGMENT } from './shaders';
import { directionVector, makeGlowTexture, makeMoonTexture, setAtDirection } from './resources';

export interface RenderInput { sky: SkyState; weather: WeatherValues; showStars: boolean; showConstellations: boolean; showLabels: boolean; initialView?: CameraView; reducedMotion?: boolean; quality?: Preferences['quality'] }
export interface RenderCallbacks { onHeadingChange?: (heading: number) => void; onStarSelect?: (star: Star | null) => void; onCameraChange?: (view: CameraView) => void; onBodySelect?: (body: 'sun' | 'moon') => void }

export function createSkyRenderer(host: HTMLElement, input: RenderInput, callbacks: RenderCallbacks) {
  const { sky, weather, showStars, showConstellations, showLabels } = input;
  const { onHeadingChange, onStarSelect } = callbacks;
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
  const starPositions = new Float32Array(sky.stars.length * 3);
  const starSizes = new Float32Array(sky.stars.length);
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
  starPoints.frustumCulled = false;
  scene.add(starPoints);

  const celestialLayers = createCelestialLayers(scene, sky.stars);

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

  let activeWeather = weather;
  let activeStars = sky.stars;
  let activeShowStars = showStars;
  let reducedMotion = input.reducedMotion;
  const controls = createCameraControls(renderer.domElement, camera, (heading) => onHeadingChange?.(heading), (x, y) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points!.threshold = 15;
    raycaster.setFromCamera(pointer, camera);
    if (sunGroup.visible && raycaster.intersectObject(sunDisc, false).length) { callbacks.onBodySelect?.('sun'); return; }
    if (moonGroup.visible && raycaster.intersectObject(moonMesh, false).length) { callbacks.onBodySelect?.('moon'); return; }
    if (!activeShowStars || starMaterial.uniforms.uOpacity.value < .05) return;
    const index = raycaster.intersectObject(starPoints, false)[0]?.index;
    const star = index === undefined ? undefined : activeStars[index];
    onStarSelect?.(star && star.altitude > 0 ? star : null);
  }, callbacks.onCameraChange, input.initialView);

  const resizeObserver = new ResizeObserver(() => {
    if (!host.clientWidth || !host.clientHeight) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  });
  resizeObserver.observe(host);

  const api = {
    settings: (motion: boolean, quality: Preferences['quality']) => {
      reducedMotion = motion;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 2));
      renderer.setSize(host.clientWidth, host.clientHeight);
    },
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

    celestialLayers.update(nextSky.stars, flags, nightVisibility * visibilityFactor);
    const snowing = [71, 73, 75, 77, 85, 86].includes(nextWeather.weatherCode);
    rainMaterial.opacity = nextWeather.precipitation > 0.08 ? Math.min(0.72, 0.16 + nextWeather.precipitation * 0.08) : 0;
    rainMaterial.size = snowing ? 0.62 : nextWeather.precipitation > 2 ? 0.25 : 0.15;
    rainMaterial.color.set(snowing ? 0xe5efff : 0xa8c9e9);
    },
  };
  api.update(sky, weather, { stars: showStars, constellations: showConstellations, labels: showLabels });
  api.settings(!!input.reducedMotion, input.quality ?? 'auto');

  let frame = 0;
  let previous = performance.now();
  const animate = (now: number) => {
    frame = requestAnimationFrame(animate);
    const delta = reducedMotion ? 0 : Math.min(0.08, (now - previous) / 1000);
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

  const dispose = () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    controls.dispose();
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
  };
  return { ...api, resetView: controls.resetView, focus: controls.focus, zoom: controls.zoom, dispose };
}
export type SkyRenderer = ReturnType<typeof createSkyRenderer>;
