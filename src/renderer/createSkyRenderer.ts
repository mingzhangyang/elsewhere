import { createCameraControls } from './cameraControls';
import * as THREE from 'three';
import type { SkyState, Star, WeatherValues } from '../types';
import type { CameraView, Preferences } from '../lib/persistence';
import { createCelestialLayers } from './celestialLayers';
import { seededRandom } from '../lib/random';
import {
  SKY_VERTEX,
  SKY_FRAGMENT,
  CLOUD_FRAGMENT,
  MOON_VERTEX,
  MOON_FRAGMENT,
  GROUND_FRAGMENT,
} from './shaders';
import { directionVector, makeGlowTexture, setAtDirection } from './resources';
import { advancePrecipitation, windVector } from './precipitation';
import { createFrameLoop } from './frameLoop';
import { adaptiveRatio, percentile, type RenderStats } from './performance';
import { aboveHorizon, findSkyObject } from '../lib/exploration';
import { pickStarAt, starAlpha } from './starPicking';
import { limitingMagnitude, twilightVisibility, weatherVisibility } from '../lib/starVisibility';

/** Radius of the sphere the star points are placed on. */
const STAR_DISTANCE = 1770;

export interface RenderSettings {
  reducedMotion?: boolean;
  quality?: Preferences['quality'];
  horizon?: Preferences['horizon'];
  skyBrightness?: Preferences['skyBrightness'];
}
export interface RenderInput extends RenderSettings {
  sky: SkyState;
  weather: WeatherValues;
  showStars: boolean;
  showConstellations: boolean;
  showLabels: boolean;
  initialView?: CameraView;
  targetId?: string | null;
}
export interface RenderCallbacks {
  onHeadingChange?: (heading: number) => void;
  onStarSelect?: (star: Star | null) => void;
  onCameraChange?: (view: CameraView) => void;
  onBodySelect?: (body: 'sun' | 'moon') => void;
  onAssetError?: (message: string) => void;
  onContextChange?: (lost: boolean) => void;
  onDiagnostics?: (stats: RenderStats) => void;
}

export function createSkyRenderer(host: HTMLElement, input: RenderInput, callbacks: RenderCallbacks) {
  const { sky, weather, showStars, showConstellations, showLabels } = input;
  const { onHeadingChange, onStarSelect } = callbacks;
  const scene = new THREE.Scene();
  let invalidate = () => {};
  let disposed = false;
  const random = seededRandom(18431);
  const camera = new THREE.PerspectiveCamera(66, host.clientWidth / host.clientHeight, 0.1, 5000);
  camera.position.set(0, 0, 0);
  camera.rotation.order = 'YXZ';
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  const releases: (() => void)[] = [
    () => {
      renderer.dispose();
      renderer.domElement.remove();
    },
    () => {
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>(),
        textures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material)
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            materials.add(material);
            const mapped = material as THREE.Material & { map?: THREE.Texture; alphaMap?: THREE.Texture };
            if (mapped.map) textures.add(mapped.map);
            if (mapped.alphaMap) textures.add(mapped.alphaMap);
          }
      });
      for (const item of [...textures, ...materials, ...geometries]) item.dispose();
    },
  ];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const release of releases.reverse()) release();
  };
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    host.appendChild(renderer.domElement);
    const targetMarker = document.createElement('div');
    targetMarker.className = 'sky-target';
    targetMarker.hidden = true;
    targetMarker.setAttribute('aria-hidden', 'true');
    const targetLabel = document.createElement('span');
    targetMarker.appendChild(targetLabel);
    host.appendChild(targetMarker);
    releases.push(() => targetMarker.remove());
    let targetId = input.targetId ?? null;

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
    const cloudDome = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 48, 32),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: CLOUD_FRAGMENT,
        uniforms: skyUniforms,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    cloudDome.renderOrder = 20;
    scene.add(cloudDome);

    const groundMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: GROUND_FRAGMENT,
      uniforms: skyUniforms,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(
      new THREE.SphereGeometry(1450, 80, 40, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      groundMaterial,
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
      const topY = Math.max(4, Math.min(38, wave + 18));
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
    const ridge = new THREE.Mesh(ridgeGeometry, groundMaterial);
    scene.add(ridge);

    const sunGroup = new THREE.Group();
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(19, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe3a8, transparent: true, depthWrite: false }),
    );
    const sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        color: 0xffd39a,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sunGlow.scale.set(170, 170, 1);
    sunGroup.add(sunGlow, sunDisc);
    scene.add(sunGroup);

    const moonGroup = new THREE.Group();
    const moonTexture = new THREE.TextureLoader().load(
      import.meta.env.BASE_URL + 'assets/moon-lroc.jpg',
      (texture) => {
        if (disposed) texture.dispose();
        else invalidate();
      },
      undefined,
      () => {
        if (!disposed)
          callbacks.onAssetError?.(
            'The Moon surface map could not load. Positions and phase remain available.',
          );
      },
    );
    moonTexture.colorSpace = THREE.SRGBColorSpace;
    releases.push(() => moonTexture.dispose());
    const moonUniforms = {
      ...skyUniforms,
      uMap: { value: moonTexture },
      uMoonSunDirection: { value: new THREE.Vector3() },
    };
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(20, 64, 48),
      new THREE.ShaderMaterial({
        vertexShader: MOON_VERTEX,
        fragmentShader: MOON_FRAGMENT,
        uniforms: moonUniforms,
      }),
    );
    moonGroup.add(moonMesh);
    scene.add(moonGroup);

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(sky.stars.length * 3);
    const starSizes = new Float32Array(sky.stars.length);
    const starColors = new Float32Array(sky.stars.length * 3);
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    starGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(sky.stars.length), 1));
    sky.stars.forEach((star, i) => {
      const color = new THREE.Color('#bdd6ff').lerp(
        new THREE.Color('#fff0cf'),
        THREE.MathUtils.clamp(((star.colorIndex ?? 0.4) + 0.3) / 1.4, 0, 1),
      );
      if ((star.colorIndex ?? 0) > 1.1)
        color.lerp(new THREE.Color('#ffb378'), THREE.MathUtils.clamp((star.colorIndex! - 1.1) / 1.1, 0, 1));
      color.toArray(starColors, i * 3);
    });
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 1 },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: `
    attribute float aSize;
    attribute float aAlpha;
    varying vec3 vColor;
    varying float vAlpha;
    uniform float uPixelRatio;
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = aSize * uPixelRatio;
      vColor = color;
      vAlpha = aAlpha;
    }
    `,
      fragmentShader: `
    uniform float uOpacity;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec2 p = gl_PointCoord - vec2(0.5);
      float r = length(p);
      if (r > 0.5) discard;
      float alpha = (1.0 - smoothstep(0.12, 0.5, r)) * uOpacity * vAlpha;
      gl_FragColor = vec4(vColor, alpha);
    }
    `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
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
    const rainMaterial = new THREE.PointsMaterial({
      color: 0xa8c9e9,
      size: 0.16,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    const rainPoints = new THREE.Points(rainGeometry, rainMaterial);
    rainPoints.renderOrder = 30; // Foreground precipitation is in front of the cloud layer.
    camera.add(rainPoints);
    scene.add(camera);

    let activeWeather = weather;
    let activeSky = sky;
    let activeStars = sky.stars;
    let activeShowStars = showStars;
    let reducedMotion = input.reducedMotion;
    let skyBrightness = input.skyBrightness ?? 'dark';
    let quality = input.quality ?? 'auto';
    let contextLost = false;
    const updateAnimation = () =>
      loop.setAnimated(
        !reducedMotion &&
          ((activeWeather.cloudCover > 0 && activeWeather.windSpeed > 0) ||
            activeWeather.precipitation > 0.08),
      );
    const controls = createCameraControls(
      renderer.domElement,
      camera,
      (heading) => onHeadingChange?.(heading),
      (x, y) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const pointer = new THREE.Vector2(
          ((x - rect.left) / rect.width) * 2 - 1,
          (-(y - rect.top) / rect.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        if (sunGroup.visible && raycaster.intersectObject(sunDisc, false).length) {
          callbacks.onBodySelect?.('sun');
          return;
        }
        if (moonGroup.visible && raycaster.intersectObject(moonMesh, false).length) {
          callbacks.onBodySelect?.('moon');
          return;
        }
        if (!activeShowStars || starMaterial.uniforms.uOpacity.value < 0.05) return;
        const index = pickStarAt(
          starPoints,
          camera,
          x,
          y,
          rect,
          STAR_DISTANCE,
          (i) => starGeometry.attributes.aAlpha.getX(i) * starMaterial.uniforms.uOpacity.value,
        );
        const star = index === undefined ? undefined : activeStars[index];
        onStarSelect?.(star && star.altitude > 0 ? star : null);
      },
      (view) => {
        callbacks.onCameraChange?.(view);
        invalidate();
      },
      input.initialView,
    );

    releases.push(() => controls.dispose());
    const resizeObserver = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
      invalidate();
    });
    resizeObserver.observe(host);
    releases.push(() => resizeObserver.disconnect());

    const api = {
      target: (id: string | null) => {
        targetId = id;
        invalidate();
      },
      settings: (settings: RenderSettings) => {
        reducedMotion = settings.reducedMotion;
        skyBrightness = settings.skyBrightness ?? 'dark';
        ridge.visible = settings.horizon !== 'flat';
        quality = settings.quality ?? 'auto';
        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : quality === 'auto' ? 1.5 : 2),
        );
        renderer.setSize(host.clientWidth, host.clientHeight);
        starMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
        api.update(activeSky, activeWeather, activeFlags);
      },
      update: (
        nextSky: SkyState,
        nextWeather: WeatherValues,
        flags: { stars: boolean; constellations: boolean; labels: boolean },
      ) => {
        activeStars = nextSky.stars;
        activeSky = nextSky;
        activeFlags = flags;
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
        sunDisc.scale.setScalar((1650 * 695700) / nextSky.sun.distanceKm / 19);
        const sunOpacity = 1 - THREE.MathUtils.clamp(nextWeather.haze / 140, 0, 0.7);
        (sunDisc.material as THREE.MeshBasicMaterial).opacity = sunOpacity;
        (sunGlow.material as THREE.SpriteMaterial).opacity = sunOpacity;

        setAtDirection(moonGroup, nextSky.moon.altitude, nextSky.moon.azimuth, 1650);
        moonGroup.visible = nextSky.moon.visible;
        moonMesh.scale.setScalar((1650 * 1737.4) / nextSky.moon.distanceKm / 20);
        const north = new THREE.Vector3(...nextSky.moon.north),
          prime = new THREE.Vector3(...nextSky.moon.prime);
        moonMesh.quaternion.setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(prime, north, prime.clone().cross(north)),
        );
        const moonDir = directionVector(nextSky.moon.altitude, nextSky.moon.azimuth);
        const sunDir = directionVector(nextSky.sun.altitude, nextSky.sun.azimuth);
        const towardSun = sunDir
          .clone()
          .multiplyScalar(nextSky.sun.distanceKm)
          .sub(moonDir.clone().multiplyScalar(nextSky.moon.distanceKm))
          .normalize();
        moonUniforms.uMoonSunDirection.value.copy(towardSun);

        const positions = starGeometry.attributes.position as THREE.BufferAttribute;
        const sizes = starGeometry.attributes.aSize as THREE.BufferAttribute;
        nextSky.stars.forEach((star, index) => {
          const p = directionVector(star.altitude, star.azimuth).multiplyScalar(STAR_DISTANCE);
          positions.setXYZ(index, p.x, p.y, p.z);
          sizes.setX(index, Math.max(1.35, 4.1 - star.magnitude * 0.5));
        });
        positions.needsUpdate = true;
        sizes.needsUpdate = true;
        starGeometry.setDrawRange(0, nextSky.stars.length);
        const nightVisibility = twilightVisibility(nextSky.sunAltitude);
        const visibilityFactor = weatherVisibility(nextWeather);
        const limit = limitingMagnitude(skyBrightness, nextSky.moon);
        const alphas = starGeometry.attributes.aAlpha as THREE.BufferAttribute;
        nextSky.stars.forEach((star, index) => alphas.setX(index, starAlpha(star, limit)));
        alphas.needsUpdate = true;
        starMaterial.uniforms.uOpacity.value = nightVisibility * visibilityFactor;
        starPoints.visible = flags.stars;

        celestialLayers.update(nextSky.stars, flags, nightVisibility * visibilityFactor);
        const snowing = [71, 73, 75, 77, 85, 86].includes(nextWeather.weatherCode);
        rainMaterial.opacity =
          nextWeather.precipitation > 0.08 ? Math.min(0.72, 0.16 + nextWeather.precipitation * 0.08) : 0;
        rainMaterial.size = snowing ? 0.62 : nextWeather.precipitation > 2 ? 0.25 : 0.15;
        rainMaterial.color.set(snowing ? 0xe5efff : 0xa8c9e9);
        cloudDome.visible = nextWeather.cloudCover > 0;
        updateAnimation();
        invalidate();
      },
    };
    let activeFlags = { stars: showStars, constellations: showConstellations, labels: showLabels };

    let previous = 0,
      frames = 0,
      reported = 0,
      adapted = 0;
    const frameTimes: number[] = [],
      drawTimes: number[] = [];
    const loop = createFrameLoop((now, elapsed, continuous) => {
      const start = performance.now();
      const delta = reducedMotion ? 0 : elapsed;
      if (continuous && previous) {
        frameTimes.push(now - previous);
        if (frameTimes.length > 240) frameTimes.shift();
      }
      previous = now;
      frames++;
      skyUniforms.uTime.value += delta;
      if (rainMaterial.opacity > 0 && delta) {
        const wind = windVector(activeWeather.windSpeed * 0.06, activeWeather.windDirection).applyQuaternion(
          camera.quaternion.clone().invert(),
        );
        advancePrecipitation(
          rainGeometry.attributes.position as THREE.BufferAttribute,
          delta,
          wind,
          [71, 73, 75, 77, 85, 86].includes(activeWeather.weatherCode),
        );
      }
      camera.updateMatrixWorld();
      const target = findSkyObject(activeSky, targetId);
      targetMarker.hidden = true;
      if (target && aboveHorizon(target)) {
        const projected = directionVector(target.altitude, target.azimuth)
          .multiplyScalar(1650)
          .project(camera);
        if (
          projected.z > -1 &&
          projected.z < 1 &&
          Math.abs(projected.x) < 0.94 &&
          Math.abs(projected.y) < 0.88
        ) {
          targetMarker.hidden = false;
          targetMarker.style.left = `${(projected.x + 1) * 50}%`;
          targetMarker.style.top = `${(1 - projected.y) * 50}%`;
          targetLabel.textContent = `${target.name} · position`;
        }
      }
      celestialLayers.layout(camera, host.clientWidth, host.clientHeight);
      renderer.render(scene, camera);
      drawTimes.push(performance.now() - start);
      if (drawTimes.length > 240) drawTimes.shift();
      if (quality === 'auto' && frameTimes.length >= 120 && now - adapted > 10000) {
        const next = adaptiveRatio(
          renderer.getPixelRatio(),
          percentile(frameTimes, 0.95),
          Math.min(window.devicePixelRatio || 1, 1.5),
        );
        if (next !== renderer.getPixelRatio()) {
          renderer.setPixelRatio(next);
          starMaterial.uniforms.uPixelRatio.value = next;
        }
        adapted = now;
        frameTimes.length = 0;
      }
      if (callbacks.onDiagnostics && now - reported > 2000) {
        callbacks.onDiagnostics({
          frames,
          frameP95: percentile(frameTimes, 0.95),
          drawP95: percentile(drawTimes, 0.95),
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          calls: renderer.info.render.calls,
          pixelRatio: renderer.getPixelRatio(),
        });
        reported = now;
      }
    });
    releases.push(() => loop.dispose());
    invalidate = loop.invalidate;
    const visibility = () => loop.setSuspended(document.hidden || contextLost);
    const lost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      visibility();
      callbacks.onContextChange?.(true);
    };
    const restored = () => {
      contextLost = false;
      previous = 0;
      visibility();
      callbacks.onContextChange?.(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    renderer.domElement.addEventListener('webglcontextrestored', restored);
    document.addEventListener('visibilitychange', visibility);
    releases.push(() => {
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('webglcontextrestored', restored);
    });
    api.settings(input);
    visibility();

    return {
      ...api,
      resetView: controls.resetView,
      focus: controls.focus,
      zoom: controls.zoom,
      simulateContextLoss: () => {
        if (import.meta.env.DEV) renderer.forceContextLoss();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
export type SkyRenderer = ReturnType<typeof createSkyRenderer>;
