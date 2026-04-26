"use client";

import {
  Box3,
  BoxGeometry,
  Clock,
  Color,
  CylinderGeometry,
  Fog,
  Group,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  AnimationMixer,
  AnimationAction,
  AnimationClip
} from "three";
// @ts-ignore
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
// @ts-ignore
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CHEAT_CODES, CITY_COLORS, GAME_CONFIG, WEAPONS, VEHICLE_PHYSICS, POLICE_CONFIG, FOOTPRINT_CONFIG, PARTICLE_CONFIG, DESTRUCTION_CONFIG, TRAFFIC_LIGHT_CONFIG, NPC_CRIME_CONFIG, SHOP_CONFIG } from "@/game/config";
import { EventBus } from "@/game/core/EventBus";
import { ObjectPool } from "@/game/core/ObjectPool";
import { SpatialHash } from "@/game/core/SpatialHash";
import {
  evaluateNPCState,
  fsmToLegacyState,
  shouldFilm,
  findCoverPosition,
  movePedestrianToward,
  pickNearbyWanderTarget,
  checkLineOfSight,
  getCarjackReaction,
  getAttackReaction,
  pickDailyActivity,
  shouldAttemptCrime,
  pickNPCCrime
} from "@/game/systems/behavior";
import { ParticleSystem } from "@/game/systems/particles";
import type {
  Archetype,
  BulletRecord,
  Collider,
  DestructibleProp,
  EngineEvents,
  HudSnapshot,
  MissionDefinition,
  MissionRuntime,
  ParallaxLayer,
  ParkedSpawn,
  PedestrianEntity,
  PersistenceState,
  PickupEntity,
  PlayerState,
  PoliceSearchPhase,
  SettingKey,
  ShopEntity,
  TrafficLightEntity,
  TrafficSpawn,
  VehicleClass,
  VehicleEntity,
  VehicleKind,
  WalkableZone,
  WeaponId
} from "@/game/types";
import { buildWorld } from "@/game/world/worldGen";

type GameEngineOptions = {
  canvas: HTMLCanvasElement;
  onHudChange: (hud: HudSnapshot) => void;
  onLoadProgress?: (progress: number, label: string) => void;
};

const PLAYER_HEIGHT = 1.05;
const AMBIENT_ARCHETYPES: Archetype[] = ["cautious", "tourist", "hustler", "aggressive"];

export class GameEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly onHudChange: (hud: HudSnapshot) => void;
  private readonly onLoadProgress: (progress: number, label: string) => void;
  private readonly events = new EventBus<EngineEvents>();
  private readonly clock = new Clock();
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(68, 1, 0.1, 800);
  private readonly renderer: WebGLRenderer;
  private readonly keys = new Set<string>();
  private readonly vehicleHash = new SpatialHash<VehicleEntity>(24);
  private readonly pedestrianHash = new SpatialHash<PedestrianEntity>(16);
  private readonly bullets: BulletRecord[] = [];
  private readonly bulletPool: ObjectPool<BulletRecord>;
  private readonly colliders: Collider[] = [];
  private readonly walkableZones: WalkableZone[] = [];
  private readonly parallaxLayers: ParallaxLayer[] = [];
  private readonly vehicles: VehicleEntity[] = [];
  private readonly pedestrians: PedestrianEntity[] = [];
  private readonly pickups: PickupEntity[] = [];
  private readonly missions: MissionRuntime[] = [];
  private readonly completedMissionIds = new Set<string>();
  private readonly collectedPickupIds = new Set<string>();
  private readonly trafficRoutes: Vector3[][] = [];
  private readonly trafficSpawnCatalog: TrafficSpawn[] = [];
  private readonly parkedSpawnCatalog: ParkedSpawn[] = [];
  private readonly pedestrianSpawnCatalog: Vector3[] = [];
  private readonly policePatrolSpawnCatalog: Vector3[] = [];
  private readonly destructibles: DestructibleProp[] = [];
  private readonly trafficLights: TrafficLightEntity[] = [];
  private readonly shops: ShopEntity[] = [];
  private readonly player: PlayerState;
  private particles!: ParticleSystem;

  private cleanupFns: Array<() => void> = [];
  private activeMission: MissionRuntime | null = null;
  private playerYaw = 0;
  private cameraYaw = 0;
  private cameraPitch = 0.32;
  private mouseIdleTimer = 0;
  private recentMouseTurn = 0;
  private cameraCurrent = new Vector3(0, 8, 18);
  private cameraVelocity = new Vector3();
  private cameraLookAt = new Vector3();
  private cameraRoll = 0;
  private accumulator = 0;
  private frameId = 0;
  private running = false;
  private paused = false;
  private wantsShoot = false;
  private aiming = false;
  private worldTime = 0.44;
  private originOffset = new Vector3();
  private notification: HudSnapshot["notification"] = null;
  private notificationUntil = 0;
  private saveScheduled = 0;
  private policeSpawnTimer = 0;
  private recentCheat: string | null = null;
  private cheatBuffer = "";
  private idCounter = 0;

  // ── Neo-Vice 2030 systems ──
  private policeSearchPhase: PoliceSearchPhase = "chase";
  private lastKnownPosition: Vector3 | null = null;
  private policeSearchTimer = 0;
  private policeSearchRadius = 0;
  private losCheckTimer = 0;
  private playerVisibleToPolice = true;
  private breakingNewsTimer = 0;
  private vicegramAlertTimer = 0;
  private smokeEmitTimer = 0;
  private shopOpen = false;
  private activeShopId: string | null = null;
  private introGraceTimer = 12;
  private animationTime = 0;

  private settings = {
    mouseSensitivityIndex: 1,
    trafficDensityIndex: 1,
    crowdDensityIndex: 1,
    showDebug: true
  };

  private externalModels: {
    character: { scene: Group; animations: AnimationClip[] } | null;
    car: { scene: Group } | null;
    car2: { scene: Group } | null;
    policeCar: { scene: Group } | null;
    suv: { scene: Group } | null;
    sportsCar: { scene: Group } | null;
    sportsCar2: { scene: Group } | null;
    taxi: { scene: Group } | null;
    motorcycle: { scene: Group } | null;
    pistol: { scene: Group; animations: AnimationClip[] } | null;
    policeOfficer: { scene: Group } | null;
    cityBuildingLarge: { scene: Group } | null;
    cityBuildingBusiness: { scene: Group } | null;
    cityBuildingMid: { scene: Group } | null;
  } = {
      character: null,
      car: null,
      car2: null,
      policeCar: null,
      suv: null,
      sportsCar: null,
      sportsCar2: null,
      taxi: null,
      motorcycle: null,
      pistol: null,
      policeOfficer: null,
      cityBuildingLarge: null,
      cityBuildingBusiness: null,
      cityBuildingMid: null
    };
  private modelsLoaded = false;

  constructor({ canvas, onHudChange, onLoadProgress }: GameEngineOptions) {
    this.canvas = canvas;
    this.onHudChange = onHudChange;
    this.onLoadProgress = onLoadProgress ?? (() => { });

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.fog = new Fog(0x7aabca, 90, 340);

    this.player = {
      position: new Vector3(0, PLAYER_HEIGHT, 0),
      velocity: new Vector3(),
      mesh: this.createPlayerMesh(),
      health: 100,
      armor: 65,
      cash: 500,
      wanted: 0,
      wantedTimer: 0,
      onGround: true,
      inVehicle: false,
      vehicleId: null,
      weapon: "pistol",
      ammo: {
        pistol: 40,
        smg: 0,
        shotgun: 0
      },
      shootCooldown: 0,
      radius: 0.62,
      digitalFootprint: 0,
      footprintDecayTimer: 0,
      breakingNewsCooldown: 0
    };

    this.scene.add(this.player.mesh);

    this.bulletPool = new ObjectPool<BulletRecord>(
      () => {
        const mesh = new Mesh(
          new SphereGeometry(0.12, 8, 8),
          new MeshLambertMaterial({
            color: 0xffd74a,
            emissive: 0xffd74a,
            emissiveIntensity: 1.6
          })
        );
        mesh.visible = false;
        this.scene.add(mesh);

        return {
          mesh,
          position: new Vector3(),
          velocity: new Vector3(),
          life: 0,
          damage: 0,
          source: "player",
          active: false
        };
      },
      (bullet) => {
        bullet.active = false;
        bullet.life = 0;
        bullet.mesh.visible = false;
      },
      120
    );

    this.worldTime = 'startTime' in GAME_CONFIG ? (GAME_CONFIG as any).startTime : 0.12;

    this.setupMissions();
    this.attachEvents();
    this.resize();
    this.emitHud();
  }

  async start() {
    if (this.running) {
      return;
    }

    this.running = true;

    // Load all GLB models with progress reporting
    await this.loadExternalModels();

    // Now models are ready, bootstrap the world
    this.bootstrapScene();

    this.clock.start();

    await this.hydratePersistence();
    this.notify("Right click aims. F steals or enters nearby vehicles. Escape opens the pause menu.", "info");
    this.tick();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.detachEvents();
    this.persistWorld();
  }

  togglePause(force?: boolean) {
    this.paused = typeof force === "boolean" ? force : !this.paused;

    if (!this.paused) {
      this.notify("Back in the city.", "info");
    }

    this.emitHud();
  }

  cycleSetting(key: SettingKey) {
    if (key === "showDebug") {
      this.settings.showDebug = !this.settings.showDebug;
      this.emitHud();
      return;
    }

    if (key === "mouseSensitivity") {
      this.settings.mouseSensitivityIndex =
        (this.settings.mouseSensitivityIndex + 1) % GAME_CONFIG.mouseSensitivityOptions.length;
      this.emitHud();
      return;
    }

    if (key === "trafficDensity") {
      this.settings.trafficDensityIndex =
        (this.settings.trafficDensityIndex + 1) % GAME_CONFIG.densityOptions.length;
      this.rebalanceAmbientPopulation();
      this.emitHud();
      return;
    }

    this.settings.crowdDensityIndex =
      (this.settings.crowdDensityIndex + 1) % GAME_CONFIG.densityOptions.length;
    this.rebalanceAmbientPopulation();
    this.emitHud();
  }

  private bootstrapScene() {
    const world = buildWorld(this.scene, this.externalModels as any);
    this.colliders.push(...world.colliders);
    this.walkableZones.push(...world.walkableZones);
    this.parallaxLayers.push(...world.parallaxLayers);
    this.trafficRoutes.push(...world.trafficRoutes);
    this.trafficSpawnCatalog.push(...world.trafficSpawns);
    this.parkedSpawnCatalog.push(...world.parkedSpawns);
    this.pedestrianSpawnCatalog.push(...world.pedestrianSpawns);
    this.policePatrolSpawnCatalog.push(...world.policePatrolSpawns);
    this.destructibles.push(...world.destructibles);
    this.trafficLights.push(...world.trafficLights);
    this.shops.push(...world.shopSpawns);
    this.particles = new ParticleSystem(this.scene);

    for (const pickup of world.pickupSpawns) {
      this.createPickup(pickup.id, pickup.position.clone(), pickup.kind);
    }

    this.spawnAmbientPopulation();
    this.spawnAmbientPolicePatrols();
  }

  private spawnAmbientPopulation() {
    const trafficTarget = Math.max(
      3,
      Math.round(GAME_CONFIG.trafficCount * this.currentTrafficDensity())
    );
    const parkedTarget = Math.max(
      4,
      Math.round(GAME_CONFIG.parkedCount * this.currentTrafficDensity())
    );
    const crowdTarget = Math.max(
      10,
      Math.round(GAME_CONFIG.pedestrianCount * this.currentCrowdDensity())
    );

    this.trafficSpawnCatalog.slice(0, trafficTarget).forEach((spawn) => {
      const route = this.trafficRoutes[spawn.routeIndex];
      const position = route[spawn.nodeIndex].clone();
      this.createVehicle({
        id: this.nextId("traffic"),
        position,
        direction: this.directionBetween(
          route[spawn.nodeIndex],
          route[(spawn.nodeIndex + 1) % route.length]
        ),
        kind: spawn.kind,
        vehicleClass: spawn.vehicleClass,
        routeIndex: spawn.routeIndex,
        nodeIndex: spawn.nodeIndex,
        parked: false,
        withDriver: true
      });
    });

    this.parkedSpawnCatalog.slice(0, parkedTarget).forEach((spawn) => {
      this.createVehicle({
        id: this.nextId("parked"),
        position: spawn.position.clone(),
        direction: spawn.direction,
        kind: "civilian",
        vehicleClass: spawn.vehicleClass,
        routeIndex: null,
        nodeIndex: 0,
        parked: true,
        withDriver: spawn.withDriver
      });
    });

    this.pedestrianSpawnCatalog.slice(0, crowdTarget).forEach((position) => {
      this.createPedestrian({
        id: this.nextId("npc"),
        position: position.clone(),
        role: "civilian",
        archetype: this.pickArchetype()
      });
    });
  }

  private spawnAmbientPolicePatrols() {
    this.policePatrolSpawnCatalog.slice(0, 6).forEach((position) => {
      this.createPedestrian({
        id: this.nextId("cop"),
        position: position.clone(),
        role: "cop",
        archetype: "aggressive"
      });
    });
  }

  private rebalanceAmbientPopulation() {
    if (this.player.inVehicle) {
      this.notify("Traffic and crowd density changes apply after you leave the current vehicle.", "info");
      return;
    }

    const removeVehicles = this.vehicles.filter(
      (vehicle) => vehicle.kind === "civilian" && !vehicle.occupiedByPlayer
    );
    removeVehicles.forEach((vehicle) => this.removeVehicle(vehicle));

    const removePeds = this.pedestrians.filter(
      (pedestrian) => pedestrian.role === "civilian" && !pedestrian.inVehicleId
    );
    removePeds.forEach((pedestrian) => this.removePedestrian(pedestrian));

    this.spawnAmbientPopulation();
  }

  private setupMissions() {
    const defs: MissionDefinition[] = [
      {
        id: "ocean-drive",
        name: "Ocean Drive Hustle",
        reward: 750,
        start: new Vector3(138, 0, 114),
        steps: [
          {
            kind: "collect",
            text: "Pick up the dockside SMG package before anyone else notices.",
            target: new Vector3(144, 0, 108),
            radius: 7,
            requiredPickupId: "dock-smg"
          },
          {
            kind: "reach",
            text: "Thread through traffic and bring the haul to the neon exchange.",
            target: new Vector3(112, 0, -94),
            radius: 8
          }
        ]
      },
      {
        id: "midtown-shakedown",
        name: "Midtown Shakedown",
        reward: 900,
        start: new Vector3(-42, 0, -28),
        steps: [
          {
            kind: "collect",
            text: "Grab the armor stash under the awning before the patrol swings back.",
            target: new Vector3(-36, 0, -18),
            radius: 6,
            requiredPickupId: "midtown-armor"
          },
          {
            kind: "loseWanted",
            text: "Cool the heat and stay out of police sight.",
            target: new Vector3(-20, 0, -60),
            radius: 8
          }
        ]
      },
      {
        id: "vista-score",
        name: "Vista Score",
        reward: 1300,
        start: new Vector3(-118, 0, 100),
        steps: [
          {
            kind: "collect",
            text: "Take the hilltop cash drop and do not let the locals box you in.",
            target: new Vector3(-112, 0, 108),
            radius: 7,
            requiredPickupId: "vista-cash"
          },
          {
            kind: "reach",
            text: "Get back across town in one piece.",
            target: new Vector3(118, 0, -82),
            radius: 9
          }
        ]
      }
    ];

    for (const definition of defs) {
      const marker = new Mesh(
        new CylinderGeometry(5.2, 5.2, 0.22, 24),
        new MeshLambertMaterial({
          color: CITY_COLORS.neonOrange,
          emissive: CITY_COLORS.neonOrange,
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.78
        })
      );
      marker.position.copy(definition.start).setY(0.14);

      const beam = new Mesh(
        new CylinderGeometry(0.45, 0.45, 34, 10),
        new MeshLambertMaterial({
          color: CITY_COLORS.neonBlue,
          emissive: CITY_COLORS.neonBlue,
          emissiveIntensity: 0.55,
          transparent: true,
          opacity: 0.22
        })
      );
      beam.position.copy(definition.start).setY(17);

      this.scene.add(marker);
      this.scene.add(beam);

      this.missions.push({
        definition,
        stepIndex: 0,
        active: false,
        completed: false,
        marker,
        beam
      });
    }
  }

  private createPlayerMesh() {
    const group = new Group();
    const addPart = (
      name: string,
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      color: number
    ) => {
      const mesh = new Mesh(
        new BoxGeometry(width, height, depth),
        new MeshLambertMaterial({ color })
      );
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };

    // Torso (Cyan Hawaiian Shirt)
    addPart("torso", 0.72, 0.9, 0.48, 0, 0.95, 0, 0x4fc3f7);
    // Neck (Skin)
    addPart("neck", 0.2, 0.15, 0.2, 0, 1.45, 0, 0xf1c39c);
    // Head (Skin)
    addPart("head", 0.55, 0.55, 0.55, 0, 1.7, 0, 0xf1c39c);
    // Hair (Dark Brown)
    addPart("hair-top", 0.62, 0.18, 0.62, 0, 2.0, 0, 0x2c201d);
    // Hair back/sides
    addPart("hair-back", 0.62, 0.3, 0.2, 0, 1.8, -0.22, 0x2c201d);

    // Left Leg (Blue Jeans)
    addPart("left-leg", 0.32, 0.8, 0.32, -0.22, 0.4, 0, 0x3b5998);
    // Right Leg (Blue Jeans)
    addPart("right-leg", 0.32, 0.8, 0.32, 0.22, 0.4, 0, 0x3b5998);

    // Left Shoe (White sneakers)
    addPart("left-shoe", 0.34, 0.16, 0.44, -0.22, 0.08, 0.06, 0xffffff);
    // Right Shoe (White sneakers)
    addPart("right-shoe", 0.34, 0.16, 0.44, 0.22, 0.08, 0.06, 0xffffff);

    // Left Arm sleeve (Cyan Shirt)
    addPart("left-arm", 0.26, 0.35, 0.26, -0.5, 1.25, 0, 0x4fc3f7);
    // Right Arm sleeve (Cyan Shirt)
    addPart("right-arm", 0.26, 0.35, 0.26, 0.5, 1.25, 0, 0x4fc3f7);

    // Left Forearm (Skin)
    addPart("left-forearm", 0.2, 0.6, 0.2, -0.5, 0.8, 0, 0xf1c39c);
    // Right Forearm (Skin)
    addPart("right-forearm", 0.2, 0.6, 0.2, 0.5, 0.8, 0, 0xf1c39c);

    // Left Hand
    addPart("left-hand", 0.18, 0.2, 0.24, -0.5, 0.45, 0.04, 0xf1c39c);
    // Right Hand
    addPart("right-hand", 0.18, 0.2, 0.24, 0.5, 0.45, 0.04, 0xf1c39c);

    group.position.set(0, 0, 0);
    group.scale.setScalar(1.18);
    return group;
  }

  private createDriverAvatar(color: number) {
    const group = new Group();
    const torso = new Mesh(
      new BoxGeometry(0.34, 0.4, 0.22),
      new MeshLambertMaterial({ color })
    );
    torso.position.y = 0.26;
    const head = new Mesh(
      new BoxGeometry(0.24, 0.24, 0.24),
      new MeshLambertMaterial({ color: 0xf1c39c })
    );
    head.position.y = 0.58;
    group.add(torso);
    group.add(head);
    return group;
  }

  private pickAnimationClip(animations: AnimationClip[], keywords: string[]) {
    return (
      animations.find((clip) => {
        const name = clip.name.toLowerCase();
        return keywords.some((keyword) => name.includes(keyword));
      }) ?? animations[0]
    );
  }

  private groundModelAtOrigin(model: Group) {
    const bounds = new Box3().setFromObject(model);
    const center = new Vector3();
    bounds.getCenter(center);
    model.position.set(-center.x, -bounds.min.y, -center.z);
  }

  private findRightHandBone(model: Group) {
    let rightHand: any = null;
    const candidates = ["wristr", "wrist.r", "righthand", "right_hand", "hand.r", "mixamorig:righthand"];

    model.traverse((node: any) => {
      if (rightHand || !node.isBone) {
        return;
      }
      const boneName = String(node.name ?? "").toLowerCase();
      if (candidates.some((candidate) => boneName.includes(candidate))) {
        rightHand = node;
      }
    });

    return rightHand;
  }

  private attachHeldWeapon(model: Group, scale = 0.0025) {
    if (!this.externalModels.pistol?.scene) {
      return;
    }

    const pistolClone = this.externalModels.pistol.scene.clone();
    pistolClone.name = "held-pistol";
    pistolClone.scale.setScalar(scale);

    const rightHand = this.findRightHandBone(model);
    if (rightHand) {
      pistolClone.position.set(0.03, 0.08, 0.04);
      pistolClone.rotation.set(-Math.PI / 2, 0, 0.12);
      rightHand.add(pistolClone);
      return;
    }

    const bounds = new Box3().setFromObject(model);
    const size = new Vector3();
    bounds.getSize(size);
    pistolClone.position.set(size.x * 0.18, size.y * 0.55, size.z * 0.12);
    pistolClone.rotation.set(-Math.PI / 2, 0, 0.2);
    model.add(pistolClone);
  }

  private pedestrianShouldCarryWeapon(ped: PedestrianEntity) {
    return ped.role === "cop" || ped.archetype === "aggressive" || ped.archetype === "hustler";
  }

  private sampleGroundHeight(position: Vector3) {
    let height = 0;
    for (const zone of this.walkableZones) {
      if (
        position.x >= zone.minX &&
        position.x <= zone.maxX &&
        position.z >= zone.minZ &&
        position.z <= zone.maxZ
      ) {
        if (
          zone.rampAxis &&
          zone.rampStart !== undefined &&
          zone.rampEnd !== undefined &&
          zone.rampStartHeight !== undefined &&
          zone.rampEndHeight !== undefined
        ) {
          const axisValue = zone.rampAxis === "x" ? position.x : position.z;
          const span = zone.rampEnd - zone.rampStart;
          const t = MathUtils.clamp(
            span === 0 ? 0 : (axisValue - zone.rampStart) / span,
            0,
            1
          );
          const rampHeight = this.lerp(zone.rampStartHeight, zone.rampEndHeight, t);
          height = Math.max(height, rampHeight);
        } else {
          height = Math.max(height, zone.height);
        }
      }
    }
    return height;
  }

  private animateFallbackHumanoid(group: Group, movementAmount: number, aiming = false) {
    const leftLeg = group.getObjectByName("left-leg");
    const rightLeg = group.getObjectByName("right-leg");
    const leftArm = group.getObjectByName("left-arm");
    const rightArm = group.getObjectByName("right-arm");
    const leftForearm = group.getObjectByName("left-forearm");
    const rightForearm = group.getObjectByName("right-forearm");
    const head = group.getObjectByName("head");
    const torso = group.getObjectByName("torso");

    const stride = Math.sin(this.animationTime * 9) * movementAmount;
    const counterStride = Math.sin(this.animationTime * 9 + Math.PI) * movementAmount;
    const armSwing = aiming ? movementAmount * 0.18 : movementAmount * 0.7;

    if (leftLeg) leftLeg.rotation.x = stride;
    if (rightLeg) rightLeg.rotation.x = counterStride;
    if (leftArm) leftArm.rotation.x = -stride * armSwing;
    if (rightArm) rightArm.rotation.x = -counterStride * armSwing + (aiming ? -0.45 : 0);
    if (leftForearm) leftForearm.rotation.x = aiming ? -0.2 : -stride * 0.28;
    if (rightForearm) rightForearm.rotation.x = aiming ? -0.9 : -counterStride * 0.28;
    if (head) head.rotation.y = aiming ? 0.12 : Math.sin(this.animationTime * 2.4) * movementAmount * 0.12;
    if (torso) torso.rotation.z = Math.sin(this.animationTime * 4.5) * movementAmount * 0.05;
  }

  private canActorsInteract(firstY: number, secondY: number, threshold = 2.25) {
    return Math.abs(firstY - secondY) <= threshold;
  }

  private colliderBlocksHeight(positionY: number, collider: Collider, halfHeight = PLAYER_HEIGHT) {
    const feet = positionY - halfHeight;
    const head = positionY + halfHeight * 0.95;
    const minY = collider.minY ?? -Infinity;
    const maxY = collider.maxY ?? Infinity;
    return feet < maxY && head > minY;
  }

  private createVehicle(params: {
    id: string;
    position: Vector3;
    direction: number;
    kind: VehicleKind;
    vehicleClass: VehicleClass;
    routeIndex: number | null;
    nodeIndex: number;
    parked: boolean;
    withDriver: boolean;
  }) {
    const group = new Group();
    const wheelMeshes: Mesh[] = [];
    const colorPalette =
      params.kind === "police"
        ? [CITY_COLORS.policeWhite]
        : params.vehicleClass === "bike"
          ? CITY_COLORS.bike
          : params.vehicleClass === "muscle"
            ? CITY_COLORS.muscle
            : params.vehicleClass === "ev"
              ? CITY_COLORS.ev
              : params.vehicleClass === "suv"
                ? CITY_COLORS.suv
                : CITY_COLORS.civilianCar;
    const vehicleColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];

    const physics = VEHICLE_PHYSICS[params.vehicleClass] ?? VEHICLE_PHYSICS.car;

    const bodyMat = new MeshLambertMaterial({
      color: vehicleColor,
      emissive: params.kind === "police" ? CITY_COLORS.neonBlue : vehicleColor,
      emissiveIntensity: params.kind === "police" ? 0.16 : 0.05
    });

    const isFourWheeler = params.vehicleClass !== "bike";

    if (isFourWheeler) {
      // Body length along Z (forward), width along X (sideways)
      const bodyL = params.vehicleClass === "suv" ? 4.8 : params.vehicleClass === "muscle" ? 4.6 : 4.4;
      const bodyH = params.vehicleClass === "suv" ? 1.3 : 1.0;
      const bodyW = params.vehicleClass === "suv" ? 2.4 : 2.15;

      // BoxGeometry(width-X, height-Y, depth-Z) → width=bodyW, depth=bodyL
      const lowerBody = new Mesh(new BoxGeometry(bodyW, bodyH, bodyL), bodyMat);
      lowerBody.position.y = params.vehicleClass === "suv" ? 1.0 : 0.8;
      lowerBody.castShadow = true;
      lowerBody.name = "body-lower";
      group.add(lowerBody);

      if (params.kind === "police") {
        const doorBand = new Mesh(
          new BoxGeometry(2.18, 0.48, 4.45),
          new MeshLambertMaterial({ color: CITY_COLORS.policeBlack })
        );
        doorBand.position.y = 0.76;
        group.add(doorBand);
      }

      const cabinH = params.vehicleClass === "suv" ? 1.1 : 0.9;
      const cabin = new Mesh(
        new BoxGeometry(bodyW - 0.2, cabinH, 2.4),
        new MeshLambertMaterial({
          color: params.kind === "police" ? CITY_COLORS.policeBlack : vehicleColor
        })
      );
      cabin.position.set(0, params.vehicleClass === "suv" ? 1.85 : 1.55, 0.08);
      cabin.name = "body-cabin";
      group.add(cabin);

      const windshield = new Mesh(
        new BoxGeometry(bodyW - 0.3, 0.68, 0.16),
        new MeshLambertMaterial({
          color: params.vehicleClass === "ev" ? 0xc8f7dc : 0xb2d5ff,
          emissive: params.vehicleClass === "ev" ? 0x2ad4bf : 0x5ba8ff,
          emissiveIntensity: 0.28
        })
      );
      windshield.position.set(0, params.vehicleClass === "suv" ? 1.8 : 1.5, 1.02);
      group.add(windshield);

      // Side mirrors
      const sideMirrorL = new Mesh(new BoxGeometry(0.16, 0.12, 0.1), bodyMat);
      sideMirrorL.position.set(-bodyW / 2 - 0.08, params.vehicleClass === "suv" ? 1.7 : 1.4, 0.8);
      group.add(sideMirrorL);

      const sideMirrorR = new Mesh(new BoxGeometry(0.16, 0.12, 0.1), bodyMat);
      sideMirrorR.position.set(bodyW / 2 + 0.08, params.vehicleClass === "suv" ? 1.7 : 1.4, 0.8);
      group.add(sideMirrorR);

      const wheelR = params.vehicleClass === "suv" ? 0.52 : 0.42;
      const wheelSpread = params.vehicleClass === "suv" ? 1.3 : 1.18;
      // Wheels: [z-forward, x-side] — front pair at +Z, rear at -Z
      [
        [-wheelSpread, 1.55],
        [wheelSpread, 1.55],
        [-wheelSpread, -1.55],
        [wheelSpread, -1.55]
      ].forEach(([x, z]) => {
        const wheel = new Mesh(
          new CylinderGeometry(wheelR, wheelR, 0.28, 12),
          new MeshLambertMaterial({ color: 0x171717 })
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, wheelR, z);
        group.add(wheel);
        wheelMeshes.push(wheel);
      });

      const headlight = new Mesh(
        new BoxGeometry(1.5, 0.22, 0.16),
        new MeshLambertMaterial({
          color: params.vehicleClass === "ev" ? 0xccffee : 0xfff5dd,
          emissive: params.vehicleClass === "ev" ? 0x2ad4bf : 0xffd58b,
          emissiveIntensity: 0.65
        })
      );
      headlight.position.set(0, 0.86, bodyL / 2 - 0.02);
      group.add(headlight);

      // Tail light
      const taillight = new Mesh(
        new BoxGeometry(1.3, 0.18, 0.12),
        new MeshLambertMaterial({
          color: 0xff2222,
          emissive: 0xff2222,
          emissiveIntensity: 0.5
        })
      );
      taillight.position.set(0, 0.86, -bodyL / 2 + 0.02);
      group.add(taillight);

      // Muscle car: hood scoop (on top, toward front)
      if (params.vehicleClass === "muscle") {
        const scoop = new Mesh(new BoxGeometry(0.6, 0.3, 0.8), bodyMat);
        scoop.position.set(0, 1.45, 1.4);
        group.add(scoop);
      }

      // EV: charge port indicator (on side, toward rear)
      if (params.vehicleClass === "ev") {
        const port = new Mesh(
          new BoxGeometry(0.08, 0.2, 0.2),
          new MeshLambertMaterial({ color: 0x2ad4bf, emissive: 0x2ad4bf, emissiveIntensity: 1.2 })
        );
        port.position.set(1.08, 0.9, -1.8);
        group.add(port);
      }
    } else {
      // Bike: frame runs along Z (long axis = forward)
      const frame = new Mesh(new BoxGeometry(0.35, 0.3, 2.45), bodyMat);
      frame.position.y = 0.92;
      frame.castShadow = true;
      group.add(frame);

      const tank = new Mesh(new BoxGeometry(0.5, 0.5, 0.92), bodyMat);
      tank.position.set(0, 1.22, 0.15);
      group.add(tank);

      const seat = new Mesh(
        new BoxGeometry(0.38, 0.16, 0.84),
        new MeshLambertMaterial({ color: 0x131313 })
      );
      seat.position.set(0, 1.15, -0.42);
      group.add(seat);

      // Bike wheels: along Z axis (front +Z, rear -Z)
      [1.08, -1.02].forEach((z) => {
        const wheel = new Mesh(
          new CylinderGeometry(0.54, 0.54, 0.18, 14),
          new MeshLambertMaterial({ color: 0x121212 })
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(0, 0.54, z);
        group.add(wheel);
        wheelMeshes.push(wheel);
      });

      // Handlebar
      const handlebar = new Mesh(
        new BoxGeometry(0.7, 0.08, 0.14),
        new MeshLambertMaterial({ color: 0x333333 })
      );
      handlebar.position.set(0, 1.35, 0.85);
      group.add(handlebar);
    }

    let driverAvatar: Group | null = null;
    if (params.withDriver) {
      driverAvatar = this.createDriverAvatar(params.kind === "police" ? 0x224faa : 0xb74d4d);
      // Driver sits on the side (X offset) for cars, centered for bikes
      driverAvatar.position.set(isFourWheeler ? -0.35 : 0, 1.0, isFourWheeler ? 0 : -0.3);
      driverAvatar.rotation.y = 0;
      group.add(driverAvatar);
    }

    if (params.kind === "police" && isFourWheeler) {
      const leftBar = new Mesh(
        new BoxGeometry(0.48, 0.14, 0.26),
        new MeshLambertMaterial({ color: 0xff3232, emissive: 0xff3232, emissiveIntensity: 0.8 })
      );
      const rightBar = new Mesh(
        new BoxGeometry(0.48, 0.14, 0.26),
        new MeshLambertMaterial({ color: 0x3f72ff, emissive: 0x3f72ff, emissiveIntensity: 0.8 })
      );
      leftBar.position.set(-0.28, 2.08, 0);
      rightBar.position.set(0.28, 2.08, 0);
      leftBar.name = "siren-left";
      rightBar.name = "siren-right";
      group.add(leftBar);
      group.add(rightBar);
    }

    group.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    group.position.copy(params.position);
    group.rotation.y = params.direction;
    this.scene.add(group);

    const vPhysics = VEHICLE_PHYSICS[params.vehicleClass] ?? VEHICLE_PHYSICS.car;
    const hpVal = params.kind === "police" ? 90 : vPhysics.hp;

    const vehicle: VehicleEntity = {
      id: params.id,
      mesh: group,
      position: params.position,
      direction: params.direction,
      speed: params.parked ? 0 : params.kind === "police" ? 0 : Math.min(11, vPhysics.topSpeed * 0.6),
      kind: params.kind,
      vehicleClass: params.vehicleClass,
      occupiedByPlayer: false,
      driverPedId: null,
      parked: params.parked,
      hp: hpVal,
      maxHp: hpVal,
      routeIndex: params.routeIndex,
      nodeIndex: params.nodeIndex,
      radius: params.vehicleClass === "bike" ? 1.3 : params.vehicleClass === "suv" ? 2.7 : 2.4,
      maxSpeed: vPhysics.topSpeed,
      wheelMeshes,
      driverAvatar,
      sirenTimer: 0,
      dents: [],
      damageLevel: 0,
      vehicleHeat: params.kind === "police" ? 0.15 : vPhysics.heat,
      smoking: false,
      originalColor: vehicleColor,
      mass: vPhysics.mass,
      traction: vPhysics.traction,
      accelRate: vPhysics.accelRate,
      blockedTimer: 0,
      exploded: false,
      burnTimer: 0,
      fireTimer: 0,
      onFire: false
    };

    this.vehicles.push(vehicle);
    this.vehicleHash.insert(vehicle);

    if (params.withDriver) {
      this.attachDriverToVehicle(vehicle, params.kind === "police" ? "cop" : "driver");
    }

    // Apply GLB vehicle model if loaded
    if (this.modelsLoaded) {
      this.applyVehicleGLB(vehicle);
    }

    return vehicle;
  }

  private attachDriverToVehicle(vehicle: VehicleEntity, role: "driver" | "cop") {
    const driver = this.createPedestrian({
      id: this.nextId(role),
      position: vehicle.position.clone().setY(0),
      role,
      archetype: role === "cop" ? "aggressive" : this.pickArchetype(),
      inVehicleId: vehicle.id
    });
    driver.mesh.visible = false;
    vehicle.driverPedId = driver.id;
    if (vehicle.driverAvatar) {
      vehicle.driverAvatar.visible = true;
    }
  }

  private createPedestrian(params: {
    id: string;
    position: Vector3;
    role: "civilian" | "cop" | "driver";
    archetype: Archetype;
    inVehicleId?: string | null;
  }) {
    const group = new Group();
    params.position.y = params.inVehicleId ? params.position.y : this.sampleGroundHeight(params.position);
    const addPart = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
      const mesh = new Mesh(new BoxGeometry(w, h, d), new MeshLambertMaterial({ color }));
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    const shirtColor =
      params.role === "cop"
        ? 0x1d3d9f
        : params.archetype === "tourist"
          ? 0xe28c4e
          : params.archetype === "hustler"
            ? 0x8c5ac2
            : params.archetype === "aggressive"
              ? 0xc74f4f
              : 0x5a9ad3;

    const pantsColor = params.role === "cop" ? 0x152238 : (Math.random() > 0.5 ? 0x3b5998 : 0x242424);
    const skinColor = Math.random() > 0.4 ? 0xf1c39c : 0x8d5524;

    // Torso
    addPart("torso", 0.6, 0.9, 0.4, 0, 0.95, 0, shirtColor);
    // Head
    addPart("head", 0.5, 0.5, 0.5, 0, 1.7, 0, skinColor);
    // Left Leg
    addPart("left-leg", 0.28, 0.8, 0.28, -0.16, 0.4, 0, pantsColor);
    // Right Leg
    addPart("right-leg", 0.28, 0.8, 0.28, 0.16, 0.4, 0, pantsColor);
    // Left Arm
    addPart("left-arm", 0.22, 0.7, 0.22, -0.42, 1.0, 0, skinColor);
    // Right Arm
    addPart("right-arm", 0.22, 0.7, 0.22, 0.42, 1.0, 0, skinColor);

    if (params.role === "cop") {
      // Cop Hat
      addPart("hat", 0.55, 0.12, 0.55, 0, 2.0, 0.05, 0x111a33);
    }

    group.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    group.position.copy(params.position);
    this.scene.add(group);

    const hpVal = params.role === "cop" ? 65 : 40;
    const pedestrian: PedestrianEntity = {
      id: params.id,
      mesh: group,
      position: params.position,
      target: pickNearbyWanderTarget(params.position, 26),
      speed: params.role === "cop" ? 4.5 : params.role === "driver" ? 2.3 : 2.0 + Math.random() * 1.2,
      state: params.role === "cop" ? "patrol" : "wander",
      role: params.role,
      archetype: params.archetype,
      panicTimer: 0,
      hp: hpVal,
      maxHp: hpVal,
      cooldown: 0,
      reactionTimer: 0,
      inVehicleId: params.inVehicleId ?? null,
      radius: 0.48,
      fsmState: "idle",
      fsmTimer: 0,
      threatDistance: Infinity,
      hasLineOfSight: false,
      coverTarget: null,
      filmingTimer: 0,
      bloodTimer: 0,
      knockedBack: false,
      knockVelocity: new Vector3(),
      dailyActivity: "walking",
      dailyActivityTimer: 0,
      angerTimer: 0,
      crimeTargetId: null,
      crimeCooldown: 0,
      pursuitTarget: null,
      pursuitTargetId: null
    };

    this.pedestrians.push(pedestrian);
    this.pedestrianHash.insert(pedestrian);

    // Apply GLB character model if loaded
    if (this.externalModels.character) {
      this.applyCharacterModelToPed(pedestrian);
    }

    return pedestrian;
  }

  private createPickup(id: string, position: Vector3, kind: PickupEntity["kind"]) {
    const color = kind === "smg" ? 0x5be6ff : kind === "armor" ? 0x76d47d : 0xffc56a;
    const group = new Group();

    const core = new Mesh(
      new BoxGeometry(1.05, 1.05, 1.05),
      new MeshLambertMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.9
      })
    );
    const ring = new Mesh(
      new CylinderGeometry(1.24, 1.24, 0.12, 18),
      new MeshLambertMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.4
      })
    );
    ring.position.y = -0.52;
    group.add(core);
    group.add(ring);
    group.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    group.position.copy(position);
    this.scene.add(group);

    this.pickups.push({
      id,
      mesh: group,
      position,
      kind,
      taken: false
    });
  }

  private attachEvents() {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        this.togglePause();
        return;
      }

      this.captureCheatInput(event);

      if (this.paused) {
        return;
      }

      this.keys.add(event.code);

      if (["Digit1", "Digit2", "Digit3", "Digit4"].includes(event.code)) {
        const weapons: WeaponId[] = ["fists", "pistol", "smg", "shotgun"];
        const next = weapons[Number(event.code.replace("Digit", "")) - 1];
        this.selectWeapon(next);
      }

      if (event.code === "KeyF") {
        this.toggleVehicle();
      }

      if (event.code === "KeyE") {
        this.toggleShop();
      }

      if (event.code === "KeyQ") {
        this.tryPickup();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      this.keys.delete(event.code);
    };

    const onMouseDown = (event: MouseEvent) => {
      if (this.paused) {
        return;
      }

      if (document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }

      if (event.button === 0) {
        this.wantsShoot = true;
      }

      if (event.button === 2) {
        this.aiming = true;
        event.preventDefault();
      }
    };

    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 2) {
        this.aiming = false;
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (this.paused || document.pointerLockElement !== this.canvas) {
        return;
      }

      const sensitivity = GAME_CONFIG.mouseSensitivityOptions[this.settings.mouseSensitivityIndex];
      this.cameraYaw += event.movementX * 0.003 * sensitivity;
      this.cameraPitch = Math.max(
        -0.3,
        Math.min(0.85, this.cameraPitch + event.movementY * 0.003 * sensitivity)
      );
      this.mouseIdleTimer = 0;
      this.recentMouseTurn = Math.min(1.5, this.recentMouseTurn + Math.abs(event.movementX) * 0.01);
    };

    const onResize = () => this.resize();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", onResize);
    window.addEventListener("contextmenu", this.preventContextMenu);

    this.cleanupFns = [
      () => window.removeEventListener("keydown", onKeyDown),
      () => window.removeEventListener("keyup", onKeyUp),
      () => window.removeEventListener("mousedown", onMouseDown),
      () => window.removeEventListener("mouseup", onMouseUp),
      () => window.removeEventListener("mousemove", onMouseMove),
      () => window.removeEventListener("resize", onResize),
      () => window.removeEventListener("contextmenu", this.preventContextMenu)
    ];

    this.events.on("notify", (payload) => {
      this.notification = payload;
      this.notificationUntil = performance.now() + 2800;
    });
  }

  private detachEvents() {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
  }

  private async loadExternalModels() {
    const loader = new GLTFLoader();

    type ModelKey =
      | "character"
      | "car"
      | "car2"
      | "policeCar"
      | "suv"
      | "sportsCar"
      | "sportsCar2"
      | "taxi"
      | "motorcycle"
      | "pistol"
      | "policeOfficer"
      | "cityBuildingLarge"
      | "cityBuildingBusiness"
      | "cityBuildingMid"
      | "bldWall"
      | "bldWindowSqr"
      | "bldWindowWide"
      | "bldDoor"
      | "bldRoof";
    const modelDefs: { key: ModelKey; path: string; label: string; scale: number; hasAnims?: boolean }[] = [
      { key: "character", path: "/models/character.glb", label: "Main Character", scale: 1.08, hasAnims: true },
      { key: "car", path: "/models/car.glb", label: "Car", scale: 1.0 },
      { key: "car2", path: "/models/car-2.glb", label: "Car Variant", scale: 1.0 },
      { key: "policeCar", path: "/models/police-car.glb", label: "Police Car", scale: 1.0 },
      { key: "suv", path: "/models/suv.glb", label: "SUV", scale: 1.0 },
      { key: "sportsCar", path: "/models/sports-car.glb", label: "Sports Car", scale: 1.0 },
      { key: "sportsCar2", path: "/models/sports-car-2.glb", label: "Sports Car 2", scale: 1.0 },
      { key: "taxi", path: "/models/taxi.glb", label: "Taxi", scale: 1.0 },
      { key: "motorcycle", path: "/models/motorcycle.glb", label: "Motorcycle", scale: 1.0 },
      { key: "pistol", path: "/models/pistol.glb", label: "Pistol", scale: 1.0, hasAnims: true },
      { key: "policeOfficer", path: "/models/internet/police-officer.glb", label: "Police Officer", scale: 1.0 },
      { key: "cityBuildingLarge", path: "/models/internet/large-building.glb", label: "Large Building", scale: 1.0 },
      { key: "cityBuildingBusiness", path: "/models/internet/business-building.glb", label: "Business Building", scale: 1.0 },
      { key: "cityBuildingMid", path: "/models/internet/city-building.glb", label: "City Building", scale: 1.0 },
      { key: "bldWall", path: "/models/building/Wall.glb", label: "Wall Model", scale: 1.0 },
      { key: "bldWindowSqr", path: "/models/building/Wall Window Square.glb", label: "Window Square", scale: 1.0 },
      { key: "bldWindowWide", path: "/models/building/Wall Window Wide.glb", label: "Window Wide", scale: 1.0 },
      { key: "bldDoor", path: "/models/building/Wooden Door.glb", label: "Door Model", scale: 1.0 },
      { key: "bldRoof", path: "/models/building/Roof Flat Center.glb", label: "Roof Model", scale: 1.0 }
    ];

    const total = modelDefs.length;
    let loaded = 0;

    const loadOne = (def: typeof modelDefs[0]): Promise<void> => {
      return new Promise<void>((resolve) => {
        loader.load(
          def.path,
          (gltf: any) => {
            const model = gltf.scene as Group;
            model.traverse((child: any) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            if (def.hasAnims) {
              (this.externalModels as any)[def.key] = { scene: model, animations: gltf.animations ?? [] };
            } else {
              (this.externalModels as any)[def.key] = { scene: model };
            }
            loaded++;
            this.onLoadProgress((loaded / total) * 100, `Loaded ${def.label} (${loaded}/${total})`);
            resolve();
          },
          undefined,
          (err: any) => {
            console.warn(`Failed to load model ${def.path}:`, err);
            loaded++;
            this.onLoadProgress((loaded / total) * 100, `Skipped ${def.label} (${loaded}/${total})`);
            resolve();
          }
        );
      });
    };

    this.onLoadProgress(0, "Loading 3D models...");
    await Promise.all(modelDefs.map(loadOne));
    this.modelsLoaded = true;
    this.onLoadProgress(100, "All models loaded!");

    // Apply character model to player and all existing pedestrians
    this.applyCharacterModelToPlayer();
    for (const ped of this.pedestrians) {
      this.applyCharacterModelToPed(ped);
    }

    // Apply vehicle models to all existing vehicles
    for (const vehicle of this.vehicles) {
      this.applyVehicleGLB(vehicle);
    }
  }

  /** Pick the correct vehicle GLB model based on vehicleClass and vehicleKind */
  private pickVehicleModel(vehicleClass: VehicleClass, vehicleKind: VehicleKind): Group | null {
    if (vehicleClass === "bike") {
      return this.externalModels.motorcycle?.scene ?? null;
    }
    if (vehicleKind === "police") {
      return this.externalModels.policeCar?.scene ?? null;
    }
    if (vehicleClass === "suv") {
      return this.externalModels.suv?.scene ?? null;
    }
    if (vehicleClass === "muscle") {
      return this.externalModels.sportsCar2?.scene ?? null;
    }
    // For car/ev, pick randomly from available car models
    const carModels: (Group | undefined)[] = [
      this.externalModels.car?.scene,
      this.externalModels.car2?.scene,
      this.externalModels.sportsCar?.scene,
      this.externalModels.taxi?.scene
    ].filter(Boolean) as Group[];
    if (carModels.length === 0) return null;
    return carModels[Math.floor(Math.random() * carModels.length)] ?? null;
  }

  /** Replace procedural vehicle mesh with GLB clone, preserving physics/collision */
  private applyVehicleGLB(vehicle: VehicleEntity) {
    const sourceModel = this.pickVehicleModel(vehicle.vehicleClass, vehicle.kind);
    if (!sourceModel) return;

    const cloned = sourceModel.clone();

    // Compute bounding box to determine model dimensions
    const box = new Box3();
    cloned.updateMatrixWorld(true);
    box.setFromObject(cloned);
    const modelSize = new Vector3();
    box.getSize(modelSize);

    // Determine target dimensions based on vehicle class
    let targetLength: number, targetWidth: number, targetHeight: number;
    if (vehicle.vehicleClass === "bike") {
      targetLength = 2.6;
      targetWidth = 0.8;
      targetHeight = 1.6;
    } else if (vehicle.vehicleClass === "suv") {
      targetLength = 4.8;
      targetWidth = 2.4;
      targetHeight = 2.3;
    } else {
      targetLength = 4.4;
      targetWidth = 2.15;
      targetHeight = 2.0;
    }

    // Use the smallest scale ratio to fit within target bounds
    const scaleX = modelSize.x > 0.01 ? targetWidth / modelSize.x : 1;
    const scaleY = modelSize.y > 0.01 ? targetHeight / modelSize.y : 1;
    const scaleZ = modelSize.z > 0.01 ? targetLength / modelSize.z : 1;
    let uniformScale = Math.min(scaleX, scaleY, scaleZ);
    // Give cars a slight visual boost just in case
    uniformScale *= 1.05;
    cloned.scale.setScalar(uniformScale);

    // Recompute bounds after scaling
    cloned.updateMatrixWorld(true);
    box.setFromObject(cloned);
    const center = new Vector3();
    box.getCenter(center);

    // Position so the model sits on the ground and is centered.
    cloned.position.set(-center.x, -box.min.y, -center.z);
    cloned.rotation.y = 0;

    // Remove old procedural children but keep named items we need
    const driverAvatar = vehicle.driverAvatar;
    const sirenLeft = vehicle.mesh.getObjectByName("siren-left");
    const sirenRight = vehicle.mesh.getObjectByName("siren-right");

    // Save references to preserve
    const preserveObjects: any[] = [];
    if (driverAvatar && driverAvatar.parent === vehicle.mesh) preserveObjects.push(driverAvatar);
    if (sirenLeft) preserveObjects.push(sirenLeft);
    if (sirenRight) preserveObjects.push(sirenRight);

    // Clear old children
    while (vehicle.mesh.children.length > 0) {
      const child = vehicle.mesh.children[0];
      vehicle.mesh.remove(child);
    }

    // Add GLB model
    vehicle.mesh.add(cloned);

    // Restore preserved objects
    for (const obj of preserveObjects) {
      if (obj === driverAvatar) {
        // Adjust driver avatar height so they don't stick out roof
        obj.position.y += 0.2;
      }
      vehicle.mesh.add(obj);
    }

    // Clear wheel references (GLB has its own wheels baked in)
    vehicle.wheelMeshes.length = 0;
  }

  private applyCharacterModelToPlayer() {
    if (!this.externalModels.character) return;
    const { scene, animations } = this.externalModels.character;
    const cloned = cloneSkinned(scene) as Group;

    // Compute model bounds for proper sizing
    const box3 = new Box3();
    cloned.updateMatrixWorld(true);
    box3.setFromObject(cloned);
    const size = new Vector3();
    box3.getSize(size);
    // Scale to fit approximately 2.1 units tall (PLAYER_HEIGHT * 2)
    const targetH = PLAYER_HEIGHT * 2;
    const s = size.y > 0.01 ? targetH / size.y : 1;
    cloned.scale.setScalar(s);

    cloned.updateMatrixWorld(true);
    box3.setFromObject(cloned);
    this.groundModelAtOrigin(cloned);
    cloned.rotation.y = 0;

    const mixer = new AnimationMixer(cloned);
    let idleAction: AnimationAction | undefined;
    let runAction: AnimationAction | undefined;
    let walkAction: AnimationAction | undefined;
    let aimAction: AnimationAction | undefined;
    let shootAction: AnimationAction | undefined;

    if (animations.length > 0) {
      const idleClip = this.pickAnimationClip(animations, ["idle", "stand"]);
      const runClip = this.pickAnimationClip(animations, ["run", "sprint"]);
      const walkClip = this.pickAnimationClip(animations, ["walk", "run"]);
      const aimClip = this.pickAnimationClip(animations, ["aim", "rifle", "pistol", "idle"]);
      const shootClip = this.pickAnimationClip(animations, ["shoot", "fire", "attack", "punch", "aim"]);

      if (idleClip) { idleAction = mixer.clipAction(idleClip); idleAction.play(); }
      if (runClip) { runAction = mixer.clipAction(runClip); }
      if (walkClip) { walkAction = mixer.clipAction(walkClip); }
      if (aimClip) { aimAction = mixer.clipAction(aimClip); }
      if (shootClip) { shootAction = mixer.clipAction(shootClip); }
    }

    const oldGroup = this.player.mesh;
    while (oldGroup.children.length > 0) {
      oldGroup.remove(oldGroup.children[0]);
    }
    oldGroup.scale.setScalar(1);

    this.attachHeldWeapon(cloned);

    oldGroup.add(cloned);

    this.player.mixer = mixer;
    if (idleAction) this.player.idleAction = idleAction;
    if (runAction) this.player.runAction = runAction;
    if (walkAction) this.player.walkAction = walkAction;
    if (aimAction) this.player.aimAction = aimAction;
    if (shootAction) this.player.shootAction = shootAction;
  }

  private applyCharacterModelToPed(ped: PedestrianEntity) {
    const usePoliceModel = ped.role === "cop" && this.externalModels.policeOfficer;
    const source = usePoliceModel ? this.externalModels.policeOfficer : this.externalModels.character;
    if (!source) return;

    const cloned = usePoliceModel ? source.scene.clone() : cloneSkinned(source.scene) as Group;
    const animations: AnimationClip[] =
      "animations" in source ? (source.animations as AnimationClip[]) : [];

    const box3 = new Box3();
    cloned.updateMatrixWorld(true);
    box3.setFromObject(cloned);
    const size = new Vector3();
    box3.getSize(size);
    const targetH = ped.role === "cop" ? 1.95 : 1.8 + Math.random() * 0.3;
    const s = size.y > 0.01 ? targetH / size.y : 1;
    cloned.scale.setScalar(s);

    cloned.updateMatrixWorld(true);
    box3.setFromObject(cloned);
    this.groundModelAtOrigin(cloned);
    cloned.rotation.y = 0;

    const mixer = animations.length > 0 ? new AnimationMixer(cloned) : undefined;
    let idleAction: AnimationAction | undefined;
    let runAction: AnimationAction | undefined;
    let walkAction: AnimationAction | undefined;
    let aimAction: AnimationAction | undefined;
    let shootAction: AnimationAction | undefined;

    if (mixer && animations.length > 0) {
      const idleClip = this.pickAnimationClip(animations, ["idle", "stand"]);
      const runClip = this.pickAnimationClip(animations, ["run", "sprint"]);
      const walkClip = this.pickAnimationClip(animations, ["walk", "run"]);
      const aimClip = this.pickAnimationClip(animations, ["aim", "rifle", "pistol", "idle"]);
      const shootClip = this.pickAnimationClip(animations, ["shoot", "fire", "attack", "punch", "aim"]);

      if (idleClip) { idleAction = mixer.clipAction(idleClip); }
      if (runClip) { runAction = mixer.clipAction(runClip); }
      if (walkClip) { walkAction = mixer.clipAction(walkClip); walkAction.play(); }
      if (aimClip) { aimAction = mixer.clipAction(aimClip); }
      if (shootClip) { shootAction = mixer.clipAction(shootClip); }
      mixer.setTime(Math.random() * 2);
    }

    const oldGroup = ped.mesh;
    while (oldGroup.children.length > 0) {
      oldGroup.remove(oldGroup.children[0]);
    }

    if (this.pedestrianShouldCarryWeapon(ped)) {
      this.attachHeldWeapon(cloned, 0.0022);
    }

    oldGroup.add(cloned);

    ped.mixer = mixer;
    ped.idleAction = idleAction;
    ped.runAction = runAction;
    ped.walkAction = walkAction;
    ped.aimAction = aimAction;
    ped.shootAction = shootAction;
  }

  private preventContextMenu = (event: Event) => {
    event.preventDefault();
  };

  private resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private tick = () => {
    if (!this.running) {
      return;
    }

    this.frameId = requestAnimationFrame(this.tick);

    if (this.paused) {
      this.updateVisuals(0);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const rawDt = Math.min(this.clock.getDelta(), 0.08);
    this.accumulator += rawDt;

    let steps = 0;
    while (this.accumulator >= GAME_CONFIG.fixedStep && steps < GAME_CONFIG.maxPhysicsSteps) {
      this.updateSimulation(GAME_CONFIG.fixedStep);
      this.accumulator -= GAME_CONFIG.fixedStep;
      steps += 1;
    }

    this.updateVisuals(rawDt);
    this.renderer.render(this.scene, this.camera);
  };

  private updateSimulation(dt: number) {
    this.introGraceTimer = Math.max(0, this.introGraceTimer - dt);
    this.animationTime += dt;
    this.recentMouseTurn = Math.max(0, this.recentMouseTurn - dt * 1.8);
    this.player.shootCooldown = Math.max(0, this.player.shootCooldown - dt);
    this.policeSpawnTimer = Math.max(0, this.policeSpawnTimer - dt);
    this.updatePlayer(dt);
    this.updateVehicles(dt);
    this.updatePedestrians(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateMissions();
    this.updateWanted(dt);
    this.updateDigitalFootprint(dt);
    this.updateDestructibles(dt);
    this.updatePoliceSearch(dt);
    this.updateTrafficLights(dt);
    this.updateNPCCrimes(dt);
    this.updateShops(dt);
    this.particles.update(dt);
    this.updateFloatingOrigin();
    this.schedulePersistence(dt);
  }

  private updatePlayer(dt: number) {
    if (this.shopOpen) {
      // Player is in a shop — freeze movement
      this.player.mesh.visible = false;
      return;
    }

    if (this.player.inVehicle) {
      const vehicle = this.getOccupiedVehicle();
      if (vehicle) {
        this.updateDrivenVehicle(vehicle, dt);
        this.player.position.copy(vehicle.position).setY(this.sampleGroundHeight(vehicle.position) + PLAYER_HEIGHT);
        this.playerYaw = vehicle.direction;

        // Bike: show player sitting on it; Car: hide player
        if (vehicle.vehicleClass === "bike") {
          this.player.mesh.visible = true;
          this.player.mesh.position.copy(vehicle.position);
          this.player.mesh.position.y = 0.3; // sit height on bike
          this.player.mesh.rotation.y = vehicle.direction;
        } else {
          this.player.mesh.visible = false;
        }
      }
      this.tryShoot();
      return;
    }

    this.player.mesh.visible = true;
    const previous = this.player.position.clone();
    const forward = new Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    const right = new Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));
    const move = new Vector3();

    if (this.keys.has("KeyW")) move.add(forward);
    if (this.keys.has("KeyS")) move.addScaledVector(forward, -1);
    if (this.keys.has("KeyA")) move.addScaledVector(right, -1);
    if (this.keys.has("KeyD")) move.add(right);

    if (move.lengthSq() > 0) {
      move.normalize();
      const isSprinting = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && !this.aiming;
      const speed = this.aiming ? GAME_CONFIG.playerAimSpeed : (GAME_CONFIG.playerSpeed * (isSprinting ? 1.6 : 1.0));
      this.player.position.addScaledVector(move, speed * dt);
      if (!this.aiming) {
        const targetYaw = Math.atan2(move.x, move.z);
        this.playerYaw = this.rotateTowards(this.playerYaw, targetYaw, dt * 10);
      }
    }

    if (this.aiming) {
      this.playerYaw = this.cameraYaw;
    }

    this.player.mesh.rotation.y = this.playerYaw;
    const groundHeight = this.sampleGroundHeight(this.player.position) + PLAYER_HEIGHT;

    if (this.keys.has("Space") && this.player.onGround) {
      this.player.velocity.y = GAME_CONFIG.jumpVelocity;
      this.player.onGround = false;
    }

    if (this.player.onGround) {
      if (this.player.position.y <= groundHeight + 0.45) {
        this.player.position.y = groundHeight;
        this.player.velocity.y = 0;
      } else {
        this.player.onGround = false;
      }
    }

    if (!this.player.onGround) {
      this.player.velocity.y += GAME_CONFIG.gravity * dt;
      this.player.position.y += this.player.velocity.y * dt;
      const landingHeight = this.sampleGroundHeight(this.player.position) + PLAYER_HEIGHT;
      if (this.player.position.y <= landingHeight) {
        this.player.position.y = landingHeight;
        this.player.velocity.y = 0;
        this.player.onGround = true;
      }
    }

    this.resolveStaticColliders(this.player.position, this.player.radius);
    this.resolveDynamicVehicleCollision(this.player.position, this.player.radius, null);
    this.resolveCrowdCollision(this.player.position, this.player.radius, null);
    this.clampWorld(this.player.position);

    const isMoving = this.player.position.distanceTo(previous) > 0.015;
    if (!this.player.inVehicle && this.player.mixer) {
      this.player.mixer.update(dt);

      let targetAction: AnimationAction | undefined;
      if (this.aiming && this.player.aimAction) {
        targetAction = this.player.aimAction;
      } else {
        const wantsRun = isMoving && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && !this.aiming;
        targetAction = isMoving ? (wantsRun ? this.player.runAction : this.player.walkAction) : this.player.idleAction;
      }

      if (targetAction && !targetAction.isRunning()) {
        this.player.idleAction?.stop();
        this.player.walkAction?.stop();
        this.player.runAction?.stop();
        this.player.aimAction?.stop();
        targetAction.play();
      }
    } else if (!this.player.inVehicle) {
      this.animateFallbackHumanoid(this.player.mesh, isMoving ? (this.aiming ? 0.24 : 0.78) : 0.04, this.aiming);
    }

    if (this.player.position.distanceTo(previous) < 0.001 && (move && move.lengthSq() > 0)) {
      this.player.velocity.set(0, this.player.velocity.y, 0);
    }

    this.player.mesh.position.copy(this.player.position).setY(this.player.position.y - PLAYER_HEIGHT);
    this.tryShoot();
  }

  private tryShoot() {
    if (!this.wantsShoot) {
      return;
    }

    this.wantsShoot = false;

    if (this.player.shootCooldown > 0) {
      return;
    }

    if (this.player.weapon === "fists") {
      this.doMelee();
      this.player.shootCooldown = WEAPONS.fists.cooldown;
      return;
    }

    const ammoKey = this.player.weapon as Exclude<WeaponId, "fists">;
    if (this.player.ammo[ammoKey] <= 0) {
      this.notify("Out of ammo. Grab a glowing stash or swap weapons.", "danger");
      return;
    }

    this.player.ammo[ammoKey] -= 1;
    this.player.shootCooldown = WEAPONS[this.player.weapon].cooldown;

    if (this.player.shootAction) {
      // Forcefully reset the animation and play it once
      this.player.shootAction.reset().setLoop(2200, 1).play(); // 2200 is LoopOnce in three.js
    }

    const origin = this.player.position.clone().setY(this.player.inVehicle ? 1.6 : 1.45);
    const direction = this.getAimDirection();
    const spread =
      this.player.weapon === "smg" ? 0.05 : this.player.weapon === "shotgun" ? 0.12 : 0.012;
    const pelletCount = this.player.weapon === "shotgun" ? 6 : 1;

    for (let pellet = 0; pellet < pelletCount; pellet += 1) {
      const pelletDirection = direction.clone();
      pelletDirection.x += (Math.random() - 0.5) * spread;
      pelletDirection.y += (Math.random() - 0.5) * spread * 0.35;
      pelletDirection.z += (Math.random() - 0.5) * spread;
      pelletDirection.normalize();
      this.spawnBullet(origin, pelletDirection, "player", WEAPONS[this.player.weapon].damage);
    }

    this.addWanted(1);
  }

  private doMelee() {
    const nearby = this.pedestrianHash.query(this.player.position, WEAPONS.fists.range + 1.2);
    let hit = false;

    for (const pedestrian of nearby) {
      if (pedestrian.inVehicleId) {
        continue;
      }

      const distance = pedestrian.position.distanceTo(this.player.position);
      if (distance > WEAPONS.fists.range) {
        continue;
      }

      pedestrian.hp -= WEAPONS.fists.damage;
      pedestrian.panicTimer = 6;
      // Archetype-based attack reaction
      pedestrian.state = pedestrian.role === "cop" ? "attack" : getAttackReaction(pedestrian);
      if (pedestrian.state === "attack") {
        pedestrian.angerTimer = NPC_CRIME_CONFIG.angerDuration;
      }
      pedestrian.bloodTimer = 1.0;
      hit = true;

      // Blood splatter from fist hit
      const hitDir = pedestrian.position.clone().sub(this.player.position).normalize();
      this.particles.spawnBloodSplatter(pedestrian.position, hitDir);

      if (pedestrian.role === "civilian" || pedestrian.role === "driver") {
        this.player.cash += 20;
        this.player.digitalFootprint = Math.min(FOOTPRINT_CONFIG.maxScore, this.player.digitalFootprint + FOOTPRINT_CONFIG.crimePublicScore);
      } else {
        this.addWanted(2);
      }
    }

    if (hit) {
      this.notify("Close-range hit landed.", "success");
    }
  }

  private spawnBullet(
    origin: Vector3,
    direction: Vector3,
    source: "player" | "police",
    damage: number
  ) {
    const bullet = this.bulletPool.acquire();
    if (!bullet) {
      return;
    }

    bullet.active = true;
    bullet.life = source === "player" ? 1.6 : 1.2;
    bullet.damage = damage;
    bullet.source = source;
    bullet.position.copy(origin);
    bullet.velocity.copy(direction.multiplyScalar(source === "player" ? GAME_CONFIG.bulletSpeed : 52));
    bullet.mesh.position.copy(origin);
    bullet.mesh.visible = true;
    this.bullets.push(bullet);
  }

  private updateVehicles(dt: number) {
    this.ensurePolicePresence();

    for (const vehicle of this.vehicles) {
      if (vehicle.exploded) {
        vehicle.burnTimer -= dt;
        if (vehicle.burnTimer <= 0) {
          this.removeVehicle(vehicle);
        }
        continue;
      }

      if (vehicle.onFire) {
        vehicle.fireTimer -= dt;
        if (vehicle.fireTimer <= 0) {
          this.explodeVehicle(vehicle);
          continue;
        }
      }

      const previous = vehicle.position.clone();

      if (vehicle.kind === "police" && this.player.wanted > 0 && !vehicle.occupiedByPlayer) {
        this.updatePoliceVehicle(vehicle, dt);
      } else if (vehicle.occupiedByPlayer) {
        vehicle.mesh.position.copy(vehicle.position);
        vehicle.mesh.rotation.y = vehicle.direction;
      } else if (vehicle.routeIndex !== null && !vehicle.parked) {
        this.updateTrafficVehicle(vehicle, dt);
      }

      if (!vehicle.occupiedByPlayer) {
        this.resolveStaticColliders(vehicle.position, vehicle.radius);
        this.resolveVehicleOverlap(vehicle, previous);
      }

      this.resolveVehicleActorContacts(vehicle);

      vehicle.mesh.position.copy(vehicle.position);
      vehicle.mesh.rotation.y = vehicle.direction;
      this.vehicleHash.update(vehicle);
      vehicle.mesh.visible = vehicle.position.distanceTo(this.player.position) < 220;
      this.animateVehicle(vehicle, dt);
    }

    if (this.player.wanted === 0) {
      const extraPolice = this.vehicles.filter(
        (vehicle) => vehicle.kind === "police" && !vehicle.occupiedByPlayer
      );
      extraPolice.slice(2).forEach((vehicle) => this.removeVehicle(vehicle));
    }
  }

  private moveVehicleWithCollision(vehicle: VehicleEntity, dt: number) {
    const stepDistance = Math.max(0.7, vehicle.radius * 0.65);
    const totalDistance = Math.abs(vehicle.speed) * dt;
    const steps = Math.max(1, Math.ceil(totalDistance / stepDistance));
    const stepDt = dt / steps;

    for (let index = 0; index < steps; index += 1) {
      const previous = vehicle.position.clone();
      vehicle.position.x += Math.sin(vehicle.direction) * vehicle.speed * stepDt;
      vehicle.position.z += Math.cos(vehicle.direction) * vehicle.speed * stepDt;
      this.resolveStaticColliders(vehicle.position, vehicle.radius);
      this.resolveVehicleOverlap(vehicle, previous);
    }
  }

  private updateTrafficVehicle(vehicle: VehicleEntity, dt: number) {
    const route = vehicle.routeIndex !== null ? this.trafficRoutes[vehicle.routeIndex] : null;
    if (!route || route.length === 0) {
      return;
    }

    const target = route[(vehicle.nodeIndex + 1) % route.length];
    const distance = vehicle.position.distanceTo(target);
    if (distance < 12) {
      vehicle.nodeIndex = (vehicle.nodeIndex + 1) % route.length;
    }

    const desiredDir = this.directionBetween(vehicle.position, target);
    vehicle.direction = this.rotateTowards(vehicle.direction, desiredDir, dt * 1.65);

    const obstacleFactor = this.trafficObstacleFactor(vehicle);
    const trafficLightFactor = this.trafficLightFactor(vehicle);

    if (obstacleFactor < 0.2 && trafficLightFactor > 0.5) {
      vehicle.blockedTimer = (vehicle.blockedTimer || 0) + dt;
      if (vehicle.blockedTimer > 3 && vehicle.driverPedId) {
        const driver = this.pedestrians.find(p => p.id === vehicle.driverPedId);
        if (driver) {
          const roll = Math.random();
          if (driver.archetype === "aggressive") {
            if (roll < 0.4) {
              this.ejectDriver(vehicle);
              driver.state = "attack";
              driver.angerTimer = 10;
            } else {
              // Ram player
              vehicle.speed = vehicle.maxSpeed;
              vehicle.blockedTimer = 0;
            }
          } else if (driver.archetype === "hustler" || roll < 0.2) {
            vehicle.direction += Math.PI / 6 * (Math.random() > 0.5 ? 1 : -1);
            vehicle.blockedTimer = 0;
          } else {
            this.ejectDriver(vehicle);
            driver.state = "flee";
          }
        }
      }
    } else {
      vehicle.blockedTimer = 0;
    }

    const cruiseSpeed = vehicle.vehicleClass === "bike" ? vehicle.maxSpeed * 0.55 : vehicle.maxSpeed * 0.68;
    const targetSpeed = cruiseSpeed * obstacleFactor * trafficLightFactor;
    vehicle.speed = this.lerp(vehicle.speed, targetSpeed, dt * 2.2);
    this.moveVehicleWithCollision(vehicle, dt);
  }

  private updatePoliceVehicle(vehicle: VehicleEntity, dt: number) {
    const playerVehicle = this.player.inVehicle ? this.getOccupiedVehicle() : null;
    const speedEstimate = playerVehicle ? playerVehicle.speed : (this.aiming ? GAME_CONFIG.playerAimSpeed : GAME_CONFIG.playerSpeed);
    const heading = playerVehicle ? playerVehicle.direction : this.playerYaw;
    const prediction = new Vector3(Math.sin(heading) * speedEstimate, 0, Math.cos(heading) * speedEstimate).multiplyScalar(1.2);

    const targetPosition = this.player.position.clone().add(prediction);
    const desiredDir = this.directionBetween(vehicle.position, targetPosition);
    vehicle.direction = this.rotateTowards(vehicle.direction, desiredDir, dt * 2.8);
    vehicle.speed = this.lerp(vehicle.speed, vehicle.maxSpeed + (this.player.wanted > 2 ? 6 : 3), dt * 2.5);

    const obstacleFactor = this.trafficObstacleFactor(vehicle);
    if (obstacleFactor < 0.3) {
      if (Math.random() > 0.5) vehicle.direction += dt * 0.8;
      vehicle.speed *= 0.85;
    }

    // Separation from other police cars to prevent pile-up
    const nearby = this.vehicleHash.query(vehicle.position, vehicle.radius + 4);
    for (const other of nearby) {
      if (other.id !== vehicle.id && other.kind === "police") {
        const toOther = other.position.clone().sub(vehicle.position);
        if (toOther.length() < vehicle.radius + other.radius + 1) {
          vehicle.direction -= (toOther.x * toOther.z > 0 ? 1 : -1) * dt * 2.5;
          vehicle.speed *= 0.95;
        }
      }
    }

    this.moveVehicleWithCollision(vehicle, dt);
  }

  private updateDrivenVehicle(vehicle: VehicleEntity, dt: number) {
    const accelerating = this.keys.has("KeyW");
    const braking = this.keys.has("KeyS");
    const turnLeft = this.keys.has("KeyA");
    const turnRight = this.keys.has("KeyD");

    const topSpeed = vehicle.maxSpeed + (vehicle.vehicleClass === "bike" ? 4 : 5);
    if (accelerating) {
      vehicle.speed = Math.min(topSpeed, vehicle.speed + dt * (vehicle.vehicleClass === "bike" ? 24 : 19));
    } else if (braking) {
      vehicle.speed = Math.max(-6, vehicle.speed - dt * 24);
    } else {
      vehicle.speed = this.lerp(vehicle.speed, 0, dt * 3.8);
    }

    const steerFactor = vehicle.vehicleClass === "bike" ? 2.4 : 1.85;
    const steerDirection = vehicle.speed >= 0 ? 1 : -1;
    const steerScale = Math.min(1, Math.max(0.2, Math.abs(vehicle.speed) / Math.max(1, topSpeed)));
    if (turnLeft) vehicle.direction += dt * steerFactor * steerDirection * steerScale;
    if (turnRight) vehicle.direction -= dt * steerFactor * steerDirection * steerScale;

    this.moveVehicleWithCollision(vehicle, dt);

    const impactedPed = this.pedestrianHash
      .query(vehicle.position, vehicle.radius + 1.2)
      .filter((pedestrian) => !pedestrian.inVehicleId);
    impactedPed.forEach((pedestrian) => {
      const away = pedestrian.position.clone().sub(vehicle.position);
      away.y = 0;
      if (away.lengthSq() < 0.01) {
        away.set(1, 0, 0);
      }
      away.normalize();
      pedestrian.position.addScaledVector(away, 0.9);
      pedestrian.state = "flee";
      pedestrian.panicTimer = 6;
    });

    if (Math.abs(vehicle.speed) > 18) {
      const witnessedByPolice =
        this.pedestrians.some(
          (pedestrian) =>
            pedestrian.role === "cop" &&
            pedestrian.position.distanceTo(vehicle.position) < 28 &&
            checkLineOfSight(pedestrian.position, vehicle.position, this.colliders)
        ) ||
        this.vehicles.some(
          (other) =>
            other.kind === "police" &&
            other.id !== vehicle.id &&
            other.position.distanceTo(vehicle.position) < 34
        );

      if (witnessedByPolice) {
        this.addWanted(1, false);
      }
    }
  }

  private trafficObstacleFactor(vehicle: VehicleEntity) {
    const nearby = this.vehicleHash.query(vehicle.position, vehicle.radius + 7);
    for (const other of nearby) {
      if (other.id === vehicle.id || other.driverPedId === vehicle.driverPedId) {
        continue;
      }

      const toOther = other.position.clone().sub(vehicle.position);
      const distance = toOther.length();
      if (distance > vehicle.radius + other.radius + 4) {
        continue;
      }

      const facing = new Vector3(Math.sin(vehicle.direction), 0, Math.cos(vehicle.direction));
      if (toOther.normalize().dot(facing) > 0.75) {
        return Math.max(0, (distance - vehicle.radius - other.radius) / 4);
      }
    }

    return 1;
  }

  private animateVehicle(vehicle: VehicleEntity, dt: number) {
    vehicle.wheelMeshes.forEach((wheel) => {
      wheel.rotation.x += vehicle.speed * dt * 1.8;
    });

    if (vehicle.kind === "police") {
      vehicle.sirenTimer += dt * 8;
      const left = vehicle.mesh.getObjectByName("siren-left") as Mesh | null;
      const right = vehicle.mesh.getObjectByName("siren-right") as Mesh | null;
      if (left?.material instanceof MeshLambertMaterial) {
        left.material.emissiveIntensity = Math.sin(vehicle.sirenTimer) > 0 ? 1.6 : 0.15;
      }
      if (right?.material instanceof MeshLambertMaterial) {
        right.material.emissiveIntensity = Math.sin(vehicle.sirenTimer) > 0 ? 0.15 : 1.6;
      }
    }
  }

  private updatePedestrians(dt: number) {
    const isThreatening = this.aiming || this.player.wanted > 0;

    for (const pedestrian of this.pedestrians) {
      const previousPosition = pedestrian.position.clone();
      pedestrian.cooldown = Math.max(0, pedestrian.cooldown - dt);
      pedestrian.reactionTimer = Math.max(0, pedestrian.reactionTimer - dt);
      pedestrian.bloodTimer = Math.max(0, pedestrian.bloodTimer - dt);
      pedestrian.angerTimer = Math.max(0, pedestrian.angerTimer - dt);
      pedestrian.crimeCooldown = Math.max(0, pedestrian.crimeCooldown - dt);

      // Blood flash effect — tint body red when recently hit
      if (pedestrian.bloodTimer > 0) {
        const bodyMesh = pedestrian.mesh.children[0] as Mesh;
        if (bodyMesh?.material instanceof MeshLambertMaterial) {
          bodyMesh.material.emissive.setHex(CITY_COLORS.bloodBright);
          bodyMesh.material.emissiveIntensity = pedestrian.bloodTimer * 0.8;
        }
      }

      // Knockback physics (from vehicle hit)
      if (pedestrian.knockedBack) {
        pedestrian.knockVelocity.y += GAME_CONFIG.gravity * dt * 0.4;
        pedestrian.position.addScaledVector(pedestrian.knockVelocity, dt);
        if (pedestrian.position.y <= 0) {
          pedestrian.position.y = 0;
          pedestrian.knockedBack = false;
          pedestrian.knockVelocity.set(0, 0, 0);
        }
      }

      if (pedestrian.inVehicleId) {
        const vehicle = this.vehicles.find((c) => c.id === pedestrian.inVehicleId);
        if (vehicle) pedestrian.position.copy(vehicle.position);
        pedestrian.mesh.visible = false;
        continue;
      }

      // Run FSM evaluation for civilians
      if (pedestrian.role !== "cop") {
        // LOS check (every few frames for perf)
        if (pedestrian.fsmTimer % 0.5 < dt) {
          pedestrian.hasLineOfSight = checkLineOfSight(
            pedestrian.position, this.player.position, this.colliders
          );
        }

        const newBrainState = evaluateNPCState(pedestrian, this.player, isThreatening, dt);
        pedestrian.fsmState = newBrainState;
        pedestrian.state = fsmToLegacyState(newBrainState, pedestrian, this.player);

        // ViceGram filming — alarmed/curious NPCs with LOS add digital footprint
        if (shouldFilm(pedestrian, this.player)) {
          pedestrian.filmingTimer += dt;
          if (pedestrian.filmingTimer > 2) {
            pedestrian.filmingTimer = 0;
            this.player.digitalFootprint = Math.min(
              FOOTPRINT_CONFIG.maxScore,
              this.player.digitalFootprint + FOOTPRINT_CONFIG.filmingUploadScore
            );
          }
        }

        if (pedestrian.panicTimer > 0) {
          pedestrian.panicTimer = Math.max(0, pedestrian.panicTimer - dt);
        }

        // Daily activity timer management
        if (pedestrian.dailyActivityTimer > 0) {
          pedestrian.dailyActivityTimer -= dt;
          if (pedestrian.dailyActivityTimer <= 0) {
            pedestrian.dailyActivityTimer = 0;
            pedestrian.dailyActivity = "walking";
            pedestrian.mesh.scale.y = 1; // restore from sitting
          }
        }

        const desiredState = pedestrian.state;

        if (desiredState === "angry") {
          // Carjacked NPCs: aggressive/hustler chase player, attack if close
          movePedestrianToward(pedestrian, this.player.position, pedestrian.speed * 1.3, dt);
          if (pedestrian.position.distanceTo(this.player.position) < 2.0 && pedestrian.cooldown === 0) {
            pedestrian.cooldown = 1.4;
            this.applyDamage(8);
            this.notify("The carjacked driver is fighting back!", "danger");
          }
          // Anger fades out → go back to wander
          if (pedestrian.angerTimer <= 0) {
            pedestrian.state = "wander";
          }
        } else if (desiredState === "flee") {
          // Self-preservation: seek cover behind buildings
          if (pedestrian.fsmState === "selfPreservation" && !pedestrian.coverTarget) {
            pedestrian.coverTarget = findCoverPosition(pedestrian, this.player, this.colliders);
          }

          const fleeTarget = pedestrian.coverTarget ?? null;
          if (fleeTarget && pedestrian.fsmState === "selfPreservation") {
            movePedestrianToward(pedestrian, fleeTarget, pedestrian.speed * 1.8, dt);
            if (pedestrian.position.distanceTo(fleeTarget) < 2) {
              pedestrian.mesh.scale.y = 0.65;
            }
          } else {
            const away = pedestrian.position.clone().sub(this.player.position);
            away.y = 0;
            if (away.lengthSq() < 0.01) away.set(1, 0, 0);
            away.normalize();
            pedestrian.position.addScaledVector(away, pedestrian.speed * 1.6 * dt);
            pedestrian.mesh.rotation.y = Math.atan2(away.x, away.z);
            pedestrian.mesh.scale.y = 1;
          }
        } else if (desiredState === "observe") {
          const facing = this.player.position.clone().sub(pedestrian.position);
          facing.y = 0;
          if (facing.lengthSq() > 0.01) {
            pedestrian.mesh.rotation.y = Math.atan2(facing.x, facing.z);
          }
          if (pedestrian.fsmState === "alarmed") {
            const away = pedestrian.position.clone().sub(this.player.position);
            away.y = 0;
            away.normalize();
            pedestrian.position.addScaledVector(away, pedestrian.speed * 0.5 * dt);
          }
          if (pedestrian.position.distanceTo(pedestrian.target) < 1.2) {
            pedestrian.target = pickNearbyWanderTarget(pedestrian.position, 14);
          }
        } else if (desiredState === "attack") {
          movePedestrianToward(pedestrian, this.player.position, pedestrian.speed * 1.05, dt);
          if (pedestrian.position.distanceTo(this.player.position) < 1.6 && pedestrian.cooldown === 0) {
            pedestrian.cooldown = 1.1;
            this.applyDamage(6);
          }
        } else if (desiredState === "daily_activity") {
          // NPC is doing a daily activity
          switch (pedestrian.dailyActivity) {
            case "window_shopping":
              // Stand still and face a nearby building
              pedestrian.mesh.scale.y = 1;
              break;
            case "sitting_bench":
              // Scale down to simulate sitting
              pedestrian.mesh.scale.y = 0.7;
              break;
            case "phone_checking":
              // Stand still, subtly sway
              pedestrian.mesh.position.y = Math.sin(performance.now() * 0.003) * 0.02;
              break;
            case "talking_group":
              // Face the nearest NPC  
              const nearestNpc = this.pedestrianHash.query(pedestrian.position, 6)
                .find(p => p.id !== pedestrian.id && !p.inVehicleId);
              if (nearestNpc) {
                const faceDir = nearestNpc.position.clone().sub(pedestrian.position);
                faceDir.y = 0;
                if (faceDir.lengthSq() > 0.01) {
                  pedestrian.mesh.rotation.y = Math.atan2(faceDir.x, faceDir.z);
                }
              }
              break;
            default: // walking — do normal wander
              if (pedestrian.position.distanceTo(pedestrian.target) < 1.4) {
                pedestrian.target = pickNearbyWanderTarget(pedestrian.position, 16);
              }
              movePedestrianToward(pedestrian, pedestrian.target, pedestrian.speed * 0.7, dt);
              break;
          }
        } else if (desiredState === "npc_steal" || desiredState === "npc_rob" || desiredState === "npc_attack") {
          // NPC crime behavior — handled in updateNPCCrimes
          // Just move toward crime target
          if (pedestrian.crimeTargetId) {
            const target = this.pedestrians.find(p => p.id === pedestrian.crimeTargetId);
            if (target && !target.inVehicleId) {
              movePedestrianToward(pedestrian, target.position, pedestrian.speed * 1.2, dt);
              if (pedestrian.position.distanceTo(target.position) < 1.8 && pedestrian.cooldown === 0) {
                pedestrian.cooldown = 2.0;
                target.hp -= 12;
                target.state = "flee";
                target.panicTimer = 8;
                target.bloodTimer = 1.0;
                this.particles.spawnBloodSplatter(target.position, pedestrian.position.clone().sub(target.position).normalize());
                // Nearby police notice
                this.alertPoliceToNPCCrime(pedestrian);
              }
            } else {
              // Target gone, stop crime
              pedestrian.state = "wander";
              pedestrian.crimeTargetId = null;
            }
          } else {
            pedestrian.state = "wander";
          }
        } else {
          // Wander — may start a daily activity
          pedestrian.coverTarget = null;
          pedestrian.mesh.scale.y = 1;

          // Chance to start a daily activity
          if (pedestrian.dailyActivityTimer <= 0 && Math.random() < 0.002) {
            const { activity, duration } = pickDailyActivity();
            pedestrian.dailyActivity = activity;
            pedestrian.dailyActivityTimer = duration;
          }

          if (pedestrian.position.distanceTo(pedestrian.target) < 1.4) {
            pedestrian.target = pickNearbyWanderTarget(pedestrian.position, 24);
          }
          movePedestrianToward(pedestrian, pedestrian.target, pedestrian.speed, dt);
        }
      } else {
        // Cop behavior
        if (this.player.wanted > 0) {
          pedestrian.state = "pursue";
          pedestrian.pursuitTarget = "player";
          pedestrian.pursuitTargetId = null;
          movePedestrianToward(pedestrian, this.player.position, pedestrian.speed * 1.1, dt);

          if (pedestrian.cooldown === 0 && pedestrian.position.distanceTo(this.player.position) < 18) {
            pedestrian.cooldown = 1.35;
            const direction = this.player.position.clone().sub(pedestrian.position).normalize();
            direction.y = 0.08;
            this.spawnBullet(pedestrian.position.clone().setY(1.45), direction.normalize(), "police", 10);
          }

          if (pedestrian.position.distanceTo(this.player.position) < 1.8 && pedestrian.cooldown === 0) {
            pedestrian.cooldown = 1.0;
            this.applyDamage(10);
          }
        } else {
          // Check if any NPC is committing a crime nearby — pursue them
          const criminalNpc = this.pedestrians.find(
            p => (p.state === "npc_steal" || p.state === "npc_rob" || p.state === "npc_attack") &&
              p.position.distanceTo(pedestrian.position) < NPC_CRIME_CONFIG.policeNoticeRange
          );

          if (criminalNpc && this.introGraceTimer === 0) {
            pedestrian.state = "pursue";
            pedestrian.pursuitTarget = "npc";
            pedestrian.pursuitTargetId = criminalNpc.id;
            movePedestrianToward(pedestrian, criminalNpc.position, pedestrian.speed * 1.0, dt);
            // Arrest (knock out) criminal NPC if close
            if (pedestrian.position.distanceTo(criminalNpc.position) < 2.0 && pedestrian.cooldown === 0) {
              pedestrian.cooldown = 2.0;
              criminalNpc.hp -= 25;
              criminalNpc.state = "flee";
              criminalNpc.crimeTargetId = null;
              criminalNpc.panicTimer = 10;
              this.notify("Police arrested a criminal NPC.", "info");
            }
          } else {
            pedestrian.state = "patrol";
            pedestrian.pursuitTarget = null;
            pedestrian.pursuitTargetId = null;
            if (pedestrian.position.distanceTo(pedestrian.target) < 1.4) {
              pedestrian.target = pickNearbyWanderTarget(pedestrian.position, 18);
            }
            movePedestrianToward(pedestrian, pedestrian.target, pedestrian.speed * 0.7, dt);
          }
        }
      }

      if (pedestrian.mixer) {
        pedestrian.mixer.update(dt);
        const moving = pedestrian.position.distanceTo(previousPosition) > 0.01;
        if (moving && pedestrian.walkAction && !pedestrian.walkAction.isRunning()) {
          pedestrian.idleAction?.stop();
          pedestrian.runAction?.stop();
          pedestrian.walkAction.play();
        } else if (!moving && pedestrian.idleAction && !pedestrian.idleAction.isRunning()) {
          pedestrian.walkAction?.stop();
          pedestrian.runAction?.stop();
          pedestrian.idleAction.play();
        }
      } else {
        this.animateFallbackHumanoid(pedestrian.mesh, pedestrian.position.distanceTo(previousPosition) > 0.01 ? 0.5 : 0.03);
      }

      if (!pedestrian.knockedBack) {
        pedestrian.position.y = this.sampleGroundHeight(pedestrian.position);
      }

      this.resolveStaticColliders(pedestrian.position, pedestrian.radius);
      this.resolveDynamicVehicleCollision(pedestrian.position, pedestrian.radius, pedestrian.inVehicleId);
      this.resolveCrowdCollision(pedestrian.position, pedestrian.radius, pedestrian.id);

      const playerOffset = pedestrian.position.clone().sub(this.player.position);
      playerOffset.y = 0;
      let playerDistance = playerOffset.length();
      const playerMin = pedestrian.radius + this.player.radius;

      if (playerDistance < playerMin && !this.player.inVehicle && this.canActorsInteract(this.player.position.y, pedestrian.position.y)) {
        if (playerDistance < 0.0001) {
          playerOffset.set(1, 0, 0);
          playerDistance = 0.0001;
        }
        playerOffset.normalize();
        const push = (playerMin - playerDistance) * 0.5;
        pedestrian.position.addScaledVector(playerOffset, push);
        this.player.position.addScaledVector(playerOffset, -push);
      }

      this.clampWorld(pedestrian.position);
      pedestrian.mesh.position.copy(pedestrian.position);
      pedestrian.mesh.visible = pedestrian.position.distanceTo(this.player.position) < 150;
      this.pedestrianHash.update(pedestrian);
    }

    for (let index = this.pedestrians.length - 1; index >= 0; index -= 1) {
      const ped = this.pedestrians[index];
      if (ped.hp > 0) continue;
      // Spawn blood pool on death
      this.particles.spawnBloodPool(ped.position);
      this.removePedestrian(ped);
    }
  }

  private updateBullets(dt: number) {
    for (let index = this.bullets.length - 1; index >= 0; index -= 1) {
      const bullet = this.bullets[index];
      bullet.life -= dt;

      if (bullet.life <= 0) {
        this.recycleBullet(index);
        continue;
      }

      const stepCount = Math.max(1, Math.ceil(bullet.velocity.length() * dt / 14));
      const step = bullet.velocity.clone().multiplyScalar(dt / stepCount);
      let hit = false;

      for (let sub = 0; sub < stepCount && !hit; sub += 1) {
        bullet.position.add(step);
        hit = this.collidesWithBuildings(bullet.position);

        if (!hit && bullet.source === "player") {
          const pedHit = this.pedestrianHash.query(bullet.position, 2).find((pedestrian) => {
            return !pedestrian.inVehicleId && pedestrian.position.distanceTo(bullet.position) < 1.05;
          });

          if (pedHit) {
            pedHit.hp -= bullet.damage;
            pedHit.state = pedHit.role === "cop" ? "attack" : getAttackReaction(pedHit);
            if (pedHit.state === "attack") {
              pedHit.angerTimer = NPC_CRIME_CONFIG.angerDuration;
            }
            pedHit.panicTimer = 6;
            pedHit.bloodTimer = 1.2;
            hit = true;

            // Blood splatter + spark from bullet hit
            const impactDir = bullet.velocity.clone().normalize();
            this.particles.spawnBloodSplatter(pedHit.position, impactDir);
            this.particles.spawnSparks(bullet.position, impactDir);

            if (pedHit.role === "civilian" || pedHit.role === "driver") {
              this.player.cash += 40;
              this.addWanted(1);
              this.player.digitalFootprint = Math.min(FOOTPRINT_CONFIG.maxScore, this.player.digitalFootprint + FOOTPRINT_CONFIG.crimePublicScore);
            } else {
              this.addWanted(2);
            }
          }

          const vehicleHit = !hit
            ? this.vehicleHash.query(bullet.position, 4).find((vehicle) => {
              return vehicle.position.distanceTo(bullet.position) < vehicle.radius;
            })
            : null;

          if (vehicleHit) {
            vehicleHit.hp -= bullet.damage;
            vehicleHit.damageLevel = Math.min(1, 1 - vehicleHit.hp / vehicleHit.maxHp);
            hit = true;

            // Sparks + debris from vehicle bullet hit
            this.particles.spawnSparks(bullet.position, bullet.velocity.clone().normalize());
            if (vehicleHit.damageLevel > 0.5) vehicleHit.smoking = true;

            if (vehicleHit.hp <= 0) {
              this.disableVehicle(vehicleHit);
            }

            if (vehicleHit.kind === "police") {
              this.addWanted(1);
            }
          }
        }

        if (!hit && bullet.source === "police") {
          if (bullet.position.distanceTo(this.player.position) < this.player.radius + 0.4) {
            hit = true;
            this.applyDamage(8);
          }
        }
      }

      bullet.mesh.position.copy(bullet.position);

      if (hit) {
        this.recycleBullet(index);
      }
    }
  }

  private updatePickups(dt: number) {
    for (const pickup of this.pickups) {
      if (pickup.taken) {
        pickup.mesh.visible = false;
        continue;
      }

      pickup.mesh.rotation.y += dt * 0.95;
      pickup.mesh.position.y =
        pickup.position.y +
        Math.sin(performance.now() * 0.002 + pickup.position.x * 0.08) * 0.18;
    }
  }

  private updateMissions() {
    if (!this.activeMission) {
      for (const mission of this.missions) {
        if (mission.completed) {
          mission.marker.visible = false;
          mission.beam.visible = false;
          continue;
        }

        mission.marker.rotation.y += 0.015;
        if (mission.definition.start.distanceTo(this.player.position) < 8) {
          mission.active = true;
          mission.stepIndex = 0;
          this.activeMission = mission;
          this.notify(`${mission.definition.name} started.`, "success");
          break;
        }
      }
      return;
    }

    const mission = this.activeMission;
    const step = mission.definition.steps[mission.stepIndex];
    if (!step) {
      return;
    }

    if (step.kind === "reach" && step.target.distanceTo(this.player.position) <= step.radius) {
      mission.stepIndex += 1;
      this.notify("Step complete.", "success");
    }

    if (step.kind === "loseWanted" && this.player.wanted === 0) {
      mission.stepIndex += 1;
      this.notify("Heat is gone. Move.", "success");
    }

    if (
      step.kind === "collect" &&
      step.requiredPickupId &&
      this.collectedPickupIds.has(step.requiredPickupId)
    ) {
      mission.stepIndex += 1;
      this.notify("Package secured.", "success");
    }

    if (mission.stepIndex >= mission.definition.steps.length) {
      mission.completed = true;
      mission.active = false;
      mission.marker.visible = false;
      mission.beam.visible = false;
      this.completedMissionIds.add(mission.definition.id);
      this.activeMission = null;
      this.player.cash += mission.definition.reward;
      this.notify(`${mission.definition.name} cleared. +$${mission.definition.reward}`, "success");
      this.persistWorld();
    }
  }

  private updateWanted(dt: number) {
    if (this.player.wanted <= 0) {
      return;
    }

    const policePursuing =
      this.pedestrians.some(
        (p) =>
          p.role === "cop" &&
          p.pursuitTarget === "player" &&
          p.position.distanceTo(this.player.position) < 65 &&
          checkLineOfSight(p.position, this.player.position, this.colliders)
      ) ||
      this.vehicles.some(
        (v) =>
          v.kind === "police" &&
          v.position.distanceTo(this.player.position) < 72 &&
          checkLineOfSight(v.position, this.player.position, this.colliders)
      );

    if (policePursuing) {
      this.player.wantedTimer = GAME_CONFIG.wantedDecaySeconds;
      return;
    }

    this.player.wantedTimer = Math.max(0, this.player.wantedTimer - dt);
    if (this.player.wantedTimer === 0) {
      this.player.wanted = Math.max(0, this.player.wanted - 1);
      this.player.wantedTimer = this.player.wanted > 0 ? GAME_CONFIG.wantedDecaySeconds : 0;

      if (this.player.wanted === 0) {
        this.notify("Wanted level cleared.", "success");
      }
    }
  }

  private updateFloatingOrigin() {
    // Disabled floating origin logic: The Neo-Vice map boundary is small enough 
    // that precision errors don't occur, and skipping this prevents drifting colliders
    // which was causing the "everything passing through" bug after respawns.
  }

  private schedulePersistence(dt: number) {
    this.saveScheduled += dt;
    if (this.saveScheduled >= 8) {
      this.saveScheduled = 0;
      this.persistWorld();
    }
  }

  private updateVisuals(dt: number) {
    this.worldTime = (this.worldTime + dt * 0.008) % 1;
    this.mouseIdleTimer += dt;

    const sky = new Color().lerpColors(
      new Color(0x14253a),
      new Color(0xf08d5f),
      Math.max(0, Math.sin(this.worldTime * Math.PI))
    );
    this.scene.background = sky;
    if (this.scene.fog) {
      this.scene.fog.color.copy(sky.clone().lerp(new Color(0x7aabca), 0.35));
    }

    for (const layer of this.parallaxLayers) {
      layer.mesh.position.x = layer.basePosition.x + this.player.position.x * layer.factorX;
      layer.mesh.position.z = layer.basePosition.z + this.player.position.z * layer.factorZ;
      layer.mesh.position.y =
        layer.basePosition.y +
        (layer.bobAmplitude ? Math.sin(this.worldTime * Math.PI * 2 + layer.factorX * 6) * layer.bobAmplitude : 0);
    }

    this.updateCamera(dt);
    this.clearExpiredNotification();
    this.emitHud();
  }

  private updateCamera(dt: number) {
    if (this.player.inVehicle) {
      const vehicle = this.getOccupiedVehicle();
      if (vehicle && Math.abs(vehicle.speed) > 1.2 && this.mouseIdleTimer > 0.32) {
        const assistStrength = Math.max(0.8, Math.min(2.4, Math.abs(vehicle.speed) * 0.08));
        this.cameraYaw = this.rotateTowards(this.cameraYaw, vehicle.direction, dt * assistStrength);
      }
      this.cameraPitch = this.lerp(this.cameraPitch, 0.22, 0.08);
    } else if (!this.aiming) {
      const sprintingForward =
        this.keys.has("KeyW") &&
        !this.keys.has("KeyA") &&
        !this.keys.has("KeyD") &&
        (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"));
      if (sprintingForward && this.mouseIdleTimer > 0.85 && this.recentMouseTurn < 0.08) {
        // playerYaw faces the velocity, which is cameraYaw + PI for forward movement (-Z in three.js).
        // Pull cameraYaw towards playerYaw - PI to prevent continuous spinning relative to movement.
        this.cameraYaw = this.rotateTowards(this.cameraYaw, this.playerYaw - Math.PI, dt * 1.25);
      }
      this.cameraPitch = Math.max(-0.16, Math.min(0.62, this.cameraPitch));
    }

    const focusHeight = this.player.inVehicle ? 2.2 : 1.78;
    const focus = this.player.position.clone().setY(this.player.position.y + focusHeight);
    const forwardFlat = new Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    const right = new Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));

    if (this.aiming && !this.player.inVehicle) {
      const desired = focus
        .clone()
        .addScaledVector(right, GAME_CONFIG.aimShoulderOffset || 0.6)
        .addScaledVector(forwardFlat, -(GAME_CONFIG.aimCameraDistance || 1.8))
        .add(new Vector3(0, Math.sin(this.cameraPitch) * 1.5, 0));
      this.cameraCurrent.lerp(desired, 0.24);
      this.camera.position.copy(this.cameraCurrent);

      const aimTarget = focus.clone().addScaledVector(this.getAimDirection(), 24);
      this.cameraLookAt.lerp(aimTarget, 0.3);
      this.camera.lookAt(this.cameraLookAt);
      this.cameraRoll = this.lerp(this.cameraRoll, 0, 0.16);
      return;
    }

    const distance = GAME_CONFIG.cameraDistance + 2;
    const finalDistance = this.player.inVehicle ? distance + 3.4 : distance - 1.2;
    const cameraShoulder = this.player.inVehicle ? 0.9 : 0.42;
    const speedLead = this.player.inVehicle
      ? Math.min(6.5, Math.abs(this.getOccupiedVehicle()?.speed ?? 0) * 0.22)
      : (this.keys.has("KeyW") ? 2.3 : 0.8);
    const verticalLag = this.player.inVehicle ? 0.45 : 0.18;
    const desiredLookAt = focus
      .clone()
      .addScaledVector(forwardFlat, this.player.inVehicle ? 4.5 + speedLead : 1.8 + speedLead)
      .addScaledVector(right, cameraShoulder * 0.18)
      .add(new Vector3(0, verticalLag, 0));

    const offset = new Vector3(
      Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch) * finalDistance - right.x * cameraShoulder,
      Math.sin(this.cameraPitch) * finalDistance + (GAME_CONFIG.cameraHeight || 1.8) + (this.player.inVehicle ? 0.25 : 0),
      Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch) * finalDistance - right.z * cameraShoulder
    );

    const desired = focus.clone().add(offset);
    const springStrength = this.player.inVehicle ? 7.2 : 9.5;
    const damping = this.player.inVehicle ? 0.8 : 0.75;
    const toDesired = desired.clone().sub(this.cameraCurrent);
    this.cameraVelocity.addScaledVector(toDesired, dt * springStrength);
    this.cameraVelocity.multiplyScalar(Math.max(0, 1 - dt * (springStrength * damping)));
    this.cameraCurrent.addScaledVector(this.cameraVelocity, dt * 9);

    this.cameraLookAt.lerp(desiredLookAt, this.player.inVehicle ? 0.1 : 0.16);
    this.camera.position.copy(this.cameraCurrent);
    this.camera.lookAt(this.cameraLookAt);
    const targetRoll = this.player.inVehicle
      ? Math.max(-0.045, Math.min(0.045, (this.getOccupiedVehicle()?.speed ?? 0) * Math.sin(this.cameraYaw - (this.getOccupiedVehicle()?.direction ?? this.cameraYaw)) * 0.004))
      : Math.max(-0.008, Math.min(0.008, Math.sin(this.animationTime * 7.2) * (this.keys.has("KeyW") ? 0.0045 : 0)));
    this.cameraRoll = this.lerp(this.cameraRoll, targetRoll, this.player.inVehicle ? 0.08 : 0.14);
    this.camera.rotateZ(this.cameraRoll);
  }

  private resolveStaticColliders(position: Vector3, radius: number) {
    const collidersToCheck = [
      ...this.colliders,
      ...this.destructibles.filter((d) => !d.destroyed).map((d) => d.collider)
    ];

    for (const collider of collidersToCheck) {
      if (!this.colliderBlocksHeight(position.y, collider)) {
        continue;
      }

      if (
        position.x + radius <= collider.minX ||
        position.x - radius >= collider.maxX ||
        position.z + radius <= collider.minZ ||
        position.z - radius >= collider.maxZ
      ) {
        continue;
      }

      const overlapLeft = collider.maxX - (position.x - radius);
      const overlapRight = position.x + radius - collider.minX;
      const overlapTop = collider.maxZ - (position.z - radius);
      const overlapBottom = position.z + radius - collider.minZ;
      const minimum = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

      if (minimum === overlapLeft) position.x += overlapLeft;
      else if (minimum === overlapRight) position.x -= overlapRight;
      else if (minimum === overlapTop) position.z += overlapTop;
      else position.z -= overlapBottom;
    }
  }

  private resolveDynamicVehicleCollision(
    position: Vector3,
    radius: number,
    excludeVehicleId: string | null
  ) {
    const nearby = this.vehicleHash.query(position, radius + 4.5);
    for (const vehicle of nearby) {
      if (vehicle.id === excludeVehicleId || vehicle.occupiedByPlayer) {
        continue;
      }
      if (!this.canActorsInteract(position.y, vehicle.position.y)) {
        continue;
      }

      const offset = position.clone().sub(vehicle.position);
      offset.y = 0;
      let distance = offset.length();
      const minimum = radius + vehicle.radius;

      if (distance >= minimum) {
        continue;
      }

      if (distance < 0.0001) {
        offset.set(1, 0, 0);
        distance = 0.0001;
      }

      offset.normalize();
      position.addScaledVector(offset, minimum - distance + 0.02);
    }
  }

  private resolveCrowdCollision(position: Vector3, radius: number, excludeId: string | null) {
    const nearby = this.pedestrianHash.query(position, radius + 1.6);
    for (const pedestrian of nearby) {
      if (pedestrian.id === excludeId || pedestrian.inVehicleId) {
        continue;
      }
      if (!this.canActorsInteract(position.y, pedestrian.position.y)) {
        continue;
      }

      const offset = position.clone().sub(pedestrian.position);
      offset.y = 0;
      let distance = offset.length();
      const minimum = radius + pedestrian.radius;

      if (distance >= minimum) {
        continue;
      }

      if (distance < 0.0001) {
        offset.set(1, 0, 0);
        distance = 0.0001;
      }

      offset.normalize();
      const push = minimum - distance + 0.02;
      position.addScaledVector(offset, push);
    }
  }

  private resolveVehicleActorContacts(vehicle: VehicleEntity) {
    if (vehicle.occupiedByPlayer) {
      return;
    }

    if (this.canActorsInteract(this.player.position.y, vehicle.position.y)) {
      const playerOffset = this.player.position.clone().sub(vehicle.position);
      playerOffset.y = 0;
      let playerDistance = playerOffset.length();
      const playerMinimum = this.player.radius + vehicle.radius;

      if (playerDistance < playerMinimum) {
        if (playerDistance < 0.0001) {
          playerOffset.set(1, 0, 0);
          playerDistance = 0.0001;
        }

        playerOffset.normalize();
        this.player.position.addScaledVector(playerOffset, playerMinimum - playerDistance + 0.12);

        if (Math.abs(vehicle.speed) > 6) {
          this.applyDamage(Math.min(18, Math.abs(vehicle.speed) * 0.35));
        }
      }
    }

    const nearbyPedestrians = this.pedestrianHash.query(vehicle.position, vehicle.radius + 2.1);
    for (const pedestrian of nearbyPedestrians) {
      if (pedestrian.inVehicleId) {
        continue;
      }
      if (!this.canActorsInteract(vehicle.position.y, pedestrian.position.y)) {
        continue;
      }

      const offset = pedestrian.position.clone().sub(vehicle.position);
      offset.y = 0;
      let distance = offset.length();
      const minimum = pedestrian.radius + vehicle.radius;
      if (distance >= minimum) {
        continue;
      }

      if (distance < 0.0001) {
        offset.set(1, 0, 0);
        distance = 0.0001;
      }

      offset.normalize();
      pedestrian.position.addScaledVector(offset, minimum - distance + 0.08);
      pedestrian.state = "flee";
      pedestrian.panicTimer = Math.max(pedestrian.panicTimer, 4);

      if (Math.abs(vehicle.speed) > 7) {
        pedestrian.hp -= Math.max(6, Math.abs(vehicle.speed) * 0.6);
      }
    }
  }

  private resolveVehicleOverlap(vehicle: VehicleEntity, fallback: Vector3) {
    const nearby = this.vehicleHash.query(vehicle.position, vehicle.radius + 5);
    for (const other of nearby) {
      if (other.id === vehicle.id) {
        continue;
      }

      const offset = vehicle.position.clone().sub(other.position);
      offset.y = 0;
      let distance = offset.length();
      const minimum = vehicle.radius + other.radius - 0.2;

      if (distance >= minimum) {
        continue;
      }

      const impactForce = (Math.abs(vehicle.speed) + Math.abs(other.speed)) * (other.mass / 1000);
      if (impactForce > 12) {
        this.applyVehicleDeformation(vehicle, impactForce);
        vehicle.hp -= impactForce * 0.45;
        vehicle.damageLevel = Math.min(1, 1 - vehicle.hp / vehicle.maxHp);

        if (vehicle.hp <= 0 && !vehicle.exploded) {
          this.disableVehicle(vehicle);
        }
      }

      if (distance < 0.0001) {
        offset.set(1, 0, 0);
        distance = 0.0001;
      }

      offset.normalize();
      vehicle.position.addScaledVector(offset, minimum - distance + 0.1);
      vehicle.speed *= 0.6;
    }
  }

  private applyVehicleDeformation(vehicle: VehicleEntity, force: number) {
    if (force < 5) return;

    vehicle.mesh.children.forEach((child) => {
      if (!(child instanceof Mesh) || child.name.startsWith("siren") || child.geometry instanceof CylinderGeometry) {
        return;
      }

      const geom = child.geometry;
      if (!geom.isBufferGeometry || !geom.attributes.position) return;

      const posAttribute = geom.attributes.position;
      const count = posAttribute.count;
      for (let i = 0; i < count; i++) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i);
        const z = posAttribute.getZ(i);

        const distSq = x * x + z * z;
        if (distSq > 0.4 && Math.random() < 0.6) {
          const compress = 1.0 - (Math.min(18, force) * 0.0065 * Math.random());
          posAttribute.setX(i, x * compress);
          posAttribute.setZ(i, z * compress);
          if (y > 0.45) posAttribute.setY(i, y * (1.0 - (Math.min(18, force) * 0.0035)));
        }
      }

      posAttribute.needsUpdate = true;
      child.geometry.computeVertexNormals();
    });
  }

  private collidesWithBuildings(position: Vector3) {
    return this.colliders.some((collider) => {
      if (!this.colliderBlocksHeight(position.y, collider, 0.18)) {
        return false;
      }
      return (
        position.x >= collider.minX &&
        position.x <= collider.maxX &&
        position.z >= collider.minZ &&
        position.z <= collider.maxZ
      );
    });
  }

  private clampWorld(position: Vector3) {
    // Left empty: world boundaries are now physical walls, handled by collision
  }

  private applyDamage(amount: number) {
    let remaining = amount;

    if (this.player.armor > 0) {
      const absorbed = Math.min(this.player.armor, Math.ceil(amount * 0.55));
      this.player.armor -= absorbed;
      remaining -= absorbed;
    }

    this.player.health = Math.max(0, this.player.health - remaining);

    if (this.player.health <= 0) {
      this.player.health = 100;
      this.player.armor = 50;

      this.player.position.set(0, PLAYER_HEIGHT, 0); // No more origin offset

      this.player.wanted = 0;
      this.player.wantedTimer = 0;

      // Ensure the vehicle is marked as unoccupied
      if (this.player.inVehicle && this.player.vehicleId) {
        const vehicle = this.vehicles.find(v => v.id === this.player.vehicleId);
        if (vehicle) {
          vehicle.occupiedByPlayer = false;
        }
      }

      this.player.inVehicle = false;
      this.player.vehicleId = null;
      this.notify("You got flattened. Respawned downtown.", "danger");
    }
  }

  private addWanted(amount: number, resetDecay = true) {
    const nextWanted = Math.min(5, this.player.wanted + amount);
    if (nextWanted === this.player.wanted && !resetDecay) {
      return;
    }

    this.player.wanted = nextWanted;
    this.player.wantedTimer = GAME_CONFIG.wantedDecaySeconds;
  }

  private ensurePolicePresence() {
    if (this.player.wanted <= 0 || this.policeSpawnTimer > 0) {
      return;
    }

    const policeCount = this.vehicles.filter((vehicle) => vehicle.kind === "police").length;
    const footCopCount = this.pedestrians.filter(
      (pedestrian) => pedestrian.role === "cop" && !pedestrian.inVehicleId
    ).length;
    const vehicleTarget =
      this.player.wanted <= 1 ? 1 : this.player.wanted <= 3 ? 2 : Math.min(4, this.player.wanted);
    const footTarget = Math.max(0, this.player.wanted - 1);

    if (policeCount >= vehicleTarget && footCopCount >= footTarget) {
      return;
    }

    let spawnPosition: Vector3 | null = null;
    let closestDistSq = Infinity;
    const spawnDistSqTarget = Math.pow(GAME_CONFIG.policeSpawnDistance, 2);

    for (const route of this.trafficRoutes) {
      for (const node of route) {
        const distSq = node.distanceToSquared(this.player.position);
        if (distSq > spawnDistSqTarget * 0.4 && distSq < spawnDistSqTarget * 2.2) {
          const toNode = node.clone().sub(this.player.position).normalize();
          const pForward = new Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));

          // Spawn behind the player to avoid popping in front of them
          if (toNode.dot(pForward) < -0.1) {
            const score = Math.abs(distSq - spawnDistSqTarget);
            if (score < closestDistSq) {
              closestDistSq = score;
              spawnPosition = node.clone();
            }
          }
        }
      }
    }

    if (!spawnPosition) {
      const angle = Math.random() * Math.PI * 2;
      spawnPosition = this.player.position.clone().add(
        new Vector3(
          Math.cos(angle) * GAME_CONFIG.policeSpawnDistance,
          0,
          Math.sin(angle) * GAME_CONFIG.policeSpawnDistance
        )
      );
    }

    if (policeCount < vehicleTarget) {
      const vehicle = this.createVehicle({
        id: this.nextId("police"),
        position: spawnPosition,
        direction: this.directionBetween(spawnPosition, this.player.position),
        kind: "police",
        vehicleClass: "car",
        routeIndex: null,
        nodeIndex: 0,
        parked: false,
        withDriver: true
      });

      vehicle.speed = 10;
    }

    this.policeSpawnTimer = this.player.wanted <= 1 ? 5 : 3.5;

    if (footCopCount < footTarget) {
      this.createPedestrian({
        id: this.nextId("cop"),
        position: spawnPosition.clone().add(new Vector3(4, 0, 4)),
        role: "cop",
        archetype: "aggressive"
      });
    }
  }

  private selectWeapon(weapon: WeaponId) {
    if (weapon === "smg" && this.player.ammo.smg <= 0) {
      this.notify("Find the SMG pickup first.", "info");
      return;
    }

    if (weapon === "shotgun" && this.player.ammo.shotgun <= 0) {
      this.notify("Shotgun shells are empty right now.", "info");
      return;
    }

    this.player.weapon = weapon;
    this.notify(`${WEAPONS[weapon].name} selected.`, "info");
  }

  private toggleVehicle() {
    if (this.player.inVehicle) {
      this.exitVehicle();
      return;
    }

    const candidate = this.findClosestVehicle(true);
    if (!candidate) {
      this.notify("No usable vehicle close enough.", "info");
      return;
    }

    const looksStationary = Math.abs(candidate.speed) < 2.8 || candidate.parked;
    if (!looksStationary && Math.abs(candidate.speed) > 12) {
      this.notify("That ride is moving too fast to hijack cleanly.", "danger");
      return;
    }

    const hadDriver = Boolean(candidate.driverPedId);
    if (candidate.driverPedId) {
      this.ejectDriver(candidate);
    }

    candidate.occupiedByPlayer = true;
    candidate.speed *= 0.5;
    this.player.inVehicle = true;
    this.player.vehicleId = candidate.id;
    this.player.mesh.visible = false;

    if (candidate.kind === "police") {
      this.addWanted(2);
    }

    this.notify(hadDriver ? "Driver yanked out. Vehicle stolen." : "Vehicle entered.", "success");
  }

  private findClosestVehicle(preferUsable = false) {
    return (
      this.vehicles
        .filter((vehicle) => {
          if (vehicle.occupiedByPlayer) {
            return false;
          }

          const distance = vehicle.position.distanceTo(this.player.position);
          if (distance >= vehicle.radius + 2.4) {
            return false;
          }

          if (!preferUsable) {
            return true;
          }

          return vehicle.parked || Math.abs(vehicle.speed) < 12;
        })
        .sort((left, right) => {
          const leftParkBias = left.parked || Math.abs(left.speed) < 2.8 ? -2 : 0;
          const rightParkBias = right.parked || Math.abs(right.speed) < 2.8 ? -2 : 0;
          const leftMotionBias = Math.abs(left.speed) * 0.14;
          const rightMotionBias = Math.abs(right.speed) * 0.14;
          return (
            left.position.distanceTo(this.player.position) +
            leftMotionBias +
            leftParkBias -
            (right.position.distanceTo(this.player.position) + rightMotionBias + rightParkBias)
          );
        })[0] ?? null
    );
  }

  private ejectDriver(vehicle: VehicleEntity) {
    const driver = vehicle.driverPedId
      ? this.pedestrians.find((pedestrian) => pedestrian.id === vehicle.driverPedId)
      : null;

    if (!driver) {
      vehicle.driverPedId = null;
      if (vehicle.driverAvatar) {
        vehicle.driverAvatar.visible = false;
      }
      return;
    }

    const side = new Vector3(Math.cos(vehicle.direction), 0, -Math.sin(vehicle.direction));
    driver.inVehicleId = null;
    driver.mesh.visible = true;
    driver.position.copy(vehicle.position).addScaledVector(side, vehicle.vehicleClass === "bike" ? 1.8 : 2.4);
    driver.position.y = this.sampleGroundHeight(driver.position);
    driver.target = driver.position.clone().add(side.clone().multiplyScalar(8));
    driver.state = driver.role === "cop" ? "attack" : getCarjackReaction(driver);
    if (driver.state === "angry") {
      driver.angerTimer = NPC_CRIME_CONFIG.angerDuration;
      driver.speed = 3.8; // angry NPCs are faster
    }
    driver.panicTimer = 7;
    driver.reactionTimer = 1.2;
    this.pedestrianHash.update(driver);

    vehicle.driverPedId = null;
    vehicle.parked = true;
    vehicle.speed = 0;
    if (vehicle.driverAvatar) {
      vehicle.driverAvatar.visible = false;
    }

    if (driver.role === "cop") {
      this.addWanted(2);
    }
  }

  private exitVehicle() {
    const vehicle = this.getOccupiedVehicle();
    if (!vehicle) {
      return;
    }

    vehicle.occupiedByPlayer = false;
    vehicle.parked = vehicle.routeIndex === null;
    this.player.inVehicle = false;
    this.player.vehicleId = null;

    const side = new Vector3(Math.cos(vehicle.direction), 0, -Math.sin(vehicle.direction));
    this.player.position.copy(vehicle.position).addScaledVector(side, vehicle.vehicleClass === "bike" ? 1.6 : 2.8);
    this.player.position.y = this.sampleGroundHeight(this.player.position) + PLAYER_HEIGHT;
    this.player.mesh.visible = true;
    this.playerYaw = vehicle.direction;
    this.notify("Back on foot.", "info");
  }

  private getOccupiedVehicle() {
    return this.vehicles.find((vehicle) => vehicle.id === this.player.vehicleId) ?? null;
  }

  private tryPickup() {
    const nearest = this.pickups.find((pickup) => {
      return (
        !pickup.taken &&
        pickup.position.distanceTo(this.player.position) < GAME_CONFIG.interactionRange
      );
    });

    if (!nearest) {
      this.notify("No pickup in range.", "info");
      return;
    }

    nearest.taken = true;
    nearest.mesh.visible = false;
    this.collectedPickupIds.add(nearest.id);

    if (nearest.kind === "smg") {
      this.player.ammo.smg = 120;
      this.player.weapon = "smg";
      this.notify("SMG unlocked and loaded.", "success");
    }

    if (nearest.kind === "armor") {
      this.player.armor = Math.min(100, this.player.armor + 55);
      this.notify("Armor plates secured.", "success");
    }

    if (nearest.kind === "cash") {
      this.player.cash += 350;
      this.notify("Cash package collected.", "success");
    }

    this.persistWorld();
  }

  private captureCheatInput(event: KeyboardEvent) {
    if (event.key.length !== 1 || !/[a-z]/i.test(event.key)) {
      return;
    }

    this.cheatBuffer = `${this.cheatBuffer}${event.key.toLowerCase()}`.slice(-32);
    const match = CHEAT_CODES.find((cheat) => this.cheatBuffer.endsWith(cheat.code));
    if (!match) {
      return;
    }

    this.cheatBuffer = "";
    this.applyCheat(match.code);
    this.recentCheat = match.label;
  }

  private applyCheat(code: string) {
    switch (code) {
      case "aspirine":
        this.player.health = 100;
        this.notify("Cheat activated: health restored.", "success");
        break;
      case "preciousprotection":
        this.player.armor = 100;
        this.notify("Cheat activated: armor maxed.", "success");
        break;
      case "leavemealone":
        this.player.wanted = 0;
        this.player.wantedTimer = 0;
        this.notify("Cheat activated: heat cleared.", "success");
        break;
      case "thugstools":
        this.player.ammo.smg = Math.max(this.player.ammo.smg, 180);
        this.player.ammo.shotgun = Math.max(this.player.ammo.shotgun, 24);
        this.player.weapon = "smg";
        this.notify("Cheat activated: weapons restocked.", "success");
        break;
      case "betterthanwalking":
      case "silentride":
      case "americanmuscle":
      case "offroad": {
        const spawn = this.player.position.clone().add(new Vector3(5, 0, 0));
        let vehicleClass: "bike" | "ev" | "muscle" | "suv" = "bike";
        if (code === "silentride") vehicleClass = "ev";
        if (code === "americanmuscle") vehicleClass = "muscle";
        if (code === "offroad") vehicleClass = "suv";

        this.createVehicle({
          id: this.nextId(`cheat-${vehicleClass}`),
          position: spawn,
          direction: this.playerYaw,
          kind: "civilian",
          vehicleClass: vehicleClass,
          routeIndex: null,
          nodeIndex: 0,
          parked: true,
          withDriver: false
        });
        this.notify(`Cheat activated: ${vehicleClass} spawned.`, "success");
        break;
      }
      case "ghostprotocol":
        this.player.digitalFootprint = 0;
        this.notify("Cheat activated: digital footprint wiped.", "success");
        break;
      case "bigbang": {
        const nearbyVehicles = this.vehicleHash
          .query(this.player.position, 28)
          .filter((vehicle) => vehicle.id !== this.player.vehicleId);
        nearbyVehicles.forEach((vehicle) => this.disableVehicle(vehicle));
        this.notify("Cheat activated: nearby vehicles wrecked.", "success");
        break;
      }
    }
  }

  private disableVehicle(vehicle: VehicleEntity) {
    if (vehicle.exploded || vehicle.onFire) return;

    if (vehicle.driverPedId) {
      this.ejectDriver(vehicle);
    }

    vehicle.onFire = true;
    vehicle.fireTimer = 3 + Math.random() * 2; // 3 to 5 seconds
    vehicle.speed = Math.min(vehicle.speed, 2);

    // Change to darkened/scorched color and emit initial smoke
    vehicle.mesh.children.forEach(child => {
      if (child instanceof Mesh && child.material instanceof MeshLambertMaterial) {
        child.material = child.material.clone();
        const currentColor = child.material.color.getHex();
        if (currentColor !== CITY_COLORS.policeBlack && currentColor !== 0x121212) {
          child.material.color.setHex(0x555555);
        }
      }
    });

    // Start emitting smoke to indicate it's about to blow
    this.particles.spawnSmoke(vehicle.position);
    this.particles.spawnFire(vehicle.position);
  }

  private explodeVehicle(vehicle: VehicleEntity) {
    if (vehicle.exploded) return;

    this.player.cash += 120;
    vehicle.exploded = true;
    vehicle.burnTimer = 15;

    // Play explosion particles/effect
    this.particles.spawnExplosion(vehicle.position);

    // Change to fully burnt color
    vehicle.mesh.children.forEach(child => {
      if (child instanceof Mesh && child.material instanceof MeshLambertMaterial) {
        child.material = child.material.clone();
        child.material.color.setHex(0x1a1a1a);
        child.material.emissive.setHex(0x000000);
      }
    });

    // Area of effect damage
    const explosionRadius = 12;
    const explosionDamage = 80;

    // Damage player
    if (this.player.position.distanceTo(vehicle.position) < explosionRadius) {
      this.applyDamage(explosionDamage);
    }

    // Damage Peds
    const nearbyPeds = this.pedestrianHash.query(vehicle.position, explosionRadius);
    nearbyPeds.forEach(ped => {
      const dist = ped.position.distanceTo(vehicle.position);
      if (dist < explosionRadius) {
        ped.hp -= explosionDamage * (1 - dist / explosionRadius);
      }
    });

    // Damage other vehicles (chain reaction)
    const nearbyVehicles = this.vehicleHash.query(vehicle.position, explosionRadius);
    nearbyVehicles.forEach(other => {
      if (other.id !== vehicle.id && !other.exploded) {
        const dist = other.position.distanceTo(vehicle.position);
        if (dist < explosionRadius) {
          other.hp -= explosionDamage * (1 - dist / explosionRadius);
          if (other.hp <= 0) {
            this.disableVehicle(other);
          }
        }
      }
    });

    // Damage destructibles
    this.destructibles.forEach(prop => {
      if (!prop.destroyed) {
        const dist = prop.position.distanceTo(vehicle.position);
        if (dist < explosionRadius) {
          prop.hp -= explosionDamage * (1 - dist / explosionRadius);
          if (prop.hp <= 0) {
            prop.destroyed = true;
            prop.mesh.visible = false;
            this.particles.spawnDebris(prop.position, new Vector3(0, 1, 0), CITY_COLORS.propWood);
          }
        }
      }
    });
  }

  private removeVehicle(vehicle: VehicleEntity) {
    if (vehicle.driverPedId) {
      const driver = this.pedestrians.find((pedestrian) => pedestrian.id === vehicle.driverPedId);
      if (driver) {
        this.removePedestrian(driver);
      }
    }

    this.scene.remove(vehicle.mesh);
    this.vehicleHash.remove(vehicle);
    const index = this.vehicles.findIndex((candidate) => candidate.id === vehicle.id);
    if (index >= 0) {
      this.vehicles.splice(index, 1);
    }
  }

  private removePedestrian(pedestrian: PedestrianEntity) {
    this.scene.remove(pedestrian.mesh);
    this.pedestrianHash.remove(pedestrian);
    const index = this.pedestrians.findIndex((candidate) => candidate.id === pedestrian.id);
    if (index >= 0) {
      this.pedestrians.splice(index, 1);
    }
  }

  private districtName() {
    const { x, z } = this.player.position;
    if (z > 120) return "Vice Harbor";
    if (x < -80 && z < -40) return "Empire Vista";
    if (x > 90 && z < -60) return "Saints Exchange";
    if (z < -70) return "Civic Strip";
    return "Neon Central";
  }

  private currentMissionCopy() {
    if (!this.activeMission) {
      return {
        title: "Open World Sandbox",
        copy: "Take parked rides, jack moving traffic, grab pickups, and start glowing missions."
      };
    }

    const step = this.activeMission.definition.steps[this.activeMission.stepIndex];
    return {
      title: this.activeMission.definition.name,
      copy: step?.text ?? "Mission complete."
    };
  }

  private clearExpiredNotification() {
    if (this.notification && performance.now() > this.notificationUntil) {
      this.notification = null;
    }
  }

  private emitHud() {
    const mission = this.currentMissionCopy();
    const weaponConfig = WEAPONS[this.player.weapon];
    const ammo =
      this.player.weapon === "fists"
        ? "INF"
        : String(this.player.ammo[this.player.weapon as Exclude<WeaponId, "fists">]);

    const pickupHint = this.pickups.some((pickup) => {
      return (
        !pickup.taken &&
        pickup.position.distanceTo(this.player.position) < GAME_CONFIG.interactionRange
      );
    })
      ? "Press Q to collect the nearby pickup."
      : this.player.inVehicle
        ? "Press F to exit the current vehicle."
        : "Press F near a parked car or occupied ride to enter or hijack it.";

    const hours = Math.floor(this.worldTime * 24);
    const minutes = Math.floor((this.worldTime * 24 - hours) * 60);

    const dots = [
      {
        x: this.mapValue(this.player.position.x, GAME_CONFIG.worldMinX, GAME_CONFIG.worldMaxX),
        y: this.mapValue(this.player.position.z, GAME_CONFIG.worldMinZ, GAME_CONFIG.worldMaxZ),
        kind: "player" as const,
        heading: this.playerYaw
      },
      ...this.vehicles.slice(0, 20).map((vehicle) => ({
        x: this.mapValue(vehicle.position.x, GAME_CONFIG.worldMinX, GAME_CONFIG.worldMaxX),
        y: this.mapValue(vehicle.position.z, GAME_CONFIG.worldMinZ, GAME_CONFIG.worldMaxZ),
        kind: vehicle.kind === "police" ? ("police" as const) : ("vehicle" as const)
      })),
      ...this.pedestrians
        .filter((pedestrian) => !pedestrian.inVehicleId)
        .slice(0, 30)
        .map((pedestrian) => ({
          x: this.mapValue(pedestrian.position.x, GAME_CONFIG.worldMinX, GAME_CONFIG.worldMaxX),
          y: this.mapValue(pedestrian.position.z, GAME_CONFIG.worldMinZ, GAME_CONFIG.worldMaxZ),
          kind: pedestrian.role === "cop" ? ("police" as const) : ("npc" as const)
        })),
      ...this.pickups
        .filter((pickup) => !pickup.taken)
        .map((pickup) => ({
          x: this.mapValue(pickup.position.x, GAME_CONFIG.worldMinX, GAME_CONFIG.worldMaxX),
          y: this.mapValue(pickup.position.z, GAME_CONFIG.worldMinZ, GAME_CONFIG.worldMaxZ),
          kind: "pickup" as const
        })),
      ...this.missions
        .filter((mission) => !mission.completed)
        .map((mission) => ({
          x: this.mapValue(
            mission.active
              ? mission.definition.steps[mission.stepIndex]?.target.x ?? mission.definition.start.x
              : mission.definition.start.x,
            GAME_CONFIG.worldMinX,
            GAME_CONFIG.worldMaxX
          ),
          y: this.mapValue(
            mission.active
              ? mission.definition.steps[mission.stepIndex]?.target.z ?? mission.definition.start.z
              : mission.definition.start.z,
            GAME_CONFIG.worldMinZ,
            GAME_CONFIG.worldMaxZ
          ),
          kind: "mission" as const
        }))
    ];

    this.onHudChange({
      health: Math.round(this.player.health),
      armor: Math.round(this.player.armor),
      cash: this.player.cash,
      wanted: this.player.wanted,
      weapon: weaponConfig.name,
      ammo,
      speed: Math.round(Math.abs(this.getOccupiedVehicle()?.speed ?? 0) * 4.2),
      missionTitle: mission.title,
      missionText: mission.copy,
      district: this.districtName(),
      timeLabel: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      pickupHint,
      debug: this.settings.showDebug
        ? `Vehicles ${this.vehicles.length} | NPCs ${this.pedestrians.length} | Bullets ${this.bullets.length}/${this.bulletPool.size} | Footprint ${Math.round(this.player.digitalFootprint)} | Particles ${this?.particles?.activeCount}`
        : "Debug overlay hidden in settings.",
      inVehicle: this.player.inVehicle,
      isAiming: this.aiming && !this.paused,
      digitalFootprint: Math.round(this.player.digitalFootprint),
      notification: this.notification,
      shopMenu: this.getShopMenuState(),
      interactionPrompt: this.getInteractionPrompt(),
      minimap: {
        dots,
        playerHeading: this.playerYaw
      },
      pauseMenu: {
        open: this.paused,
        settings: {
          mouseSensitivity: `${GAME_CONFIG.mouseSensitivityOptions[this.settings.mouseSensitivityIndex]}x`,
          trafficDensity: this.densityLabel(this.settings.trafficDensityIndex),
          crowdDensity: this.densityLabel(this.settings.crowdDensityIndex),
          showDebug: this.settings.showDebug ? "On" : "Off"
        },
        recentCheat: this.recentCheat,
        cheats: CHEAT_CODES.map((cheat) => `${cheat.code} - ${cheat.label}`)
      }
    });
  }

  private directionBetween(from: Vector3, to: Vector3) {
    return Math.atan2(to.x - from.x, to.z - from.z);
  }

  private rotateTowards(current: number, target: number, amount: number) {
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return current + delta * Math.min(1, amount);
  }

  private getAimDirection() {
    const horizontal = Math.cos(this.cameraPitch * 0.7);
    const vertical = -Math.sin(this.cameraPitch * 0.55);
    return new Vector3(
      -Math.sin(this.cameraYaw) * horizontal,
      vertical,
      -Math.cos(this.cameraYaw) * horizontal
    ).normalize();
  }

  private mapValue(value: number, min: number, max: number) {
    return MathUtils.clamp(((value - min) / (max - min)) * 100, 0, 100);
  }

  private densityLabel(index: number) {
    return ["Light", "Standard", "Dense"][index] ?? "Standard";
  }

  private currentTrafficDensity() {
    return GAME_CONFIG.densityOptions[this.settings.trafficDensityIndex];
  }

  private currentCrowdDensity() {
    return GAME_CONFIG.densityOptions[this.settings.crowdDensityIndex];
  }

  private pickArchetype() {
    return AMBIENT_ARCHETYPES[Math.floor(Math.random() * AMBIENT_ARCHETYPES.length)];
  }

  private nextId(prefix: string) {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  private lerp(from: number, to: number, alpha: number) {
    return from + (to - from) * alpha;
  }

  private async hydratePersistence() {
    try {
      const response = await fetch("/api/world", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as PersistenceState;
      data.collectedPickups.forEach((pickupId) => this.collectedPickupIds.add(pickupId));
      data.completedMissions.forEach((missionId) => this.completedMissionIds.add(missionId));

      this.pickups.forEach((pickup) => {
        if (this.collectedPickupIds.has(pickup.id)) {
          pickup.taken = true;
          pickup.mesh.visible = false;
        }
      });

      this.missions.forEach((mission) => {
        if (this.completedMissionIds.has(mission.definition.id)) {
          mission.completed = true;
          mission.marker.visible = false;
          mission.beam.visible = false;
        }
      });
    } catch {
      this.notify("Persistence API unavailable. Running in session-only mode.", "danger");
    }
  }

  private persistWorld() {
    void fetch("/api/world", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        collectedPickups: [...this.collectedPickupIds],
        completedMissions: [...this.completedMissionIds]
      })
    }).catch(() => {
      // Ignore persistence failures during gameplay.
    });
  }

  private recycleBullet(index: number) {
    const bullet = this.bullets[index];
    this.bulletPool.release(bullet);
    this.bullets.splice(index, 1);
  }

  private notify(message: string, tone: "info" | "success" | "danger") {
    this.events.emit("notify", { message, tone });
  }

  // ════════════════════════════════════════════════════════════
  //  NEO-VICE 2030 — NEW SYSTEMS
  // ════════════════════════════════════════════════════════════

  private updateDigitalFootprint(dt: number) {
    // Decay footprint over time
    if (this.player.digitalFootprint > 0) {
      const decayRate = this.player.wanted === 0
        ? FOOTPRINT_CONFIG.decayPerSecond * FOOTPRINT_CONFIG.deadZoneDecayMultiplier
        : FOOTPRINT_CONFIG.decayPerSecond;
      this.player.digitalFootprint = Math.max(0, this.player.digitalFootprint - decayRate * dt);
    }

    // Breaking News notification
    this.breakingNewsTimer = Math.max(0, this.breakingNewsTimer - dt);
    if (this.player.wanted >= 3 && this.breakingNewsTimer <= 0) {
      this.breakingNewsTimer = FOOTPRINT_CONFIG.breakingNewsCooldown;
      const district = this.districtName();
      const vehicle = this.getOccupiedVehicle();
      const vehicleLabel = vehicle ? (VEHICLE_PHYSICS[vehicle.vehicleClass]?.label ?? "vehicle") : "on foot";
      this.notify(`🔴 BREAKING: Suspect spotted in ${district}, ${vehicleLabel}. Exercise caution.`, "danger");
    }

    // ViceGram trending alert
    this.vicegramAlertTimer = Math.max(0, this.vicegramAlertTimer - dt);
    if (this.player.digitalFootprint > FOOTPRINT_CONFIG.thresholds.medium && this.vicegramAlertTimer <= 0) {
      this.vicegramAlertTimer = FOOTPRINT_CONFIG.vicegramAlertInterval;
      const score = Math.round(this.player.digitalFootprint);
      this.notify(`📱 ViceGram Trending: You have ${score}% digital footprint! NPCs are filming.`, "info");
    }
  }

  private updateDestructibles(_dt: number) {
    for (const prop of this.destructibles) {
      if (prop.destroyed) continue;

      // Check vehicle collisions with destructible props
      const nearbyVehicles = this.vehicleHash.query(prop.position, 5);
      for (const vehicle of nearbyVehicles) {
        if (Math.abs(vehicle.speed) < DESTRUCTION_CONFIG.minImpactSpeed) continue;

        const dx = vehicle.position.x - prop.position.x;
        const dz = vehicle.position.z - prop.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < vehicle.radius + 1.0) {
          const impactForce = Math.abs(vehicle.speed) * (vehicle.mass / 1000);
          prop.hp -= impactForce;

          if (prop.hp <= 0) {
            prop.destroyed = true;
            prop.mesh.visible = false;

            // Spawn particles based on tier
            const impactDir = new Vector3(dx, 0, dz).normalize();
            if (prop.tier === "prop") {
              this.particles.spawnDebris(prop.position, impactDir, CITY_COLORS.propWood);
            } else if (prop.tier === "structural") {
              this.particles.spawnGlass(prop.position, impactDir);
            }

            // Vehicle takes minor damage from prop collision
            vehicle.hp -= 3;
            vehicle.damageLevel = Math.min(1, 1 - vehicle.hp / vehicle.maxHp);
            this.applyVehicleDeformation(vehicle, impactForce);
          }
        }
      }
    }
  }

  private updatePoliceSearch(dt: number) {
    if (this.player.wanted === 0) {
      this.policeSearchPhase = "chase";
      this.lastKnownPosition = null;
      this.playerVisibleToPolice = true;
      return;
    }

    // Periodically check LOS from police to player
    this.losCheckTimer += dt;
    if (this.losCheckTimer >= POLICE_CONFIG.losCheckInterval) {
      this.losCheckTimer = 0;
      const anyPoliceHasLOS = this.pedestrians.some(
        (p) => p.role === "cop" && p.state === "pursue" && p.pursuitTarget === "player" &&
          checkLineOfSight(p.position, this.player.position, this.colliders)
      );
      this.playerVisibleToPolice = anyPoliceHasLOS;

      if (anyPoliceHasLOS) {
        this.lastKnownPosition = this.player.position.clone();
        this.policeSearchPhase = "chase";
        this.policeSearchTimer = 0;
      } else if (this.policeSearchPhase === "chase") {
        // Player just broke LOS — switch to LKP rush
        this.policeSearchPhase = "rush_lkp";
        this.policeSearchTimer = 0;
        if (!this.lastKnownPosition) {
          this.lastKnownPosition = this.player.position.clone();
        }
      }
    }

    // Progress through search phases
    if (this.policeSearchPhase !== "chase") {
      this.policeSearchTimer += dt;

      if (this.policeSearchPhase === "rush_lkp" && this.policeSearchTimer > POLICE_CONFIG.lkpRushDuration) {
        this.policeSearchPhase = this.player.wanted >= POLICE_CONFIG.checkpointWantedThreshold
          ? "checkpoint" : "grid_sweep";
        this.policeSearchTimer = 0;
        this.policeSearchRadius = 30;
      }

      if (this.policeSearchPhase === "grid_sweep") {
        this.policeSearchRadius += POLICE_CONFIG.gridSweepExpandRate * dt;
      }
    }

    // Emit smoke from damaged vehicles
    this.smokeEmitTimer += dt;
    if (this.smokeEmitTimer > 0.3) {
      this.smokeEmitTimer = 0;
      for (const vehicle of this.vehicles) {
        if (vehicle.smoking && vehicle.hp > 0) {
          this.particles.spawnSmoke(vehicle.position);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  //  TRAFFIC LIGHT SYSTEM
  // ════════════════════════════════════════════════════════════

  private updateTrafficLights(dt: number) {
    for (const light of this.trafficLights) {
      // Skip destroyed lights
      const destructible = this.destructibles.find(d => d.id === `traffic-light-${light.id.replace('tl-', '')}`);
      if (destructible?.destroyed) continue;

      light.timer += dt;

      // State machine: green → yellow → red → green
      if (light.state === "green" && light.timer >= TRAFFIC_LIGHT_CONFIG.greenDuration) {
        light.state = "yellow";
        light.timer = 0;
      } else if (light.state === "yellow" && light.timer >= TRAFFIC_LIGHT_CONFIG.yellowDuration) {
        light.state = "red";
        light.timer = 0;
      } else if (light.state === "red" && light.timer >= TRAFFIC_LIGHT_CONFIG.redDuration) {
        light.state = "green";
        light.timer = 0;
      }

      // Update mesh emissive intensities
      if (light.redMesh?.material instanceof MeshLambertMaterial) {
        light.redMesh.material.emissiveIntensity = light.state === "red" ? 1.2 : 0.1;
      }
      if (light.yellowMesh?.material instanceof MeshLambertMaterial) {
        light.yellowMesh.material.emissiveIntensity = light.state === "yellow" ? 1.2 : 0.1;
      }
      if (light.greenMesh?.material instanceof MeshLambertMaterial) {
        light.greenMesh.material.emissiveIntensity = light.state === "green" ? 1.2 : 0.1;
      }
    }
  }

  /** Check if a vehicle should slow/stop for a nearby red/yellow traffic light */
  private trafficLightFactor(vehicle: VehicleEntity): number {
    // Police vehicles ignore traffic lights when pursuing
    if (vehicle.kind === "police" && this.player.wanted > 0) return 1;

    for (const light of this.trafficLights) {
      if (light.state === "green") continue;

      const dist = vehicle.position.distanceTo(light.position);
      if (dist > TRAFFIC_LIGHT_CONFIG.slowDistance) continue;

      // Check if vehicle is heading toward this light
      const toLight = light.position.clone().sub(vehicle.position);
      toLight.y = 0;
      const heading = new Vector3(Math.sin(vehicle.direction), 0, Math.cos(vehicle.direction));
      const dot = toLight.normalize().dot(heading);

      if (dot < 0.3) continue; // not heading toward this light

      if (light.state === "red") {
        if (dist < TRAFFIC_LIGHT_CONFIG.stopDistance) return 0.02; // nearly stop
        return Math.max(0.1, dist / TRAFFIC_LIGHT_CONFIG.slowDistance);
      }
      if (light.state === "yellow") {
        if (dist < TRAFFIC_LIGHT_CONFIG.stopDistance) return 0.3; // slow significantly
        return Math.max(0.4, dist / TRAFFIC_LIGHT_CONFIG.slowDistance);
      }
    }
    return 1;
  }

  // ════════════════════════════════════════════════════════════
  //  NPC CRIME SYSTEM
  // ════════════════════════════════════════════════════════════

  private updateNPCCrimes(_dt: number) {
    if (this.introGraceTimer > 0) {
      return;
    }

    for (const pedestrian of this.pedestrians) {
      if (!shouldAttemptCrime(pedestrian)) continue;
      if (pedestrian.position.distanceTo(this.player.position) < 34) continue;
      if (Math.random() > NPC_CRIME_CONFIG.crimeChancePerSecond) continue;

      // Find a target civilian NPC nearby
      const targets = this.pedestrianHash.query(pedestrian.position, NPC_CRIME_CONFIG.crimeRange)
        .filter(p => p.id !== pedestrian.id && p.role === "civilian" && !p.inVehicleId && p.hp > 0);

      if (targets.length === 0) continue;

      const target = targets[Math.floor(Math.random() * targets.length)];
      const crimeType = pickNPCCrime(pedestrian);

      pedestrian.state = crimeType;
      pedestrian.crimeTargetId = target.id;
      pedestrian.crimeCooldown = NPC_CRIME_CONFIG.crimeCooldown;

      // Nearby NPCs panic
      const witnesses = this.pedestrianHash.query(pedestrian.position, 15)
        .filter(p => p.id !== pedestrian.id && p.id !== target.id && !p.inVehicleId);
      for (const witness of witnesses) {
        witness.panicTimer = Math.max(witness.panicTimer, 5);
        witness.state = "flee";
      }
    }
  }

  private alertPoliceToNPCCrime(criminal: PedestrianEntity) {
    // Find nearby police and make them pursue the criminal NPC
    const nearbyCops = this.pedestrians.filter(
      p => p.role === "cop" && p.position.distanceTo(criminal.position) < NPC_CRIME_CONFIG.policeNoticeRange
    );
    for (const cop of nearbyCops) {
      cop.state = "pursue";
      cop.pursuitTarget = "npc";
      cop.pursuitTargetId = criminal.id;
      cop.target = criminal.position.clone();
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SHOP SYSTEM
  // ════════════════════════════════════════════════════════════

  private toggleShop() {
    if (this.shopOpen) {
      // Exit shop
      this.shopOpen = false;
      this.activeShopId = null;
      this.player.mesh.visible = true;
      this.notify("Left the shop.", "info");
      return;
    }

    if (this.player.inVehicle) return;

    // Find nearest shop
    const nearestShop = this.shops.find(shop =>
      shop.position.distanceTo(this.player.position) < SHOP_CONFIG.interactionRange
    );

    if (!nearestShop) {
      return;
    }

    this.shopOpen = true;
    this.activeShopId = nearestShop.id;
    const shopName = SHOP_CONFIG.shops[nearestShop.type].name;
    this.notify(`Welcome to ${shopName}!`, "success");
  }

  purchaseShopItem(itemIndex: number) {
    if (!this.shopOpen || !this.activeShopId) return;

    const shop = this.shops.find(s => s.id === this.activeShopId);
    if (!shop) return;

    const item = shop.items[itemIndex];
    if (!item) return;

    if (this.player.cash < item.price) {
      this.notify("Not enough cash!", "danger");
      return;
    }

    this.player.cash -= item.price;

    if (item.effect === "health") {
      this.player.health = Math.min(100, this.player.health + item.value);
      this.notify(`Used ${item.name}. Health +${item.value}.`, "success");
    } else if (item.effect === "armor") {
      this.player.armor = Math.min(100, this.player.armor + item.value);
      this.notify(`Equipped ${item.name}. Armor +${item.value}.`, "success");
    }
  }

  private updateShops(_dt: number) {
    // Animate shop door markers (pulse glow)
    for (const shop of this.shops) {
      if (shop.doorMarker.material instanceof MeshLambertMaterial) {
        shop.doorMarker.material.opacity = 0.3 + Math.sin(performance.now() * 0.003) * 0.15;
      }
    }
  }

  private getShopMenuState() {
    if (!this.shopOpen || !this.activeShopId) {
      return { open: false, shopName: "", shopType: null as null, items: [] as typeof this.shops[0]["items"] };
    }

    const shop = this.shops.find(s => s.id === this.activeShopId);
    if (!shop) {
      return { open: false, shopName: "", shopType: null as null, items: [] as typeof this.shops[0]["items"] };
    }

    const shopConfig = SHOP_CONFIG.shops[shop.type];
    return {
      open: true,
      shopName: shopConfig.name,
      shopType: shop.type,
      items: [...shop.items]
    };
  }

  private getInteractionPrompt(): string | null {
    if (this.shopOpen) return "Press E to leave the shop.";
    if (this.player.inVehicle) return null;

    const nearShop = this.shops.find(shop =>
      shop.position.distanceTo(this.player.position) < SHOP_CONFIG.interactionRange
    );

    if (nearShop) {
      const shopName = SHOP_CONFIG.shops[nearShop.type].name;
      return `Press E to enter ${shopName}`;
    }

    return null;
  }
}
