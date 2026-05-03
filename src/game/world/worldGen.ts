import {
  AmbientLight,
  Box3,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  PointLight,
  Scene,
  Vector3
} from "three";
import { CITY_COLORS, GAME_CONFIG, SHOP_CONFIG } from "@/game/config";
import type {
  Collider,
  DestructibleProp,
  ParallaxLayer,
  ParkedSpawn,
  ShopEntity,
  ShopType,
  TrafficLightEntity,
  TrafficSpawn,
  VehicleClass,
  VehicleKind,
  WalkableZone
} from "@/game/types";

export type WorldBuild = {
  colliders: Collider[];
  walkableZones: WalkableZone[];
  parallaxLayers: ParallaxLayer[];
  pedestrianSpawns: Vector3[];
  policePatrolSpawns: Vector3[];
  pickupSpawns: {
    id: string;
    kind: "smg" | "armor" | "cash";
    position: Vector3;
  }[];
  trafficRoutes: Vector3[][];
  trafficSpawns: TrafficSpawn[];
  parkedSpawns: ParkedSpawn[];
  destructibles: DestructibleProp[];
  trafficLights: TrafficLightEntity[];
  shopSpawns: ShopEntity[];
  lighting: {
    ambient: AmbientLight;
    sun: DirectionalLight;
    glowLights: PointLight[];
  };
};

const blockCenter = (index: number, blocks: number, size: number, road: number) => {
  const span = size + road;
  return -((blocks - 1) * span) / 2 + index * span;
};

const seeded = (a: number, b: number) => {
  const value = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

function createMat(color: number, emissive = 0x000000, intensity = 0) {
  return new MeshLambertMaterial({
    color,
    emissive,
    emissiveIntensity: intensity
  });
}

function addBox(
  scene: Scene,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  color: number,
  emissive?: number,
  intensity?: number
) {
  const mesh = new Mesh(
    new BoxGeometry(width, height, depth),
    createMat(color, emissive, intensity)
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function pushCollider(
  colliders: Collider[],
  width: number,
  depth: number,
  x: number,
  z: number,
  minY = 0,
  maxY = 999
) {
  colliders.push({
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    minY,
    maxY
  });
}

function addSolidBox(
  scene: Scene,
  colliders: Collider[],
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  color: number,
  emissive?: number,
  intensity?: number,
  minY = 0
) {
  addBox(scene, width, height, depth, x, y, z, color, emissive, intensity);
  pushCollider(colliders, width, depth, x, z, minY, minY + height);
}

function createParallaxBackdrop(scene: Scene, parallaxLayers: ParallaxLayer[]) {
  const farSkyline = new Group();
  const midSkyline = new Group();
  const cloudLayer = new Group();

  const skylineDefs = [
    { x: -240, h: 38, w: 52, d: 18, c: 0x4d6788 },
    { x: -178, h: 54, w: 42, d: 18, c: 0x5b7394 },
    { x: -118, h: 32, w: 60, d: 18, c: 0x46627f },
    { x: -42, h: 48, w: 36, d: 18, c: 0x6984a4 },
    { x: 38, h: 42, w: 58, d: 18, c: 0x4f6886 },
    { x: 110, h: 58, w: 44, d: 18, c: 0x7189a6 },
    { x: 186, h: 35, w: 54, d: 18, c: 0x536b88 },
    { x: 252, h: 50, w: 40, d: 18, c: 0x607896 }
  ];

  for (const def of skylineDefs) {
    const tower = new Mesh(
      new BoxGeometry(def.w, def.h, def.d),
      new MeshLambertMaterial({
        color: def.c,
        emissive: 0x2a4665,
        emissiveIntensity: 0.1
      })
    );
    tower.position.set(def.x, def.h / 2 + 10, -318);
    farSkyline.add(tower);
  }

  const midDefs = [
    { x: -210, h: 18, w: 32, d: 20, c: 0x866d58 },
    { x: -122, h: 24, w: 28, d: 20, c: 0x95755d },
    { x: -28, h: 20, w: 40, d: 20, c: 0x7c6250 },
    { x: 76, h: 22, w: 36, d: 20, c: 0x9b7f66 },
    { x: 166, h: 16, w: 46, d: 20, c: 0x6c564a }
  ];

  for (const def of midDefs) {
    const block = new Mesh(
      new BoxGeometry(def.w, def.h, def.d),
      new MeshLambertMaterial({
        color: def.c,
        emissive: 0xff8656,
        emissiveIntensity: 0.03
      })
    );
    block.position.set(def.x, def.h / 2 + 7, 280);
    midSkyline.add(block);
  }

  for (let index = 0; index < 7; index += 1) {
    const cloud = new Mesh(
      new BoxGeometry(34, 6, 12),
      new MeshLambertMaterial({
        color: 0xe3edf7,
        emissive: 0xffffff,
        emissiveIntensity: 0.05,
        transparent: true,
        opacity: 0.85
      })
    );
    cloud.position.set(-240 + index * 78, 78 + (index % 3) * 8, -150 + (index % 2) * 55);
    cloudLayer.add(cloud);
  }

  scene.add(farSkyline);
  scene.add(midSkyline);
  scene.add(cloudLayer);

  parallaxLayers.push(
    {
      mesh: farSkyline,
      basePosition: farSkyline.position.clone(),
      factorX: 0.16,
      factorZ: 0.08
    },
    {
      mesh: midSkyline,
      basePosition: midSkyline.position.clone(),
      factorX: 0.28,
      factorZ: 0.12
    },
    {
      mesh: cloudLayer,
      basePosition: cloudLayer.position.clone(),
      factorX: 0.08,
      factorZ: 0.04,
      bobAmplitude: 3.5
    }
  );
}

function routePoint(x: number, z: number) {
  return new Vector3(x, 0, z);
}

function pushPedestrianStrip(
  pedestrianSpawns: Vector3[],
  from: Vector3,
  to: Vector3,
  count: number,
  sideOffset: number
) {
  for (let index = 0; index < count; index += 1) {
    const t = index / Math.max(1, count - 1);
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    pedestrianSpawns.push(new Vector3(x + sideOffset, 1, z - sideOffset * 0.35));
  }
}

/** Create a traffic light prop at an intersection */
function createTrafficLight(
  scene: Scene, x: number, z: number,
  destructibles: DestructibleProp[],
  trafficLights: TrafficLightEntity[],
  axis: "ns" | "ew",
  idCounter: { v: number }
) {
  const group = new Group();

  // Pole
  const pole = new Mesh(
    new CylinderGeometry(0.12, 0.12, 5.5, 6),
    createMat(CITY_COLORS.propMetal)
  );
  pole.position.set(0, 2.75, 0);
  pole.castShadow = true;
  group.add(pole);

  // Light housing
  const housing = new Mesh(
    new BoxGeometry(0.5, 1.4, 0.4),
    createMat(0x222222)
  );
  housing.position.set(0, 5.2, 0);
  group.add(housing);

  // Red light
  const red = new Mesh(
    new BoxGeometry(0.3, 0.3, 0.1),
    createMat(CITY_COLORS.trafficLightRed, CITY_COLORS.trafficLightRed, 0.8)
  );
  red.position.set(0, 5.55, 0.2);
  red.name = "traffic-red";
  group.add(red);

  // Yellow light
  const yellow = new Mesh(
    new BoxGeometry(0.3, 0.3, 0.1),
    createMat(CITY_COLORS.trafficLightYellow, CITY_COLORS.trafficLightYellow, 0.2)
  );
  yellow.position.set(0, 5.2, 0.2);
  yellow.name = "traffic-yellow";
  group.add(yellow);

  // Green light
  const green = new Mesh(
    new BoxGeometry(0.3, 0.3, 0.1),
    createMat(CITY_COLORS.trafficLightGreen, CITY_COLORS.trafficLightGreen, 0.2)
  );
  green.position.set(0, 4.85, 0.2);
  green.name = "traffic-green";
  group.add(green);

  group.position.set(x, 0, z);
  scene.add(group);

  const collider: Collider = {
    minX: x - 0.3,
    maxX: x + 0.3,
    minZ: z - 0.3,
    maxZ: z + 0.3
  };

  idCounter.v++;
  destructibles.push({
    id: `traffic-light-${idCounter.v}`,
    mesh: group,
    position: new Vector3(x, 0, z),
    tier: "prop",
    hp: 20,
    destroyed: false,
    collider
  });

  // Also register as a traffic light entity for state cycling
  trafficLights.push({
    id: `tl-${idCounter.v}`,
    mesh: group,
    position: new Vector3(x, 0, z),
    state: axis === "ns" ? "green" : "red",
    timer: Math.random() * 4, // stagger start
    axis,
    redMesh: red,
    yellowMesh: yellow,
    greenMesh: green
  });

  return collider;
}

/** Create a street light prop */
function createStreetLight(scene: Scene, x: number, z: number, destructibles: DestructibleProp[], idCounter: { v: number }) {
  const group = new Group();

  const pole = new Mesh(
    new CylinderGeometry(0.1, 0.14, 6, 6),
    createMat(CITY_COLORS.propMetal)
  );
  pole.position.set(0, 3, 0);
  pole.castShadow = true;
  group.add(pole);

  // Lamp head
  const lamp = new Mesh(
    new BoxGeometry(0.8, 0.2, 0.4),
    createMat(0xfff5dd, 0xffd58b, 0.6)
  );
  lamp.position.set(0.2, 6, 0);
  group.add(lamp);

  group.position.set(x, 0, z);
  scene.add(group);

  const collider: Collider = {
    minX: x - 0.25,
    maxX: x + 0.25,
    minZ: z - 0.25,
    maxZ: z + 0.25
  };

  idCounter.v++;
  destructibles.push({
    id: `street-light-${idCounter.v}`,
    mesh: group,
    position: new Vector3(x, 0, z),
    tier: "prop",
    hp: 15,
    destroyed: false,
    collider
  });

  return collider;
}

/** Create a bench prop */
function createBench(scene: Scene, x: number, z: number, rotation: number, destructibles: DestructibleProp[], idCounter: { v: number }) {
  const group = new Group();

  // Seat
  const seat = new Mesh(
    new BoxGeometry(2.0, 0.12, 0.6),
    createMat(CITY_COLORS.propWood)
  );
  seat.position.set(0, 0.55, 0);
  seat.castShadow = true;
  group.add(seat);

  // Back
  const back = new Mesh(
    new BoxGeometry(2.0, 0.6, 0.1),
    createMat(CITY_COLORS.propWood)
  );
  back.position.set(0, 0.9, -0.25);
  group.add(back);

  // Legs
  for (const lx of [-0.8, 0.8]) {
    const leg = new Mesh(
      new BoxGeometry(0.1, 0.55, 0.5),
      createMat(CITY_COLORS.propMetal)
    );
    leg.position.set(lx, 0.28, 0);
    group.add(leg);
  }

  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  scene.add(group);

  const collider: Collider = {
    minX: x - 1.1,
    maxX: x + 1.1,
    minZ: z - 0.4,
    maxZ: z + 0.4
  };

  idCounter.v++;
  destructibles.push({
    id: `bench-${idCounter.v}`,
    mesh: group,
    position: new Vector3(x, 0, z),
    tier: "prop",
    hp: 12,
    destroyed: false,
    collider
  });

  return collider;
}

/** Create a trash can prop */
function createTrashCan(scene: Scene, x: number, z: number, destructibles: DestructibleProp[], idCounter: { v: number }) {
  const group = new Group();

  const can = new Mesh(
    new CylinderGeometry(0.3, 0.35, 0.9, 8),
    createMat(0x555555)
  );
  can.position.set(0, 0.45, 0);
  can.castShadow = true;
  group.add(can);

  // Lid
  const lid = new Mesh(
    new CylinderGeometry(0.35, 0.3, 0.08, 8),
    createMat(0x666666)
  );
  lid.position.set(0, 0.92, 0);
  group.add(lid);

  group.position.set(x, 0, z);
  scene.add(group);

  const collider: Collider = {
    minX: x - 0.4,
    maxX: x + 0.4,
    minZ: z - 0.4,
    maxZ: z + 0.4
  };

  idCounter.v++;
  destructibles.push({
    id: `trash-${idCounter.v}`,
    mesh: group,
    position: new Vector3(x, 0, z),
    tier: "prop",
    hp: 8,
    destroyed: false,
    collider
  });

  return collider;
}

/** Create a storefront glass pane (structural tier) */
function createStorefrontGlass(scene: Scene, x: number, z: number, width: number, height: number, destructibles: DestructibleProp[], idCounter: { v: number }) {
  const glass = new Mesh(
    new BoxGeometry(width, height, 0.06),
    new MeshLambertMaterial({
      color: 0xb2d5ff,
      emissive: 0x5ba8ff,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.45
    })
  );
  glass.position.set(x, height / 2, z);
  glass.castShadow = false;
  glass.receiveShadow = true;
  scene.add(glass);

  const collider: Collider = {
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - 0.15,
    maxZ: z + 0.15
  };

  idCounter.v++;
  destructibles.push({
    id: `glass-${idCounter.v}`,
    mesh: glass,
    position: new Vector3(x, 0, z),
    tier: "structural",
    hp: 35,
    destroyed: false,
    collider
  });

  return collider;
}

function addWalkableSurface(
  walkableZones: WalkableZone[],
  id: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number
) {
  walkableZones.push({
    id,
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    height
  });
}

function addRampWalkableSurface(
  walkableZones: WalkableZone[],
  id: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  axis: "x" | "z",
  rampStart: number,
  rampEnd: number,
  rampStartHeight: number,
  rampEndHeight: number
) {
  walkableZones.push({
    id,
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    height: Math.max(rampStartHeight, rampEndHeight),
    rampAxis: axis,
    rampStart,
    rampEnd,
    rampStartHeight,
    rampEndHeight
  });
}

function createStairRun(
  scene: Scene,
  walkableZones: WalkableZone[],
  params: {
    idPrefix: string;
    topX: number;
    topZ: number;
    topHeight: number;
    stepWidth: number;
    stepDepth: number;
    stepHeight: number;
    stepCount: number;
    axis: "x" | "z";
    direction: 1 | -1;
    color: number;
  }
) {
  for (let index = 0; index < params.stepCount; index += 1) {
    const height = Math.max(params.stepHeight, params.topHeight - index * params.stepHeight);
    const x =
      params.axis === "x"
        ? params.topX + params.direction * index * params.stepDepth
        : params.topX;
    const z =
      params.axis === "z"
        ? params.topZ + params.direction * index * params.stepDepth
        : params.topZ;

    const width = params.axis === "x" ? params.stepDepth : params.stepWidth;
    const depth = params.axis === "z" ? params.stepDepth : params.stepWidth;

    addBox(scene, width, height, depth, x, height / 2, z, params.color);
    addWalkableSurface(
      walkableZones,
      `${params.idPrefix}-step-${index}`,
      x,
      z,
      width,
      depth,
      height
    );
  }

  const lastCenter =
    params.axis === "x"
      ? params.topX + params.direction * (params.stepCount - 1) * params.stepDepth
      : params.topZ + params.direction * (params.stepCount - 1) * params.stepDepth;
  const lowHeight = params.stepHeight;

  if (params.axis === "x") {
    const minX = Math.min(params.topX, lastCenter) - params.stepDepth / 2;
    const maxX = Math.max(params.topX, lastCenter) + params.stepDepth / 2;
    addRampWalkableSurface(
      walkableZones,
      `${params.idPrefix}-ramp`,
      (minX + maxX) / 2,
      params.topZ,
      maxX - minX,
      params.stepWidth,
      "x",
      minX,
      maxX,
      params.direction === 1 ? params.topHeight : lowHeight,
      params.direction === 1 ? lowHeight : params.topHeight
    );
  } else {
    const minZ = Math.min(params.topZ, lastCenter) - params.stepDepth / 2;
    const maxZ = Math.max(params.topZ, lastCenter) + params.stepDepth / 2;
    addRampWalkableSurface(
      walkableZones,
      `${params.idPrefix}-ramp`,
      params.topX,
      (minZ + maxZ) / 2,
      params.stepWidth,
      maxZ - minZ,
      "z",
      minZ,
      maxZ,
      params.direction === 1 ? params.topHeight : lowHeight,
      params.direction === 1 ? lowHeight : params.topHeight
    );
  }
}

function addImportedBuilding(
  scene: Scene,
  model: Group,
  center: Vector3,
  targetWidth: number,
  targetDepth: number,
  targetHeight: number
) {
  const cloned = model.clone();
  // Source models are hidden to prevent giant-object-at-origin bug.
  // Clones inherit visible=false — restore visibility on all children.
  cloned.visible = true;
  cloned.traverse((child: any) => { child.visible = true; });

  const bounds = new Box3().setFromObject(cloned);
  const size = new Vector3();
  const centerOffset = new Vector3();
  bounds.getSize(size);

  const scaleX = size.x > 0.01 ? targetWidth / size.x : 1;
  const scaleY = size.y > 0.01 ? targetHeight / size.y : 1;
  const scaleZ = size.z > 0.01 ? targetDepth / size.z : 1;
  const uniformScale = Math.min(scaleX, scaleY, scaleZ) * 0.98;
  cloned.scale.setScalar(uniformScale);

  bounds.setFromObject(cloned);
  bounds.getCenter(centerOffset);
  cloned.position.set(center.x - centerOffset.x, -bounds.min.y, center.z - centerOffset.z);
  cloned.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  scene.add(cloned);
  return cloned;
}

function createLandmarkBlock(
  scene: Scene,
  center: Vector3,
  kind: "hospital" | "police" | "mall" | "club",
  colliders: Collider[],
  walkableZones: WalkableZone[],
  pedestrianSpawns: Vector3[],
  policePatrolSpawns: Vector3[]
) {
  if (kind === "hospital") {
    const baseWidth = 28;
    const baseDepth = 22;
    const roofHeight = 6;
    addBox(scene, baseWidth, roofHeight, baseDepth, center.x, roofHeight / 2, center.z, 0xe6edf2, 0xbfd8ea, 0.03);
    addBox(scene, 10, 8.2, 10, center.x - 7.5, 4.1, center.z - 2, 0xd5e3ee, 0xbfd8ea, 0.04);
    addBox(scene, 8.5, 3.2, 5.2, center.x + 8.2, 1.6, center.z + 8.8, 0xf2f6fb, 0xff6b6b, 0.03);
    addBox(scene, 8.5, 0.8, 0.8, center.x + 7.2, 4.8, center.z + baseDepth / 2 + 0.8, 0xff6b6b, 0xff6b6b, 0.95);
    addBox(scene, 1.2, 4.8, 0.4, center.x + 6.2, roofHeight + 1.1, center.z, 0xff6b6b, 0xff6b6b, 0.4);
    addBox(scene, 4.8, 1.2, 0.4, center.x + 6.2, roofHeight + 1.1, center.z, 0xff6b6b, 0xff6b6b, 0.4);
    addBox(scene, 9.5, 0.3, 9.5, center.x + 1.5, roofHeight + 0.16, center.z + 1.8, 0xcfd7df);
    addBox(scene, 6, 0.2, 1, center.x + 1.5, roofHeight + 0.32, center.z + 1.8, 0xffcc66, 0xffcc66, 0.35);
    addBox(scene, 1, 0.2, 6, center.x + 1.5, roofHeight + 0.32, center.z + 1.8, 0xffcc66, 0xffcc66, 0.35);

    colliders.push({
      minX: center.x - baseWidth / 2,
      maxX: center.x + baseWidth / 2,
      minZ: center.z - baseDepth / 2,
      maxZ: center.z + baseDepth / 2,
      minY: 0,
      maxY: roofHeight
    });
    colliders.push({
      minX: center.x - 12.5,
      maxX: center.x - 2.5,
      minZ: center.z - 7,
      maxZ: center.z + 3,
      minY: roofHeight,
      maxY: 8.2
    });
    pushCollider(colliders, 8.5, 5.2, center.x + 8.2, center.z + 8.8, 0, 3.2);

    addWalkableSurface(walkableZones, "hospital-roof", center.x + 1, center.z, 26, 18, roofHeight);
    createStairRun(scene, walkableZones, {
      idPrefix: "hospital-stairs",
      topX: center.x + baseWidth / 2 + 0.8,
      topZ: center.z - 2.2,
      topHeight: roofHeight,
      stepWidth: 4.6,
      stepDepth: 1.6,
      stepHeight: 0.75,
      stepCount: 8,
      axis: "x",
      direction: 1,
      color: 0xc7d2dc
    });

    pedestrianSpawns.push(new Vector3(center.x + 18, 1, center.z + 8));
    pedestrianSpawns.push(new Vector3(center.x - 16, 1, center.z - 7));
    return;
  }

  if (kind === "police") {
    const baseWidth = 30;
    const baseDepth = 24;
    const roofHeight = 6.8;
    addBox(scene, baseWidth, roofHeight, baseDepth, center.x, roofHeight / 2, center.z, 0x95a9bf, 0x4b7fdc, 0.03);
    addBox(scene, 14, 2.1, 4.2, center.x, 1.1, center.z + baseDepth / 2 + 1.9, CITY_COLORS.policeBlue, CITY_COLORS.policeBlue, 0.85);
    addBox(scene, 18, 3.6, 8.5, center.x, 1.8, center.z + baseDepth / 2 + 4.2, 0x2f5cff, 0x274ed5, 0.16);
    addBox(scene, 8.5, 0.8, 0.8, center.x, 4.8, center.z + baseDepth / 2 + 0.8, 0xf0f5ff, 0xf0f5ff, 0.75);
    addBox(scene, 6.8, 10.5, 6.8, center.x - 9.4, 5.25, center.z - 8.5, 0x6f87a5, 0x5bb9ff, 0.05);
    addBox(scene, 5.5, 0.35, 5.5, center.x - 7.5, roofHeight + 0.2, center.z - 4.5, 0x223246, 0x5bb9ff, 0.18);
    addBox(scene, 1.2, 0.6, 2, center.x - 7.5, roofHeight + 0.55, center.z - 4.5, 0xff4d4d, 0xff4d4d, 0.95);
    addBox(scene, 1.2, 0.6, 2, center.x - 6, roofHeight + 0.55, center.z - 4.5, 0x4db8ff, 0x4db8ff, 0.95);

    colliders.push({
      minX: center.x - baseWidth / 2,
      maxX: center.x + baseWidth / 2,
      minZ: center.z - baseDepth / 2,
      maxZ: center.z + baseDepth / 2,
      minY: 0,
      maxY: roofHeight
    });
    pushCollider(colliders, 18, 8.5, center.x, center.z + baseDepth / 2 + 4.2, 0, 3.6);
    pushCollider(colliders, 6.8, 6.8, center.x - 9.4, center.z - 8.5, 0, 10.5);

    addWalkableSurface(walkableZones, "police-roof", center.x, center.z, 28, 20, roofHeight);
    createStairRun(scene, walkableZones, {
      idPrefix: "police-stairs",
      topX: center.x - baseWidth / 2 + 0.4,
      topZ: center.z + 3,
      topHeight: roofHeight,
      stepWidth: 4.8,
      stepDepth: 1.55,
      stepHeight: 0.76,
      stepCount: 8,
      axis: "x",
      direction: -1,
      color: 0x7f8da1
    });

    pedestrianSpawns.push(new Vector3(center.x + 18, 1, center.z + 10));
    pedestrianSpawns.push(new Vector3(center.x - 18, 1, center.z - 10));
    policePatrolSpawns.push(
      new Vector3(center.x + 14, 0, center.z + 8),
      new Vector3(center.x - 14, 0, center.z + 8),
      new Vector3(center.x + 10, 0, center.z - 10),
      new Vector3(center.x - 10, 0, center.z - 10)
    );
    return;
  }

  if (kind === "mall") {
    const baseWidth = 40;
    const baseDepth = 26;
    const roofHeight = 5.4;
    addBox(scene, baseWidth, roofHeight, baseDepth, center.x, roofHeight / 2, center.z, 0xc49a77, 0xff9f5a, 0.04);
    addBox(scene, 18, 4.4, 6.5, center.x, 2.2, center.z + baseDepth / 2 + 1.5, 0x343a4a, 0xffc16a, 0.08);
    addBox(scene, 12, 7.5, 7.5, center.x - 12, 3.75, center.z - 6, 0xe3c0a4, 0xffc16a, 0.04);
    addBox(scene, 10, 6.2, 7.5, center.x + 13, 3.1, center.z + 6, 0xd5ac84, 0xff9f5a, 0.05);
    addBox(scene, 28, 3.6, 0.3, center.x, 2.3, center.z + baseDepth / 2 + 0.8, 0x9fd8ff, 0x5bb9ff, 0.18);
    addBox(scene, 12, 0.8, 0.8, center.x, 4.5, center.z + baseDepth / 2 + 2.1, 0xffb347, 0xffb347, 1);
    addBox(scene, 8, 0.25, 24, center.x - 11, roofHeight + 0.18, center.z, 0xd1b08e);
    addBox(scene, 8, 0.25, 24, center.x + 11, roofHeight + 0.18, center.z, 0xd1b08e);

    colliders.push({
      minX: center.x - baseWidth / 2,
      maxX: center.x + baseWidth / 2,
      minZ: center.z - baseDepth / 2,
      maxZ: center.z + baseDepth / 2,
      minY: 0,
      maxY: roofHeight
    });
    pushCollider(colliders, 12, 7.5, center.x - 12, center.z - 6, 0, 7.5);
    pushCollider(colliders, 10, 7.5, center.x + 13, center.z + 6, 0, 6.2);
    pushCollider(colliders, 18, 6.5, center.x, center.z + baseDepth / 2 + 1.5, 0, 4.4);

    pedestrianSpawns.push(new Vector3(center.x + 22, 1, center.z + 12));
    pedestrianSpawns.push(new Vector3(center.x - 24, 1, center.z + 10));
    pedestrianSpawns.push(new Vector3(center.x, 1, center.z - 15));
    return;
  }

  const baseWidth = 24;
  const baseDepth = 18;
  const roofHeight = 5.8;
  addBox(scene, baseWidth, roofHeight, baseDepth, center.x, roofHeight / 2, center.z, 0x20232f, 0x2ce5d3, 0.04);
  addBox(scene, 8, 9.2, 8, center.x - 8.2, 4.6, center.z - 2.5, 0x2a3143, 0x2ce5d3, 0.06);
  addBox(scene, 6.6, 7.6, 6.6, center.x + 8.4, 3.8, center.z + 1.8, 0x1a1f2b, 0xff6f59, 0.05);
  addBox(scene, baseWidth + 1.5, 0.8, 1.2, center.x, 4.6, center.z + baseDepth / 2 + 0.8, 0xff6f59, 0xff6f59, 1);
  addBox(scene, 12, 0.5, 12, center.x, roofHeight + 0.26, center.z, 0x1c2230, 0x2ce5d3, 0.18);
  addBox(scene, 7.5, 0.3, 7.5, center.x, roofHeight + 0.42, center.z, 0x2ce5d3, 0x2ce5d3, 0.22);
  addBox(scene, 10, 3.2, 0.28, center.x, 2.1, center.z + baseDepth / 2 + 0.55, 0x8bc6ff, 0x2ce5d3, 0.22);

  colliders.push({
    minX: center.x - baseWidth / 2,
    maxX: center.x + baseWidth / 2,
    minZ: center.z - baseDepth / 2,
    maxZ: center.z + baseDepth / 2,
    minY: 0,
    maxY: roofHeight
  });
  pushCollider(colliders, 8, 8, center.x - 8.2, center.z - 2.5, 0, 9.2);
  pushCollider(colliders, 6.6, 6.6, center.x + 8.4, center.z + 1.8, 0, 7.6);

  addWalkableSurface(walkableZones, "club-roof", center.x, center.z, 20, 18, roofHeight);
  createStairRun(scene, walkableZones, {
    idPrefix: "club-stairs",
    topX: center.x + 2.6,
    topZ: center.z - baseDepth / 2 + 0.4,
    topHeight: roofHeight,
    stepWidth: 5,
    stepDepth: 1.55,
    stepHeight: 0.73,
    stepCount: 8,
    axis: "z",
    direction: -1,
    color: 0x465267
  });

  pedestrianSpawns.push(new Vector3(center.x - 15, 1, center.z + 10));
  pedestrianSpawns.push(new Vector3(center.x + 14, 1, center.z - 10));
}

export function buildWorld(scene: Scene, externalModels?: Record<string, { scene: Group }>): WorldBuild {
  const colliders: Collider[] = [];
  const walkableZones: WalkableZone[] = [];
  const parallaxLayers: ParallaxLayer[] = [];
  const pedestrianSpawns: Vector3[] = [];
  const policePatrolSpawns: Vector3[] = [];
  const destructibles: DestructibleProp[] = [];
  const trafficLights: TrafficLightEntity[] = [];
  const shopSpawns: ShopEntity[] = [];
  const propIdCounter = { v: 0 };

  scene.background = new Color(0x5f9fcb);
  if (scene.fog) {
    scene.fog.color = new Color(0x7aabca);
  }

  createParallaxBackdrop(scene, parallaxLayers);

  const ambient = new AmbientLight(0xffffff, 0.56);
  scene.add(ambient);

  const sun = new DirectionalLight(0xfff1d1, 1.32);
  sun.position.set(-92, 128, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280;
  sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -280;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const ground = new Mesh(new PlaneGeometry(760, 760), createMat(0x3f5f3e));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadBase = new Mesh(new PlaneGeometry(560, 500), createMat(CITY_COLORS.asphalt));
  roadBase.rotation.x = -Math.PI / 2;
  roadBase.position.y = -0.01;
  roadBase.receiveShadow = true;
  scene.add(roadBase);

  const water = new Mesh(
    new PlaneGeometry(620, 170),
    createMat(CITY_COLORS.water, CITY_COLORS.neonBlue, 0.12)
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.04, 210);
  scene.add(water);

  const shore = new Mesh(new PlaneGeometry(620, 48), createMat(CITY_COLORS.sand));
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(0, -0.03, 132);
  scene.add(shore);

  const boardwalk = new Mesh(new PlaneGeometry(560, 16), createMat(0x8f6d48, 0xffb347, 0.02));
  boardwalk.rotation.x = -Math.PI / 2;
  boardwalk.position.set(0, 0.02, 116);
  boardwalk.receiveShadow = true;
  scene.add(boardwalk);

  for (const x of [-220, -160, -100, -40, 20, 80, 140, 200]) {
    addBox(scene, 0.5, 5.2, 0.5, x, 2.6, 120, 0x6f4c2f);
    addBox(scene, 3.6, 1.8, 3.6, x, 5.8, 120, 0x4f8a45);
    addBox(scene, 2.8, 1.5, 2.8, x + 0.9, 6.7, 120.6, 0x5ea44f);
  }

  for (const x of [-180, -60, 60, 180]) {
    addBox(scene, 5.2, 0.24, 5.2, x, 0.14, 134, 0xffe4a8);
    addBox(scene, 0.22, 2.2, 0.22, x, 1.1, 134, 0xffffff);
    addBox(scene, 3.6, 0.2, 0.6, x, 2.4, 134, x < 0 ? 0xff6f59 : 0x54d8ff, x < 0 ? 0xff6f59 : 0x54d8ff, 0.8);
    addBox(scene, 0.3, 2.2, 0.3, x - 1.2, 1.1, 132.8, 0xffffff);
    addBox(scene, 0.3, 2.2, 0.3, x + 1.2, 1.1, 132.8, 0xffffff);
  }

  // ── Add World Boundary Barriers ──
  const wallHeight = 16;
  const wallThick = 6;
  const minX = GAME_CONFIG.worldMinX;
  const maxX = GAME_CONFIG.worldMaxX;
  const minZ = GAME_CONFIG.worldMinZ;
  const maxZ = GAME_CONFIG.worldMaxZ;
  const sizeX = maxX - minX + wallThick;
  const sizeZ = maxZ - minZ;

  // Concrete texture color 0x5a6369
  // North Wall (minZ)
  addBox(scene, sizeX, wallHeight, wallThick, (minX + maxX) / 2, wallHeight / 2, minZ, 0x5a6369);
  colliders.push({ minX: minX, maxX: maxX, minZ: minZ - wallThick, maxZ: minZ + wallThick / 2, minY: 0, maxY: wallHeight });

  // South Wall (maxZ)
  addBox(scene, sizeX, wallHeight, wallThick, (minX + maxX) / 2, wallHeight / 2, maxZ, 0x5a6369);
  colliders.push({ minX: minX, maxX: maxX, minZ: maxZ - wallThick / 2, maxZ: maxZ + wallThick, minY: 0, maxY: wallHeight });

  // West Wall (minX)
  addBox(scene, wallThick, wallHeight, sizeZ, minX, wallHeight / 2, (minZ + maxZ) / 2, 0x5a6369);
  colliders.push({ minX: minX - wallThick, maxX: minX + wallThick / 2, minZ: minZ, maxZ: maxZ, minY: 0, maxY: wallHeight });

  // East Wall (maxX)
  addBox(scene, wallThick, wallHeight, sizeZ, maxX, wallHeight / 2, (minZ + maxZ) / 2, 0x5a6369);
  colliders.push({ minX: maxX - wallThick / 2, maxX: maxX + wallThick, minZ: minZ, maxZ: maxZ, minY: 0, maxY: wallHeight });

  const roadCentersX = Array.from({ length: GAME_CONFIG.blocksX }, (_, index) =>
    blockCenter(index, GAME_CONFIG.blocksX, GAME_CONFIG.blockSize, GAME_CONFIG.roadWidth)
  );
  const roadCentersZ = Array.from({ length: GAME_CONFIG.blocksZ }, (_, index) =>
    blockCenter(index, GAME_CONFIG.blocksZ, GAME_CONFIG.blockSize, GAME_CONFIG.roadWidth)
  );

  const roadSpanX =
    GAME_CONFIG.blocksX * GAME_CONFIG.blockSize +
    (GAME_CONFIG.blocksX - 1) * GAME_CONFIG.roadWidth;
  const roadSpanZ =
    GAME_CONFIG.blocksZ * GAME_CONFIG.blockSize +
    (GAME_CONFIG.blocksZ - 1) * GAME_CONFIG.roadWidth;

  for (const x of roadCentersX) {
    addBox(scene, 0.35, 0.04, roadSpanZ + 70, x - 3.8, 0.01, 0, 0xf2f1d7);
    addBox(scene, 0.35, 0.04, roadSpanZ + 70, x + 3.8, 0.01, 0, 0xffc85d);
  }

  for (const z of roadCentersZ) {
    addBox(scene, roadSpanX + 70, 0.04, 0.35, 0, 0.01, z - 3.8, 0xf2f1d7);
    addBox(scene, roadSpanX + 70, 0.04, 0.35, 0, 0.01, z + 3.8, 0xffc85d);
  }

  for (const px of [-206, -82, 46, 164]) {
    const post = addBox(scene, 0.7, 10.5, 0.7, px, 5.25, -176, 0x4a525a);
    const panel = addBox(scene, 12, 5.8, 0.5, px, 9.2, -176, 0x1e2230, 0x54d8ff, 0.1);
    addBox(scene, 10.8, 0.45, 0.65, px, 11.9, -175.7, 0xff8656, 0xff8656, 1);
    panel.rotation.y = px < 0 ? 0.12 : -0.12;
    post.rotation.y = panel.rotation.y;
  }

  // ── Place traffic lights at intersections ──
  for (const rx of roadCentersX) {
    for (const rz of roadCentersZ) {
      // Place on corners of intersections with axis awareness
      createTrafficLight(scene, rx + 8.5, rz + 8.5, destructibles, trafficLights, "ns", propIdCounter);
      createTrafficLight(scene, rx - 8.5, rz - 8.5, destructibles, trafficLights, "ew", propIdCounter);
    }
  }

  const landmarkBlocks = new Map<string, "hospital" | "police" | "mall" | "club">([
    ["0,0", "hospital"],
    ["4,0", "police"],
    ["1,3", "mall"],
    ["4,3", "club"]
  ]);

  for (let gx = 0; gx < GAME_CONFIG.blocksX; gx += 1) {
    for (let gz = 0; gz < GAME_CONFIG.blocksZ; gz += 1) {
      const center = new Vector3(
        blockCenter(gx, GAME_CONFIG.blocksX, GAME_CONFIG.blockSize, GAME_CONFIG.roadWidth),
        0,
        blockCenter(gz, GAME_CONFIG.blocksZ, GAME_CONFIG.blockSize, GAME_CONFIG.roadWidth)
      );

      const sidewalk = new Mesh(
        new PlaneGeometry(GAME_CONFIG.blockSize - 2, GAME_CONFIG.blockSize - 2),
        createMat(0xc2baa8)
      );
      sidewalk.rotation.x = -Math.PI / 2;
      sidewalk.position.set(center.x, 0.04, center.z);
      sidewalk.receiveShadow = true;
      scene.add(sidewalk);

      const landmark = landmarkBlocks.get(`${gx},${gz}`);
      if (landmark) {
        createLandmarkBlock(scene, center, landmark, colliders, walkableZones, pedestrianSpawns, policePatrolSpawns);
        createStreetLight(scene, center.x - 18, center.z - 18, destructibles, propIdCounter);
        createStreetLight(scene, center.x + 18, center.z + 18, destructibles, propIdCounter);
        createBench(scene, center.x - 10, center.z + 14, 0, destructibles, propIdCounter);
        createTrashCan(scene, center.x + 12, center.z - 12, destructibles, propIdCounter);
        continue;
      }

      const style = seeded(gx, gz);
      if (style < 0.18) {
        const park = new Mesh(
          new PlaneGeometry(GAME_CONFIG.blockSize - 10, GAME_CONFIG.blockSize - 10),
          createMat(CITY_COLORS.park)
        );
        park.rotation.x = -Math.PI / 2;
        park.position.set(center.x, 0.08, center.z);
        scene.add(park);

        for (let tree = 0; tree < 5; tree += 1) {
          const tx = center.x + (seeded(gx + tree, gz) - 0.5) * 26;
          const tz = center.z + (seeded(gx, gz + tree) - 0.5) * 26;
          addBox(scene, 0.45, 4.4, 0.45, tx, 2.2, tz, 0x65472a);
          addBox(scene, 3.5, 2.9, 3.5, tx, 5.2, tz, 0x4d8640);
          
          colliders.push({
            minX: tx - 0.4,
            maxX: tx + 0.4,
            minZ: tz - 0.4,
            maxZ: tz + 0.4,
            minY: 0,
            maxY: 4.4
          });

          pedestrianSpawns.push(new Vector3(tx + 3, 1, tz + 1));
        }

        // Add benches and trash cans to parks
        createBench(scene, center.x + 8, center.z + 4, 0, destructibles, propIdCounter);
        createBench(scene, center.x - 6, center.z - 8, Math.PI / 2, destructibles, propIdCounter);
        createTrashCan(scene, center.x + 12, center.z - 3, destructibles, propIdCounter);

        continue;
      }

      const towers = style > 0.72 ? 3 : 2;
      const laneSize = (GAME_CONFIG.blockSize - 12) / towers;

      for (let slot = 0; slot < towers; slot += 1) {
        const offsetX = center.x - ((towers - 1) * laneSize) / 2 + slot * laneSize;
        const width = laneSize * 0.8;
        const depth = GAME_CONFIG.blockSize * (style > 0.48 ? 0.62 : 0.74);
        const height = 18 + seeded(gx + slot, gz) * 36;
        const color =
          style > 0.66 ? 0x7f9cbc : style > 0.35 ? 0xd0a27d : 0x7f6a87;

        const importedBuildings = [
          externalModels?.cityBuildingLarge?.scene,
          externalModels?.cityBuildingBusiness?.scene,
          externalModels?.cityBuildingMid?.scene
        ].filter(Boolean) as Group[];

        if (importedBuildings.length > 0) {
          const imported =
            importedBuildings[Math.floor(seeded(gx + slot + 0.2, gz + 0.8) * importedBuildings.length)] ??
            importedBuildings[0];
          addImportedBuilding(
            scene,
            imported,
            new Vector3(offsetX, 0, center.z),
            width,
            depth,
            height
          );
        } else {
          addBox(scene, width, height, depth, offsetX, height / 2, center.z, color, color, 0.05);
        }

        if (height > 28) {
          addBox(
            scene,
            width * 0.58,
            Math.max(6, height * 0.22),
            depth * 0.52,
            offsetX + (seeded(gx + slot + 1.4, gz + 2.1) - 0.5) * 3.6,
            height + Math.max(6, height * 0.22) / 2 - 1.4,
            center.z + (seeded(gx + 8.2, gz + slot + 4.1) - 0.5) * 4.2,
            style > 0.6 ? 0xbed4e8 : 0x6a556f,
            CITY_COLORS.neonBlue,
            0.08
          );
        }
        addBox(
          scene,
          width + 0.8,
          1.2,
          1.5,
          offsetX,
          4,
          center.z + depth / 2 + 0.8,
          CITY_COLORS.neonOrange,
          CITY_COLORS.neonOrange,
          0.8
        );

        colliders.push({
          minX: offsetX - width / 2 - 0.6,
          maxX: offsetX + width / 2 + 0.6,
          minZ: center.z - depth / 2 - 0.6,
          maxZ: center.z + depth / 2 + 0.6,
          minY: 0,
          maxY: height
        });

        pedestrianSpawns.push(new Vector3(offsetX + 3, 1, center.z - depth / 2 - 5));
        pedestrianSpawns.push(new Vector3(offsetX - 3, 1, center.z + depth / 2 + 5));

        // Add street props along sidewalks
        createStreetLight(scene, offsetX + width / 2 + 2, center.z - depth / 2 - 3, destructibles, propIdCounter);
        createTrashCan(scene, offsetX - width / 2 - 2, center.z + depth / 2 + 2, destructibles, propIdCounter);

        // Storefront glass on ground floor
        if (slot === 0) {
          createStorefrontGlass(
            scene,
            offsetX,
            center.z + depth / 2 + 0.35,
            width * 0.6,
            3.2,
            destructibles,
            propIdCounter
          );
        }
      }
    }
  }

  pushPedestrianStrip(
    pedestrianSpawns,
    routePoint(GAME_CONFIG.worldMinX + 40, -150),
    routePoint(GAME_CONFIG.worldMaxX - 40, -150),
    10,
    5
  );
  pushPedestrianStrip(
    pedestrianSpawns,
    routePoint(-180, -40),
    routePoint(-180, 140),
    7,
    -5
  );
  pushPedestrianStrip(
    pedestrianSpawns,
    routePoint(155, -80),
    routePoint(155, 130),
    8,
    5
  );
  policePatrolSpawns.push(
    new Vector3(-120, 0, -110),
    new Vector3(110, 0, -70),
    new Vector3(145, 0, 110),
    new Vector3(-30, 0, 125)
  );

  const left = roadCentersX[0] - 14;
  const right = roadCentersX[roadCentersX.length - 1] + 14;
  const top = roadCentersZ[0] - 14;
  const bottom = roadCentersZ[roadCentersZ.length - 1] + 14;
  const innerLeft = roadCentersX[1] - 8;
  const innerRight = roadCentersX[roadCentersX.length - 2] + 8;
  const innerTop = roadCentersZ[1] - 8;
  const innerBottom = roadCentersZ[roadCentersZ.length - 2] + 8;

  const trafficRoutes = [
    [
      routePoint(left, top),
      routePoint(0, top),
      routePoint(right, top),
      routePoint(right, bottom),
      routePoint(0, bottom),
      routePoint(left, bottom)
    ],
    [
      routePoint(innerRight, innerBottom),
      routePoint(innerLeft, innerBottom),
      routePoint(innerLeft, innerTop),
      routePoint(innerRight, innerTop)
    ],
    [
      routePoint(-200, 118),
      routePoint(-90, 118),
      routePoint(40, 118),
      routePoint(210, 118),
      routePoint(210, 160),
      routePoint(20, 160),
      routePoint(-120, 160),
      routePoint(-200, 160)
    ]
  ];

  const randomVehicleClass = (): VehicleClass => {
    const roll = Math.random();
    if (roll < 0.2) return "muscle";
    if (roll < 0.4) return "ev";
    if (roll < 0.6) return "suv";
    if (roll < 0.8) return "bike";
    return "car";
  };

  const routeVehicleType = (routeIndex: number): VehicleClass => {
    return randomVehicleClass();
  };

  const routeVehicleKind = (_routeIndex: number, _nodeIndex: number): VehicleKind => "civilian";

  const trafficSpawns: TrafficSpawn[] = trafficRoutes.flatMap((route, routeIndex) => {
    return route.map((_, nodeIndex) => ({
      routeIndex,
      nodeIndex,
      vehicleClass: routeVehicleType(routeIndex),
      kind: routeVehicleKind(routeIndex, nodeIndex)
    }));
  });

  const parkedSpawns: ParkedSpawn[] = [
    {
      position: new Vector3(-138, -0.02, -104),
      direction: Math.PI / 2,
      vehicleClass: randomVehicleClass(),
      withDriver: false
    },
    {
      position: new Vector3(-118, -0.02, 62),
      direction: -Math.PI / 2,
      vehicleClass: randomVehicleClass(),
      withDriver: false
    },
    {
      position: new Vector3(126, -0.02, -82),
      direction: Math.PI,
      vehicleClass: randomVehicleClass(),
      withDriver: true
    },
    {
      position: new Vector3(164, -0.02, 110),
      direction: Math.PI,
      vehicleClass: randomVehicleClass(),
      withDriver: false
    },
    {
      position: new Vector3(26, -0.02, -138),
      direction: 0,
      vehicleClass: randomVehicleClass(),
      withDriver: false
    },
    {
      position: new Vector3(-32, -0.02, 122),
      direction: Math.PI / 2,
      vehicleClass: randomVehicleClass(),
      withDriver: true
    },
    {
      position: new Vector3(80, -0.02, 40),
      direction: Math.PI / 4,
      vehicleClass: randomVehicleClass(),
      withDriver: false
    },
    {
      position: new Vector3(-70, -0.02, -60),
      direction: 0,
      vehicleClass: randomVehicleClass(),
      withDriver: false
    }
  ];

  const pickupSpawns = [
    { id: "dock-smg", kind: "smg" as const, position: new Vector3(144, 1.2, 108) },
    { id: "midtown-armor", kind: "armor" as const, position: new Vector3(-36, 1.2, -18) },
    { id: "vista-cash", kind: "cash" as const, position: new Vector3(-112, 1.2, 108) }
  ];

  const skylineGlow = [
    new PointLight(0xff9549, 0.5, 48),
    new PointLight(0x6ce7ff, 0.45, 56),
    new PointLight(0xffc16a, 0.4, 44)
  ];

  skylineGlow[0].position.set(-110, 22, -80);
  skylineGlow[1].position.set(124, 24, 56);
  skylineGlow[2].position.set(0, 18, 146);
  skylineGlow.forEach((light) => scene.add(light));

  // ── Create shop locations ──
  const shopLocations: { x: number; z: number; type: ShopType }[] = [
    { x: roadCentersX[0] + 18, z: roadCentersZ[0] - 22, type: "convenience" },
    { x: roadCentersX[2] + 20, z: roadCentersZ[1] + 24, type: "burger" },
    { x: roadCentersX[1] - 20, z: roadCentersZ[2] - 18, type: "clothing" },
    { x: roadCentersX[3] + 16, z: roadCentersZ[0] + 20, type: "convenience" },
    { x: roadCentersX[0] - 16, z: roadCentersZ[2] + 22, type: "burger" }
  ];

  for (const shopLoc of shopLocations) {
    const shopConfig = SHOP_CONFIG.shops[shopLoc.type];
    // Create glowing door marker
    const doorMarker = new Mesh(
      new BoxGeometry(2.5, 3.2, 0.3),
      new MeshLambertMaterial({
        color: 0x00ffcc,
        emissive: 0x00ffcc,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.45
      })
    );
    doorMarker.position.set(shopLoc.x, 1.6, shopLoc.z);
    doorMarker.castShadow = false;
    scene.add(doorMarker);

    // Shop sign above door
    const sign = new Mesh(
      new BoxGeometry(4, 0.8, 0.2),
      new MeshLambertMaterial({
        color: shopLoc.type === "convenience" ? 0x44ff88 : shopLoc.type === "burger" ? 0xff8844 : 0x8844ff,
        emissive: shopLoc.type === "convenience" ? 0x44ff88 : shopLoc.type === "burger" ? 0xff8844 : 0x8844ff,
        emissiveIntensity: 0.9
      })
    );
    sign.position.set(shopLoc.x, 3.6, shopLoc.z);
    scene.add(sign);

    propIdCounter.v++;
    shopSpawns.push({
      id: `shop-${propIdCounter.v}`,
      type: shopLoc.type,
      position: new Vector3(shopLoc.x, 0, shopLoc.z),
      doorMarker,
      items: [...shopConfig.items]
    });
  }

  return {
    colliders,
    walkableZones,
    parallaxLayers,
    pedestrianSpawns,
    policePatrolSpawns,
    pickupSpawns,
    trafficRoutes,
    trafficSpawns,
    parkedSpawns,
    destructibles,
    trafficLights,
    shopSpawns,
    lighting: {
      ambient,
      sun,
      glowLights: skylineGlow
    }
  };
}
