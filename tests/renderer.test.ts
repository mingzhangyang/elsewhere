import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import zh from '../src/i18n/zh-Hans';
import { createCelestialLayers } from '../src/renderer/celestialLayers';
import { calculateSky } from '../src/domain/astronomy';
import { NEW_YORK } from './fixtures/locations';
import {
  betterDiscHit,
  pickDiscAt,
  pickPointAt,
  pickStarAt,
  pickStarIndex,
  pickThreshold,
  STAR_PICK_RADIUS_PX,
  starAlpha,
} from '../src/renderer/starPicking';

const VIEWPORT = { left: 0, top: 0, width: 390, height: 449 };

function cameraAt(fov: number) {
  const camera = new THREE.PerspectiveCamera(fov, VIEWPORT.width / VIEWPORT.height, 0.1, 5000);
  camera.updateMatrixWorld();
  return camera;
}

/** World position on the star sphere that projects to client pixel (`x`, `y`). */
function pointAtPixel(camera: THREE.PerspectiveCamera, x: number, y: number) {
  const ndc = new THREE.Vector3((x / VIEWPORT.width) * 2 - 1, -(y / VIEWPORT.height) * 2 + 1, 0.5);
  return ndc.unproject(camera).normalize().multiplyScalar(1770);
}

function starsAt(points: THREE.Vector3[]) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Points(geometry, new THREE.PointsMaterial());
}

it('picks the centered star rather than a shallower neighbor and skips extinguished stars', () => {
  const sky = calculateSky(NEW_YORK, new Date('2026-11-13T04:00Z'));
  const mizar = sky.stars.find((s) => s.name === 'Mizar')!;
  const alcor = sky.stars.find((s) => s.name === 'Alcor')!;
  const direction = (star: typeof mizar) => {
    const alt = THREE.MathUtils.degToRad(star.altitude);
    const az = THREE.MathUtils.degToRad(star.azimuth);
    return new THREE.Vector3(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az));
  };
  const points = starsAt([mizar, alcor].map((s) => direction(s).multiplyScalar(1770)));
  const camera = cameraAt(66);
  camera.lookAt(direction(mizar));
  camera.updateMatrixWorld();
  const pick = (alpha: (i: number) => number) =>
    pickStarAt(points, camera, 195, 224.5, VIEWPORT, 1770, alpha);
  expect(pick(() => 1)).toBe(0);
  expect(pick((i) => (i === 0 ? 0 : 1))).toBe(1);
  expect(pick(() => 0)).toBeUndefined();
  expect(starAlpha({ ...mizar, altitude: -1 }, 6)).toBe(0);
  expect(starAlpha({ ...mizar, magnitude: 8 }, 3)).toBe(0);
  expect(starAlpha(mizar, 6)).toBeGreaterThan(0.05);
});

// Off-center, a perspective camera magnifies the world-space ray threshold; the screen radius must not grow.
it.each([
  { fov: 92, star: [335, 224.5] },
  { fov: 92, star: [380, 440] },
  { fov: 66, star: [20, 10] },
  { fov: 20, star: [195, 224.5] },
])('limits star taps to $fov° fov at $star to 20 screen pixels', ({ fov, star: [sx, sy] }) => {
  const camera = cameraAt(fov);
  const points = starsAt([pointAtPixel(camera, sx, sy)]);
  const tap = (dx: number, dy: number) =>
    pickStarAt(points, camera, sx + dx, sy + dy, VIEWPORT, 1770, () => 1);
  expect(tap(0, 0)).toBe(0);
  expect(tap(-19, 0)).toBe(0);
  expect(tap(0, -19)).toBe(0);
  expect(tap(-13, -13)).toBe(0);
  expect(tap(-22, 0)).toBeUndefined();
  expect(tap(0, -22)).toBeUndefined();
  expect(tap(-30, 0)).toBeUndefined();
});

it.each([66, 92])('picks a small Moon with a 20px tolerance on a 390px portrait view at %d° FOV', (fov) => {
  const camera = cameraAt(fov);
  const moon = pointAtPixel(camera, 195, 224.5).normalize().multiplyScalar(1650);
  const tap = (dx: number, dy = 0, diameter = 8) =>
    pickDiscAt(moon, camera, 195 + dx, 224.5 + dy, VIEWPORT, diameter);

  expect(tap(0)?.distance).toBe(0);
  expect(tap(0)?.insideDisc).toBe(true);
  expect(tap(12)?.distance).toBeCloseTo(12, 4); // center distance, as for point objects
  expect(tap(12)?.insideDisc).toBe(false); // outside the 4px disc, still touchable
  expect(tap(19)).toBeDefined();
  expect(tap(21)).toBeUndefined();
  expect(tap(0, 19)).toBeDefined();
  expect(tap(0, 21)).toBeUndefined();

  // Close to a planet/star, screen distance wins rather than Moon-first ray precedence.
  const neighbor = starsAt([pointAtPixel(camera, 209, 224.5)]);
  const neighborAt = (x: number) => pickPointAt(neighbor, camera, x, 224.5, VIEWPORT, 1770, () => 0.9);
  const starAtStar = neighborAt(209);
  const moonAtStar = tap(14);
  expect(starAtStar?.distance).toBeCloseTo(0, 4);
  expect(betterDiscHit(moonAtStar, starAtStar)).toBe(starAtStar);

  const starNearMoon = neighborAt(198);
  const moonNearMoon = tap(3);
  expect(starNearMoon).toBeDefined();
  expect(betterDiscHit(moonNearMoon, starNearMoon)).toBe(moonNearMoon);

  // At just 5-6px separation, the star is outside the 4px lunar disc but within
  // the Moon's extended touch target. A tap centered on that star must not select Moon.
  for (const separation of [5, 5.5, 6]) {
    const closeStar = starsAt([pointAtPixel(camera, 195 + separation, 224.5)]);
    const pickCloseStar = (x: number) => pickPointAt(closeStar, camera, x, 224.5, VIEWPORT, 1770, () => 0.9);
    const atStar = pickCloseStar(195 + separation);
    expect(atStar?.distance).toBeCloseTo(0, 4);
    expect(betterDiscHit(tap(separation), atStar)).toBe(atStar);

    // The visible Moon itself remains selectable even beside a brighter point.
    const onDisc = tap(3.5);
    expect(onDisc?.insideDisc).toBe(true);
    expect(betterDiscHit(onDisc, pickCloseStar(198.5))).toBe(onDisc);
    const atMoonCenter = tap(0);
    expect(betterDiscHit(atMoonCenter, pickCloseStar(195))).toBe(atMoonCenter);
  }

  // Zoomed Moon: the entire displayed disc is pickable, not just a 20px center.
  const zoomedEdge = tap(45, 0, 100);
  expect(zoomedEdge?.distance).toBeCloseTo(45, 4);
  expect(zoomedEdge?.insideDisc).toBe(true);
  // A foreground Moon disc stays selectable across its full apparent radius.
  expect(betterDiscHit(zoomedEdge, { index: 0, distance: 0, brightness: 1.1 })).toBe(zoomedEdge);
  // The unenhanced physical Moon remains easy to tap, without enlarging it visually.
  expect(tap(19, 0, 3)).toBeDefined();
  expect(pickDiscAt(new THREE.Vector3(0, 0, 1650), camera, 195, 224.5, VIEWPORT, 8)).toBeUndefined();
});

it('updates moving sky layers without reallocating their geometry or labels', () => {
  const scene = new THREE.Scene();
  const text = vi.fn(() => new THREE.Sprite(new THREE.SpriteMaterial()));
  const initial = calculateSky(NEW_YORK, new Date('2026-11-12T12:00Z'));
  const layers = createCelestialLayers(scene, initial.stars, text);
  const flags = { stars: true, labels: true, constellations: true };
  layers.update(initial.stars, flags, 1);
  const ids = scene.children.map((o) => o.uuid);
  const geometries = scene.children
    .filter((o) => o instanceof THREE.LineSegments)
    .map((o) => (o as THREE.LineSegments).geometry);
  const firstPoint = geometries[0].getAttribute('position').getX(0);
  const calls = text.mock.calls.length;
  for (let i = 1; i <= 100; i++) {
    const sky = calculateSky(NEW_YORK, new Date(Date.parse('2026-11-12T12:00Z') + i * 60000), initial.events);
    layers.update(sky.stars, flags, 1);
  }
  expect(scene.children.map((o) => o.uuid)).toEqual(ids);
  expect(text).toHaveBeenCalledTimes(calls);
  expect(geometries[0].getAttribute('position').getX(0)).not.toBe(firstPoint);
  layers.update(initial.stars, { ...flags, labels: false }, 1);
  expect(scene.children.filter((o) => o instanceof THREE.Sprite).every((o) => !o.visible)).toBe(true);
  layers.update(initial.stars, flags, 0);
  expect(scene.children.every((o) => !o.visible)).toBe(true);
});

it.each([20, 66, 92])('keeps the star tap radius at a fixed screen size at %d° field of view', (fov) => {
  const height = 700;
  const camera = new THREE.PerspectiveCamera(fov, 390 / height, 0.1, 5000);
  camera.updateMatrixWorld();
  const offset = pickThreshold(1770, fov, height);
  const center = new THREE.Vector3(0, 0, -1770).project(camera);
  const edge = new THREE.Vector3(0, offset, -1770).project(camera);
  expect(((edge.y - center.y) * height) / 2).toBeCloseTo(STAR_PICK_RADIUS_PX, 6);
});

it('needs the screen-space check: the ray threshold alone accepts a 30px tap off-center', () => {
  // Reviewer's case: 390×449, 92° fov, star 140px right of center, tapped 30px farther right.
  const camera = cameraAt(92);
  const points = starsAt([pointAtPixel(camera, 335, 224.5)]);
  const ray = new THREE.Raycaster();
  ray.params.Points = { threshold: pickThreshold(1770, 92, VIEWPORT.height) };
  ray.setFromCamera(new THREE.Vector2(((335 + 30) / 390) * 2 - 1, 0), camera);
  expect(ray.intersectObject(points)).toHaveLength(1);
  expect(pickStarAt(points, camera, 335 + 30, 224.5, VIEWPORT, 1770, () => 1)).toBeUndefined();
});

it('gives a tap on stars closer than a couple of pixels to the brighter one', () => {
  const hits = [{ index: 0 }, { index: 1 }, { index: 2 }] as THREE.Intersection[];
  const brightness = [0.4, 0.9, 1];
  const distance = [0.3, 0.8, 6];
  // Index 1 is 0.5px farther than 0 but brighter; index 2 is brightest but clearly farther away.
  expect(
    pickStarIndex(
      hits,
      (i) => brightness[i],
      (i) => distance[i],
    ),
  ).toBe(1);
  expect(
    pickStarIndex(
      hits,
      () => 1,
      (i) => [9, 4, 25][i],
    ),
  ).toBe(1);
});

it('keeps labels out from under interface panels drawn over the sky', () => {
  const scene = new THREE.Scene();
  const text = () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.userData.aspect = 3;
    return sprite;
  };
  const sky = calculateSky(NEW_YORK, new Date('2026-11-13T04:00Z'));
  const layers = createCelestialLayers(scene, sky.stars, text);
  layers.update(sky.stars, { stars: true, labels: true, constellations: false }, 1);
  const vega = sky.stars.find((s) => s.name === 'Vega')!;
  const camera = new THREE.PerspectiveCamera(66, 1280 / 560, 0.1, 5000);
  camera.lookAt(
    new THREE.Vector3(
      Math.cos(THREE.MathUtils.degToRad(vega.altitude)) * Math.sin(THREE.MathUtils.degToRad(vega.azimuth)),
      Math.sin(THREE.MathUtils.degToRad(vega.altitude)),
      -Math.cos(THREE.MathUtils.degToRad(vega.altitude)) * Math.cos(THREE.MathUtils.degToRad(vega.azimuth)),
    ),
  );
  camera.updateMatrixWorld();
  const shown = () => scene.children.filter((o) => o instanceof THREE.Sprite && o.visible).length;
  layers.layout(camera, 1280, 560);
  const free = shown();
  expect(free).toBeGreaterThan(0);
  // A panel covering the middle of the view, where Vega's label sits.
  layers.layout(camera, 1280, 560, [{ left: 400, right: 880, top: 100, bottom: 460 }]);
  expect(shown()).toBeLessThan(free);
  layers.layout(camera, 1280, 560, [{ left: 0, right: 1280, top: 0, bottom: 560 }]);
  expect(shown()).toBe(0);
});

describe('labels in another language', () => {
  const zhNames = {
    star: (star: { name: string }) => zh.starNames[star.name] ?? star.name,
    pattern: (id: keyof typeof zh.patterns) => zh.patterns[id],
  };
  /** A label sprite as wide as its text: CJK glyphs take a full em, Latin about half. */
  const measured = (name: string) => {
    const em = [...name].reduce((width, char) => width + (/[\u3000-\u9fff]/.test(char) ? 1 : 0.55), 0);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.Texture() }));
    sprite.name = name;
    sprite.userData.aspect = (em * 32 + 32) / 56;
    return sprite;
  };

  it('draws Chinese star and pattern names, and frees every texture when replaced', () => {
    const scene = new THREE.Scene();
    const sky = calculateSky(NEW_YORK, new Date('2026-11-13T04:00Z'));
    const layers = createCelestialLayers(
      scene,
      sky.stars,
      measured,
      [{ id: 'jupiter', name: '木星' }],
      zhNames,
    );
    const names = scene.children.filter((o) => o instanceof THREE.Sprite).map((o) => o.name);
    expect(names).toEqual(expect.arrayContaining(['木星', '天狼星', '织女星', '猎户座', '北斗七星 · 星群']));
    expect(names.some((name) => /[A-Za-z]{2,}/.test(name))).toBe(false);
    const textures = scene.children.flatMap((o) => (o instanceof THREE.Sprite ? [o.material.map!] : []));
    const freed = textures.map((texture) => vi.spyOn(texture, 'dispose'));
    layers.dispose();
    expect(freed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(scene.children).toHaveLength(0);
  });

  it.each([
    ['English', undefined],
    ['Chinese', zhNames],
  ])('never overlaps %s labels on screen', (_, names) => {
    const scene = new THREE.Scene();
    const sky = calculateSky(NEW_YORK, new Date('2026-11-13T04:00Z'));
    const layers = createCelestialLayers(scene, sky.stars, measured, [], names);
    layers.update(sky.stars, { stars: true, labels: true, constellations: true }, 1);
    let shown = 0;
    for (const azimuth of [0, 90, 180, 270]) {
      const camera = new THREE.PerspectiveCamera(92, 390 / 700, 0.1, 5000);
      camera.rotation.set(THREE.MathUtils.degToRad(35), -THREE.MathUtils.degToRad(azimuth), 0, 'YXZ');
      camera.updateMatrixWorld();
      layers.layout(camera, 390, 700);
      const boxes = scene.children
        .filter((o): o is THREE.Sprite => o instanceof THREE.Sprite && o.visible)
        .map((sprite) => {
          const p = sprite.getWorldPosition(new THREE.Vector3()).project(camera);
          const x = ((p.x + 1) * 390) / 2,
            y = ((1 - p.y) * 700) / 2,
            w = 22 * sprite.userData.aspect;
          return { left: x - w / 2, right: x + w / 2, top: y - 11, bottom: y + 11 };
        });
      shown += boxes.length;
      for (const [i, a] of boxes.entries())
        for (const b of boxes.slice(i + 1))
          expect(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top).toBe(false);
    }
    expect(shown).toBeGreaterThan(5);
  });
});

it('renders celestial names above transparent clouds without bypassing foreground depth', () => {
  const scene = new THREE.Scene();
  const cloud = new THREE.Mesh(
    new THREE.SphereGeometry(10),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
  );
  cloud.renderOrder = 20;
  scene.add(cloud);
  const sky = calculateSky(NEW_YORK, new Date('2026-11-13T04:00Z'));
  const layers = createCelestialLayers(
    scene,
    sky.stars,
    () => new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })),
    [{ id: 'jupiter', name: 'Jupiter' }],
  );
  const sprites = scene.children.filter((object): object is THREE.Sprite => object instanceof THREE.Sprite);
  expect(sprites.length).toBeGreaterThan(3);
  for (const sprite of sprites) {
    expect(sprite.renderOrder).toBe(21);
    expect(sprite.renderOrder).toBeGreaterThan(cloud.renderOrder);
    expect(sprite.renderOrder).toBeLessThan(30);
    expect(sprite.material.depthTest).toBe(true);
    expect(sprite.material.depthWrite).toBe(false);
  }
  // Constellation geometry is not text: keep its original physical draw order.
  expect(
    scene.children
      .filter((object) => object instanceof THREE.LineSegments)
      .every((line) => line.renderOrder === 0),
  ).toBe(true);
  layers.dispose();
  scene.remove(cloud);
  cloud.geometry.dispose();
  cloud.material.dispose();
});

it('keeps celestial sprite resources and constellation lines stable when labels are disabled', () => {
  const enabled = { stars: true, labels: true, constellations: true };
  const scene = new THREE.Scene();
  const sky = calculateSky(NEW_YORK, new Date('2026-11-13T04:00Z'));
  const layers = createCelestialLayers(
    scene,
    sky.stars,
    () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
      sprite.userData.aspect = 3;
      return sprite;
    },
    [{ id: 'jupiter', name: 'Jupiter' }],
  );
  const bodies = [{ altitude: 45, azimuth: 100, opacity: 1 }];
  const sprites = scene.children.filter((object): object is THREE.Sprite => object instanceof THREE.Sprite);
  const camera = new THREE.PerspectiveCamera(66, 1280 / 800, 0.1, 5000);
  camera.lookAt(new THREE.Vector3(1, 0.6, -0.2));
  camera.updateMatrixWorld();
  layers.update(sky.stars, enabled, 1, bodies);
  layers.layout(camera, 1280, 800);
  expect(sprites.some((sprite) => sprite.visible)).toBe(true);
  const spriteIds = sprites.map((sprite) => sprite.uuid);
  layers.update(sky.stars, { ...enabled, labels: false }, 1, bodies);
  layers.layout(camera, 1280, 800);
  expect(sprites.every((sprite) => !sprite.visible)).toBe(true);
  // A label-layer setting change does not recreate constellation lines or text textures.
  expect(scene.children.some((object) => object instanceof THREE.LineSegments && object.visible)).toBe(true);
  expect(sprites.map((sprite) => sprite.uuid)).toEqual(spriteIds);
  layers.dispose();
});
