import { createCameraControls } from './cameraControls';
import * as THREE from 'three';
import type { BodyId, Planet, PlanetId, SkyState, Star, WeatherValues } from '../types';
import type { PatternId } from '../domain/stars';
import { PLANETS } from '../domain/planets';
import type { CameraView, Preferences } from '../lib/persistence';
import { createCelestialLayers, type ScreenBox } from './celestialLayers';
import { seededRandom } from '../lib/random';
// Bundled through Vite so its URL carries a content hash and can be cached as immutable.
import moonMapUrl from '../assets/moon-lroc.jpg?url';
import {
  SKY_VERTEX,
  SKY_FRAGMENT,
  CLOUD_FRAGMENT,
  MOON_VERTEX,
  MOON_FRAGMENT,
  GROUND_FRAGMENT,
  moonDisplayScale,
  moonScreenDiameterPx,
  moonTextureDetail,
} from './shaders';
import { directionVector, makeGlowTexture, setAtDirection } from './resources';
import { RIDGE_RADIUS, ridgeHeight } from './ridge';
import { advancePrecipitation, windVector } from './precipitation';
import { createFrameLoop } from './frameLoop';
import { adaptiveRatio, percentile, type RenderStats } from './performance';
import { aboveHorizon, angularDiameter, findSkyObject, type SkyObject } from '../lib/exploration';
import { betterDiscHit, betterHit, pickDiscAt, pickPointAt, starAlpha, type PickHit } from './starPicking';
import { CLOUD_DRIFT_FPS, PRECIPITATION_VISIBLE, weatherMotion } from './weatherMotion';
import {
  limitingMagnitude,
  milkyWayVisibility,
  planetTwilightVisibility,
  starGlow,
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
import { createMilkyWay } from './milkyWay';

/** Radius of the sphere the star points are placed on. */
const STAR_DISTANCE = 1770;
/** The Milky Way's glow lies behind the stars, inside the sky dome. */
const MILKY_WAY_DISTANCE = 2000;
/** Planets are drawn just inside the star sphere, through the same point shader. */
const PLANET_DISTANCE = 1760;
/** Display tints, in PLANETS order: illustrative, chosen to tell the planets apart. */
const PLANET_COLORS = ['#e6d6c6', '#fff6e2', '#ffa57a', '#ffe8c6', '#f3dca2'];
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
  /** Wide-view visual aid only; astronomical sizes and texture detail remain physical. */
  moonDisplayAid?: boolean;
}
/** Text the renderer shows, in the interface language. */
export interface SkyLabels {
  /** The canvas's accessible name. */
  canvas: string;
  planet: (id: PlanetId) => string;
  star: (star: Star) => string;
  pattern: (id: PatternId) => string;
  /** Beside the target marker, e.g. "Jupiter · position". */
  target: (object: SkyObject) => string;
}
export interface RenderInput extends RenderSettings {
  sky: SkyState;
  labels: SkyLabels;
  weather: WeatherValues;
  showStars: boolean;
  showConstellations: boolean;
  showLabels: boolean;
  initialView?: CameraView;
  targetId?: string | null;
  /** Simulated seconds per real second while time plays; 0 or omitted when it is still. */
  playbackRate?: number;
}
/**
 * Optional image-only weather override. Capture restores the on-screen weather
 * before returning, so the postcard cannot change exploration or shared links.
 */
export interface SkyCaptureOptions {
  ridge: boolean;
  weather?: WeatherValues;
}
/** One frame of the sky, captured for a sky-moment image. */
export interface SkyCapture {
  /** The sky as drawn, at the canvas's pixel size, labels included. */
  image: HTMLCanvasElement;
  /**
   * The target marker (HTML over the canvas, so not in `image`): its center as fractions of the
   * width and height, its ring radius as a fraction of the height, and its label.
   */
  target: { x: number; y: number; radius: number; label: string } | null;
}
export interface RenderCallbacks {
  onHeadingChange?: (heading: number) => void;
  onStarSelect?: (star: Star | null) => void;
  onCameraChange?: (view: CameraView) => void;
  onBodySelect?: (body: BodyId) => void;
  onAssetError?: (asset: 'moon-map') => void;
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
      const radius = RIDGE_RADIUS;
      const topY = ridgeHeight(angle);
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
      moonMapUrl,
      (texture) => {
        if (disposed) texture.dispose();
        else invalidate();
      },
      undefined,
      () => {
        if (!disposed) callbacks.onAssetError?.('moon-map');
      },
    );
    moonTexture.colorSpace = THREE.SRGBColorSpace;
    releases.push(() => moonTexture.dispose());
    const moonUniforms = {
      ...skyUniforms,
      uMap: { value: moonTexture },
      uMoonSunDirection: { value: new THREE.Vector3() },
      uMoonDetail: { value: 0 },
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
    const milkyWay = createMilkyWay(MILKY_WAY_DISTANCE);
    scene.add(milkyWay.mesh);
    let starIndex = new Map<string, number>();
    let labels = input.labels;
    const layersFor = (stars: Star[]) =>
      createCelestialLayers(
        scene,
        stars,
        undefined,
        PLANETS.map((planet) => ({ id: planet.id, name: labels.planet(planet.id) })),
        labels,
      );
    let celestialLayers = layersFor([]);
    let labelledStars: Star[] = [];
    const buildStars = (stars: Star[], vectors: Float32Array) => {
      starCount = stars.length;
      const sizes = new Float32Array(starCount);
      const magnitudes = new Float32Array(starCount);
      const intensities = new Float32Array(starCount);
      const glows = new Float32Array(starCount);
      const colors = new Float32Array(starCount * 3);
      stars.forEach((star, i) => {
        sizes[i] = starPointSize(star.magnitude);
        magnitudes[i] = star.magnitude;
        intensities[i] = starIntensity(star.magnitude);
        glows[i] = starGlow(star.magnitude);
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
      starGeometry.setAttribute('aGlow', new THREE.BufferAttribute(glows, 1));
      starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      placeStars(vectors);
      starIndex = new Map(stars.map((star, index) => [star.id, index]));
      celestialLayers.dispose();
      labelledStars = stars;
      celestialLayers = layersFor(stars);
    };
    buildStars(sky.stars, sky.starField.vectors);

    // Five planets through the star shader, so refraction, extinction and the limiting magnitude
    // treat them exactly like stars. Their own twilight fade is folded into the intensity attribute.
    const planetGeometry = new THREE.BufferGeometry();
    const planetCount = PLANETS.length;
    const planetPositions = new THREE.BufferAttribute(new Float32Array(planetCount * 3), 3);
    const planetSizes = new THREE.BufferAttribute(new Float32Array(planetCount), 1);
    const planetMagnitudes = new THREE.BufferAttribute(new Float32Array(planetCount), 1);
    const planetIntensities = new THREE.BufferAttribute(new Float32Array(planetCount), 1);
    const planetGlows = new THREE.BufferAttribute(new Float32Array(planetCount), 1);
    const planetColors = new Float32Array(planetCount * 3);
    PLANET_COLORS.forEach((color, i) => new THREE.Color(color).toArray(planetColors, i * 3));
    planetGeometry.setAttribute('position', planetPositions);
    planetGeometry.setAttribute('aSize', planetSizes);
    planetGeometry.setAttribute('aMagnitude', planetMagnitudes);
    planetGeometry.setAttribute('aIntensity', planetIntensities);
    planetGeometry.setAttribute('aGlow', planetGlows);
    planetGeometry.setAttribute('color', new THREE.BufferAttribute(planetColors, 3));
    const planetMaterial = createStarMaterial(PLANET_DISTANCE, renderer.getPixelRatio());
    const planetPoints = new THREE.Points(planetGeometry, planetMaterial);
    planetPoints.frustumCulled = false;
    planetPoints.matrixAutoUpdate = false;
    scene.add(planetPoints);
    /** Drawn share (0–1) of each planet's point, before weather: what labels and taps follow. */
    let planetAlphas = new Array<number>(planetCount).fill(0);

    // During playback the sky turns about the celestial pole between ticks. Every rising and setting
    // thing is placed the way the star shader places stars: turn the geometric direction, then
    // refract. Overlays therefore stay on the points they mark, even low on the horizon.
    const turn = new THREE.Quaternion();
    const turnMatrix = new THREE.Matrix4();
    const starBase = new THREE.Matrix4();
    const milkyWayPrecession = new THREE.Matrix4();
    const playbackTurn = createPlaybackTurn(MAX_EXTRAPOLATION);
    const applyTurn = (seconds: number) => {
      diurnalTurn(activeSky.starField.rotation, seconds, turn);
      starPoints.matrix.multiplyMatrices(turnMatrix.makeRotationFromQuaternion(turn), starBase);
      starPoints.matrixWorldNeedsUpdate = true;
      // The shader samples J2000 directions. Precess the sphere to the same date-frame
      // as the catalog, then apply the same local sidereal/playback turn as the stars.
      milkyWay.mesh.matrix.multiplyMatrices(starPoints.matrix, milkyWayPrecession);
      milkyWay.mesh.matrixWorldNeedsUpdate = true;
      // Planets are placed in horizontal coordinates; between ticks they turn with the sky.
      planetPoints.matrix.copy(turnMatrix);
      planetPoints.matrixWorldNeedsUpdate = true;
    };
    /** Apparent scene direction of catalog star `index` as drawn now. */
    const starDirection = (index: number, target: THREE.Vector3) =>
      apparentDirection(
        target
          .set(starVectors[index * 3], starVectors[index * 3 + 1], starVectors[index * 3 + 2])
          .applyMatrix4(starPoints.matrix),
      );
    /** Apparent scene direction of the Sun, Moon or a planet as drawn now. */
    const bodyDirection = (
      body: Pick<SkyState['sun'], 'geometricAltitude' | 'azimuth'>,
      target: THREE.Vector3,
    ) =>
      apparentDirection(
        target.copy(directionVector(body.geometricAltitude, body.azimuth)).applyQuaternion(turn),
      );
    const scratch = new THREE.Vector3();
    /**
     * Screen boxes, in host pixels, of interface elements drawn over the sky (marked
     * `data-occludes-sky`), so labels are not hidden beneath them. Read before this frame writes
     * any styles, so measuring does not force an extra layout.
     */
    const occluders = (): ScreenBox[] => {
      const origin = host.getBoundingClientRect();
      const boxes: ScreenBox[] = [];
      for (const element of document.querySelectorAll('[data-occludes-sky]')) {
        const r = element.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        boxes.push({
          left: r.left - origin.left,
          right: r.right - origin.left,
          top: r.top - origin.top,
          bottom: r.bottom - origin.top,
        });
      }
      return boxes;
    };

    /**
     * Writes each planet's geometric direction, size and brightness, and returns its drawn share
     * (magnitude against the limit, display intensity and its own twilight fade) for labels and taps.
     */
    const placePlanets = (planets: Planet[], sunAltitude: number) =>
      planets.map((planet, i) => {
        const direction = directionVector(planet.geometricAltitude, planet.azimuth).multiplyScalar(
          PLANET_DISTANCE,
        );
        planetPositions.setXYZ(i, direction.x, direction.y, direction.z);
        planetSizes.setX(i, starPointSize(planet.magnitude));
        planetMagnitudes.setX(i, planet.magnitude);
        const twilight = planetTwilightVisibility(sunAltitude, planet.magnitude);
        planetIntensities.setX(i, starIntensity(planet.magnitude) * twilight);
        planetGlows.setX(i, starGlow(planet.magnitude));
        for (const attribute of [
          planetPositions,
          planetSizes,
          planetMagnitudes,
          planetIntensities,
          planetGlows,
        ])
          attribute.needsUpdate = true;
        return planet.visible ? starAlpha(planet, starLimit) * twilight : 0;
      });

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
    let moonDisplayAid = input.moonDisplayAid ?? true;
    // The camera can change every animation frame. Keep the actual Moon's
    // geometry, picking area and displayed size in step with its current FOV.
    // Texture detail follows the *physical* projection, not the boosted disc.
    const syncMoonDisplay = () => {
      const physicalDiameter = moonScreenDiameterPx(activeSky.moon.distanceKm, host.clientHeight, camera.fov);
      const displayScale = moonDisplayAid ? moonDisplayScale(physicalDiameter) : 1;
      moonMesh.scale.setScalar(((1650 * 1737.4) / activeSky.moon.distanceKm / 20) * displayScale);
      moonUniforms.uMoonDetail.value = moonTextureDetail(physicalDiameter);
      return physicalDiameter * displayScale;
    };
    let activeStars = sky.stars;
    let activeShowStars = showStars;
    let reducedMotion = input.reducedMotion;
    let skyBrightness = input.skyBrightness ?? 'dark';
    let quality = input.quality ?? 'auto';
    /** Fewer layers of noise for the Milky Way's structure on the low quality setting. */
    const milkyWayOctaves = () => (quality === 'low' ? 3 : 5);
    milkyWay.material.uniforms.uOctaves.value = milkyWayOctaves();
    let contextLost = false;
    let starLimit = 6;
    /** A shared link's camera turn toward its subject, in progress (see `turnTo`). */
    let arrival: { from: CameraView; to: CameraView; start: number; duration: number } | null = null;
    const updateAnimation = () => {
      const motion = weatherMotion(activeWeather, !!reducedMotion);
      const animated = motion !== 'none' || (playbackTurn.playing() && !reducedMotion) || !!arrival;
      // Playback and drift read as smooth at a capped rate; falling particles and the turn keep every frame.
      loop.setAnimated(animated, motion === 'precipitation' || arrival ? undefined : CLOUD_DRIFT_FPS);
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
        // An approximately 8px wide-view Moon is too small to tap by ray/mesh intersection.
        // Include it in the same screen-distance arbitration as stars and planets.
        const moonHit = moonGroup.visible
          ? pickDiscAt(moonGroup.position, camera, x, y, rect, syncMoonDisplay())
          : undefined;
        // Planets and stars compete on screen distance, so a star beside a planet stays selectable.
        const planetOpacity = planetMaterial.uniforms.uOpacity.value;
        const planetHit = pickPointAt(
          planetPoints,
          camera,
          x,
          y,
          rect,
          PLANET_DISTANCE,
          (i) => (activeSky.planets[i]?.visible ? planetAlphas[i] * planetOpacity : 0),
          {
            margin: REFRACTION_MARGIN,
            position: (i, target) =>
              bodyDirection(activeSky.planets[i], target).multiplyScalar(PLANET_DISTANCE),
          },
        );
        const starOpacity = starMaterial.uniforms.uOpacity.value;
        const starHit =
          activeShowStars && starOpacity >= 0.05
            ? pickPointAt(
                starPoints,
                camera,
                x,
                y,
                rect,
                STAR_DISTANCE,
                (i) => (activeStars[i].altitude > 0 ? starAlpha(activeStars[i], starLimit) * starOpacity : 0),
                {
                  margin: REFRACTION_MARGIN,
                  // Where the star is drawn right now, playback turn and refraction included.
                  position: (i, target) => starDirection(i, target).multiplyScalar(STAR_DISTANCE),
                },
              )
            : undefined;
        type ObjectHit = PickHit & { kind: 'moon' | 'planet' | 'star' };
        const pointHit = betterHit<ObjectHit>(
          planetHit && { ...planetHit, kind: 'planet' },
          starHit && { ...starHit, kind: 'star' },
        );
        // Direct taps on the foreground lunar disc win. Outside the disc, its touch
        // tolerance competes on center distance with stars and planets.
        const hit = betterDiscHit<ObjectHit>(moonHit && { ...moonHit, kind: 'moon' }, pointHit);
        if (hit?.kind === 'moon') {
          callbacks.onBodySelect?.('moon');
          return;
        }
        if (hit?.kind === 'planet') {
          callbacks.onBodySelect?.(activeSky.planets[hit.index].id);
          return;
        }
        onStarSelect?.(hit ? activeStars[hit.index] : null);
      },
      (view) => {
        callbacks.onCameraChange?.(view);
        invalidate();
      },
      input.initialView,
      input.labels.canvas,
    );

    releases.push(() => controls.dispose());
    // Any look, zoom or key press of the visitor's own ends a turn in progress.
    const interrupt = () => {
      if (!arrival) return;
      arrival = null;
      updateAnimation();
    };
    for (const type of ['pointerdown', 'wheel', 'keydown'])
      renderer.domElement.addEventListener(type, interrupt, { capture: true });
    releases.push(() => {
      for (const type of ['pointerdown', 'wheel', 'keydown'])
        renderer.domElement.removeEventListener(type, interrupt, { capture: true });
    });
    /** The camera's view as the controls set it. */
    const currentView = (): CameraView => ({
      heading: ((((-camera.rotation.y * 180) / Math.PI) % 360) + 360) % 360,
      altitude: THREE.MathUtils.radToDeg(camera.rotation.x),
      fov: camera.fov,
    });
    /** Eases the camera from the turn's start to its end; true while it is still turning. */
    const stepArrival = (now: number) => {
      if (!arrival) return false;
      const { from, to, start, duration } = arrival;
      const t = THREE.MathUtils.clamp((now - start) / duration, 0, 1);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      // The shorter way round.
      const dHeading = ((((to.heading - from.heading) % 360) + 540) % 360) - 180;
      controls.focus(
        from.altitude + (to.altitude - from.altitude) * e,
        (((from.heading + dHeading * e) % 360) + 360) % 360,
        from.fov + (to.fov - from.fov) * e,
      );
      if (t >= 1) {
        arrival = null;
        updateAnimation();
      }
      return true;
    };
    let lastTarget: SkyCapture['target'] = null;
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
      /**
       * New label text (a language change): the label textures are drawn again and the old ones
       * released. Callers wait for the label font first (labelFontReady).
       */
      labels: (next: SkyLabels) => {
        labels = next;
        renderer.domElement.setAttribute('aria-label', next.canvas);
        celestialLayers.dispose();
        celestialLayers = layersFor(labelledStars);
        api.update(activeSky, activeWeather, activeFlags);
      },
      /**
       * Turns the camera from where it is to `view` over `duration` ms; a shared link opening on its
       * subject. The visitor's own look, zoom or key press stops it.
       */
      turnTo: (view: CameraView, duration: number) => {
        arrival = { from: currentView(), to: view, start: performance.now(), duration };
        updateAnimation();
      },
      /**
       * Draws one frame now and copies it before the browser clears the drawing buffer (the renderer
       * does not keep it). Labels are laid out ignoring the interface over the sky, which the image
       * does not show. `ridge` draws the illustrative ridge for this frame whatever the setting.
       */
      capture: ({ ridge: withRidge, weather: imageWeather }: SkyCaptureOptions): SkyCapture => {
        const shown = ridge.visible;
        const onScreenWeather = activeWeather;
        try {
          // The caller's cloud-free preview is strictly temporary, for this frame only.
          if (imageWeather) api.update(activeSky, imageWeather, activeFlags);
          ridge.visible = withRidge;
          drawFrame(performance.now(), 0, false, true);
          const image = document.createElement('canvas');
          image.width = renderer.domElement.width;
          image.height = renderer.domElement.height;
          image.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
          return { image, target: lastTarget };
        } finally {
          ridge.visible = shown;
          if (imageWeather) api.update(activeSky, onScreenWeather, activeFlags);
          invalidate();
        }
      },
      target: (id: string | null) => {
        targetId = id;
        invalidate();
      },
      settings: (settings: RenderSettings) => {
        reducedMotion = settings.reducedMotion;
        skyBrightness = settings.skyBrightness ?? 'dark';
        moonDisplayAid = settings.moonDisplayAid ?? true;
        ridge.visible = settings.horizon !== 'flat';
        quality = settings.quality ?? 'auto';
        milkyWay.material.uniforms.uOctaves.value = milkyWayOctaves();
        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : quality === 'auto' ? 1.5 : 2),
        );
        renderer.setSize(host.clientWidth, host.clientHeight);
        starMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
        planetMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
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
        syncMoonDisplay();
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
        setRotationMatrix(milkyWayPrecession, nextSky.starField.precession);
        // The new instant already includes the turn shown so far; restart from rest.
        if (ticked) playbackTurn.tick(performance.now());
        applyTurn(0);
        const nightVisibility = twilightVisibility(nextSky.sunAltitude);
        const visibilityFactor = weatherVisibility(nextWeather);
        starLimit = limitingMagnitude(skyBrightness, nextSky.moon);
        starMaterial.uniforms.uLimit.value = starLimit;
        starMaterial.uniforms.uOpacity.value = nightVisibility * visibilityFactor;
        starPoints.visible = flags.stars;
        const milkyWayShare = milkyWayVisibility(starLimit, nextSky.sunAltitude) * visibilityFactor;
        milkyWay.material.uniforms.uIntensity.value = milkyWayShare;
        milkyWay.mesh.visible = flags.stars && milkyWayShare > 0;
        planetAlphas = placePlanets(nextSky.planets, nextSky.sunAltitude);
        planetMaterial.uniforms.uLimit.value = starLimit;
        planetMaterial.uniforms.uOpacity.value = visibilityFactor;

        celestialLayers.update(
          nextSky.stars,
          flags,
          nightVisibility * visibilityFactor,
          nextSky.planets.map((planet, i) => ({
            altitude: planet.altitude,
            azimuth: planet.azimuth,
            opacity: planetAlphas[i] * visibilityFactor,
          })),
        );
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
    const drawFrame = (now: number, elapsed: number, continuous: boolean, capturing = false) => {
      const start = performance.now();
      stepArrival(now);
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
      const blocked = capturing ? [] : occluders();
      // Recomputed every frame, so a pause or reduced motion can never leave the sky turned.
      applyTurn(playbackTurn.seconds(now, !!reducedMotion));
      sunGroup.position.copy(bodyDirection(activeSky.sun, scratch).multiplyScalar(1650));
      moonGroup.position.copy(bodyDirection(activeSky.moon, scratch).multiplyScalar(1650));
      const displayedMoonDiameter = syncMoonDisplay();
      celestialLayers.place(
        (index, target) => (index < starVectors.length / 3 ? starDirection(index, target) : null),
        (index, target) => {
          const planet = activeSky.planets[index];
          return planet ? bodyDirection(planet, target) : null;
        },
      );
      scene.updateMatrixWorld();
      const target = findSkyObject(activeSky, targetId);
      targetMarker.hidden = true;
      lastTarget = null;
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
          const discPx =
            target.kind === 'moon'
              ? displayedMoonDiameter / 2
              : ((angularDiameter(target) / camera.fov) * host.clientHeight) / 2;
          targetMarker.style.setProperty(
            '--ring',
            `${Math.round(Math.max(MARKER_RADIUS_PX, discPx + MARKER_GAP_PX) * 2)}px`,
          );
          targetMarker.style.left = `${(projected.x + 1) * 50}%`;
          targetMarker.style.top = `${(1 - projected.y) * 50}%`;
          targetLabel.textContent = labels.target(target);
          lastTarget = {
            x: (projected.x + 1) / 2,
            y: (1 - projected.y) / 2,
            radius: Math.max(MARKER_RADIUS_PX, discPx + MARKER_GAP_PX) / host.clientHeight,
            label: targetLabel.textContent,
          };
        }
      }
      celestialLayers.layout(camera, host.clientWidth, host.clientHeight, blocked);
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
          planetMaterial.uniforms.uPixelRatio.value = next;
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
    };
    const loop = createFrameLoop(drawFrame);
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
      /** Redraw on the next frame, e.g. after interface panels over the sky moved. */
      redraw: () => invalidate(),
      // The view buttons and centering stop a turn in progress, like the visitor's own look.
      resetView: () => {
        interrupt();
        controls.resetView();
      },
      focus: (altitude: number, azimuth: number, fov?: number) => {
        interrupt();
        controls.focus(altitude, azimuth, fov);
      },
      zoom: (factor: number) => {
        interrupt();
        controls.zoom(factor);
      },
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
