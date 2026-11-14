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
import { aboveHorizon, angularDiameter, findSkyObject } from '../lib/exploration';
import { pickStarAt, starAlpha } from './starPicking';
import { CLOUD_DRIFT_FPS, PRECIPITATION_VISIBLE, weatherMotion } from './weatherMotion';
import {
  limitingMagnitude,
  starIntensity,
  starPointSize,
  twilightVisibility,
  weatherVisibility,
} from '../domain/starVisibility';
import {
  apparentDirection,
  createPlaybackTurn,
  createStarMaterial,
  diurnalTurn,
  setRotationMatrix,
} from './starMaterial';

/** Radius of the sphere the star points are placed on. */
const STAR_DISTANCE = 1770;
/** World distance covering the most refraction lifts a star (about 0.6° at the horizon). */
const REFRACTION_MARGIN = STAR_DISTANCE * Math.sin((0.6 * Math.PI) / 180);
/** Smallest radius of the target ring (.sky-target), and its gap around a zoomed disc. */
const MARKER_RADIUS_PX = 17;
const MARKER_GAP_PX = 8;
/** Real time, in seconds, the sky may keep turning past a tick before it waits for the next one. */
const MAX_EXTRAPOLATION = 0.5;

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
  /** Simulated seconds per real second while time plays; 0 or omitted when it is still. */
  playbackRate?: number;
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

    // Per-star attributes never change for a catalog; only the sphere's rotation does. The first
    // screen can arrive before the catalog, so they are (re)built when it does.
    const starGeometry = new THREE.BufferGeometry();
    let starCount = -1;
    let starVectors = sky.starField.vectors;
    let starPositions = new THREE.BufferAttribute(new Float32Array(0), 3);
    const placeStars = (vectors: Float32Array) => {
      starVectors = vectors;
      for (let i = 0; i < vectors.length; i++) starPositions.array[i] = vectors[i] * STAR_DISTANCE;
      starPositions.needsUpdate = true;
    };
    const starMaterial = createStarMaterial(STAR_DISTANCE, renderer.getPixelRatio());
    const starPoints = new THREE.Points(starGeometry, starMaterial);
    starPoints.frustumCulled = false;
    starPoints.matrixAutoUpdate = false;
    scene.add(starPoints);
    let starIndex = new Map<string, number>();
    let celestialLayers = createCelestialLayers(scene, []);
    const buildStars = (stars: Star[], vectors: Float32Array) => {
      starCount = stars.length;
      const sizes = new Float32Array(starCount);
      const magnitudes = new Float32Array(starCount);
      const intensities = new Float32Array(starCount);
      const colors = new Float32Array(starCount * 3);
      stars.forEach((star, i) => {
        sizes[i] = starPointSize(star.magnitude);
        magnitudes[i] = star.magnitude;
        intensities[i] = starIntensity(star.magnitude);
        const color = new THREE.Color('#bdd6ff').lerp(
          new THREE.Color('#fff0cf'),
          THREE.MathUtils.clamp(((star.colorIndex ?? 0.4) + 0.3) / 1.4, 0, 1),
        );
        if ((star.colorIndex ?? 0) > 1.1)
          color.lerp(new THREE.Color('#ffb378'), THREE.MathUtils.clamp((star.colorIndex! - 1.1) / 1.1, 0, 1));
        color.toArray(colors, i * 3);
      });
      // Release the previous buffers on the GPU; the geometry re-uploads the new ones on next draw.
      starGeometry.dispose();
      starPositions = new THREE.BufferAttribute(new Float32Array(starCount * 3), 3);
      starGeometry.setAttribute('position', starPositions);
      starGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      starGeometry.setAttribute('aMagnitude', new THREE.BufferAttribute(magnitudes, 1));
      starGeometry.setAttribute('aIntensity', new THREE.BufferAttribute(intensities, 1));
      starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      placeStars(vectors);
      starIndex = new Map(stars.map((star, index) => [star.id, index]));
      celestialLayers.dispose();
      celestialLayers = createCelestialLayers(scene, stars);
    };
    buildStars(sky.stars, sky.starField.vectors);

    // During playback the sky turns about the celestial pole between ticks. Every rising and setting
    // thing is placed the way the star shader places stars: turn the geometric direction, then
    // refract. Overlays therefore stay on the points they mark, even low on the horizon.
    const turn = new THREE.Quaternion();
    const turnMatrix = new THREE.Matrix4();
    const starBase = new THREE.Matrix4();
    const playbackTurn = createPlaybackTurn(MAX_EXTRAPOLATION);
    const applyTurn = (seconds: number) => {
      diurnalTurn(activeSky.starField.rotation, seconds, turn);
      starPoints.matrix.multiplyMatrices(turnMatrix.makeRotationFromQuaternion(turn), starBase);
      starPoints.matrixWorldNeedsUpdate = true;
    };
    /** Apparent scene direction of catalog star `index` as drawn now. */
    const starDirection = (index: number, target: THREE.Vector3) =>
      apparentDirection(
        target
          .set(starVectors[index * 3], starVectors[index * 3 + 1], starVectors[index * 3 + 2])
          .applyMatrix4(starPoints.matrix),
      );
    /** Apparent scene direction of the Sun or Moon as drawn now. */
    const bodyDirection = (body: SkyState['sun'], target: THREE.Vector3) =>
      apparentDirection(
        target.copy(directionVector(body.geometricAltitude, body.azimuth)).applyQuaternion(turn),
      );
    const scratch = new THREE.Vector3();

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
    let starLimit = 6;
    const updateAnimation = () => {
      const motion = weatherMotion(activeWeather, !!reducedMotion);
      const animated = motion !== 'none' || (playbackTurn.playing() && !reducedMotion);
      // Playback and drift read as smooth at a capped rate; falling particles keep every frame.
      loop.setAnimated(animated, motion === 'precipitation' ? undefined : CLOUD_DRIFT_FPS);
    };
    const controls = createCameraControls(
      renderer.domElement,
      camera,
      (heading) => onHeadingChange?.(heading),
      (x, y) => {
        // A tap can arrive before the next frame after the view moved (e.g. right after centering an
        // object); pick against the camera as it is now, not as it was last drawn.
        camera.updateMatrixWorld();
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
          (i) => starAlpha(activeStars[i], starLimit) * starMaterial.uniforms.uOpacity.value,
          {
            margin: REFRACTION_MARGIN,
            // Where the star is drawn right now, playback turn and refraction included.
            position: (i, target) => starDirection(i, target).multiplyScalar(STAR_DISTANCE),
          },
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
      /** Simulated seconds per real second while playing; 0 when time is still or following now. */
      playback: (rate: number) => {
        playbackTurn.setRate(rate, performance.now());
        updateAnimation();
        // Stopping between ticks redraws the sky at the displayed instant, not where it had turned to.
        invalidate();
      },
      update: (
        nextSky: SkyState,
        nextWeather: WeatherValues,
        flags: { stars: boolean; constellations: boolean; labels: boolean },
      ) => {
        const ticked = nextSky !== activeSky;
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

        if (nextSky.stars.length !== starCount) buildStars(nextSky.stars, nextSky.starField.vectors);
        else if (nextSky.starField.vectors !== starVectors) placeStars(nextSky.starField.vectors);
        setRotationMatrix(starBase, nextSky.starField.rotation);
        // The new instant already includes the turn shown so far; restart from rest.
        if (ticked) playbackTurn.tick(performance.now());
        applyTurn(0);
        const nightVisibility = twilightVisibility(nextSky.sunAltitude);
        const visibilityFactor = weatherVisibility(nextWeather);
        starLimit = limitingMagnitude(skyBrightness, nextSky.moon);
        starMaterial.uniforms.uLimit.value = starLimit;
        starMaterial.uniforms.uOpacity.value = nightVisibility * visibilityFactor;
        starPoints.visible = flags.stars;

        celestialLayers.update(nextSky.stars, flags, nightVisibility * visibilityFactor);
        const snowing = [71, 73, 75, 77, 85, 86].includes(nextWeather.weatherCode);
        rainMaterial.opacity =
          nextWeather.precipitation > PRECIPITATION_VISIBLE
            ? Math.min(0.72, 0.16 + nextWeather.precipitation * 0.08)
            : 0;
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
      // Recomputed every frame, so a pause or reduced motion can never leave the sky turned.
      applyTurn(playbackTurn.seconds(now, !!reducedMotion));
      sunGroup.position.copy(bodyDirection(activeSky.sun, scratch).multiplyScalar(1650));
      moonGroup.position.copy(bodyDirection(activeSky.moon, scratch).multiplyScalar(1650));
      celestialLayers.place((index, target) =>
        index < starVectors.length / 3 ? starDirection(index, target) : null,
      );
      scene.updateMatrixWorld();
      const target = findSkyObject(activeSky, targetId);
      targetMarker.hidden = true;
      if (target && aboveHorizon(target)) {
        const direction =
          target.kind === 'star'
            ? starDirection(starIndex.get(target.id) ?? 0, scratch)
            : bodyDirection(target, scratch);
        const projected = direction.multiplyScalar(1650).project(camera);
        if (
          projected.z > -1 &&
          projected.z < 1 &&
          Math.abs(projected.x) < 0.94 &&
          Math.abs(projected.y) < 0.88
        ) {
          targetMarker.hidden = false;
          // A zoomed Sun or Moon is circled rather than covered, even when cloud hides the disc.
          const discPx = ((angularDiameter(target) / camera.fov) * host.clientHeight) / 2;
          targetMarker.style.setProperty(
            '--ring',
            `${Math.round(Math.max(MARKER_RADIUS_PX, discPx + MARKER_GAP_PX) * 2)}px`,
          );
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
    api.playback(input.playbackRate ?? 0);
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
