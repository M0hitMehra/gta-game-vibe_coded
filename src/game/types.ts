import type { AnimationAction, AnimationClip, AnimationMixer, Group, Mesh, Vector3 } from "three";

export type WeaponId = "fists" | "pistol" | "smg" | "shotgun";
export type NoticeTone = "info" | "success" | "danger";
export type CharacterVariantId = "street" | "soldier" | "xbot";
export type VehicleClass = "car" | "bike" | "ev" | "muscle" | "suv";
export type VehicleKind = "civilian" | "police";
export type PedestrianRole = "civilian" | "cop" | "driver";
export type PedestrianState =
  | "wander"
  | "observe"
  | "flee"
  | "attack"
  | "patrol"
  | "pursue"
  | "carjacked"
  | "angry"
  | "duck"
  | "abandon_vehicle"
  | "daily_activity"
  | "npc_steal"
  | "npc_rob"
  | "npc_attack";
export type Archetype = "cautious" | "tourist" | "hustler" | "aggressive" | "local" | "worker" | "vendor" | "criminal";
export type MissionStepKind = "reach" | "loseWanted" | "collect";
export type SettingKey = "mouseSensitivity" | "showDebug" | "trafficDensity" | "crowdDensity";

/** NPC daily activity types */
export type NPCDailyActivity = "walking" | "window_shopping" | "sitting_bench" | "talking_group" | "phone_checking";

/** NPC Finite State Machine brain states */
export type NPCBrainState =
  | "unaware"
  | "idle"
  | "curious"
  | "alert"
  | "alarmed"
  | "panicked"
  | "selfPreservation";

/** Traffic light state */
export type TrafficLightState = "green" | "yellow" | "red";

/** Shop types */
export type ShopType = "convenience" | "burger" | "clothing";

/** Destruction tier for world props */
export type DestructionTier = "prop" | "structural" | "static";

/** Police search phase when player breaks LOS */
export type PoliceSearchPhase =
  | "chase"
  | "rush_lkp"
  | "grid_sweep"
  | "checkpoint";

/** Particle effect types */
export type ParticleType =
  | "blood_splatter"
  | "blood_pool"
  | "debris"
  | "spark"
  | "smoke"
  | "glass"
  | "explosion"
  | "fire";

export type Collider = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
};

export type WalkableZone = {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  rampAxis?: "x" | "z";
  rampStart?: number;
  rampEnd?: number;
  rampStartHeight?: number;
  rampEndHeight?: number;
};

export type ParallaxLayer = {
  mesh: Group | Mesh;
  basePosition: Vector3;
  factorX: number;
  factorZ: number;
  bobAmplitude?: number;
};

/** Destructible world prop entity */
export type DestructibleProp = {
  id: string;
  mesh: Group | Mesh;
  position: Vector3;
  tier: DestructionTier;
  hp: number;
  destroyed: boolean;
  collider: Collider;
};

/** Traffic light entity */
export type TrafficLightEntity = {
  id: string;
  mesh: Group;
  position: Vector3;
  state: TrafficLightState;
  timer: number;
  /** Which road axis this light controls: ns = north-south road, ew = east-west */
  axis: "ns" | "ew";
  /** Red light mesh for emissive update */
  redMesh: Mesh;
  /** Yellow light mesh */
  yellowMesh: Mesh;
  /** Green light mesh */
  greenMesh: Mesh;
};

/** Shop item for purchase */
export type ShopItem = {
  name: string;
  price: number;
  effect: "health" | "armor";
  value: number;
};

/** Shop entity in the world */
export type ShopEntity = {
  id: string;
  type: ShopType;
  position: Vector3;
  doorMarker: Mesh;
  items: ShopItem[];
};

export type MinimapDot = {
  x: number;
  y: number;
  kind: "player" | "vehicle" | "police" | "npc" | "pickup" | "mission";
  heading?: number;
};


export type HudSnapshot = {
  health: number;
  armor: number;
  cash: number;
  wanted: number;
  weapon: string;
  ammo: string;
  speed: number;
  missionTitle: string;
  missionText: string;
  district: string;
  timeLabel: string;
  pickupHint: string;
  debug: string;
  inVehicle: boolean;
  isAiming: boolean;
  digitalFootprint: number;
  notification: {
    message: string;
    tone: NoticeTone;
  } | null;
  statusOverlay: {
    title: string;
    message: string;
    countdown: number;
  } | null;
  /** Shop UI state */
  shopMenu: {
    open: boolean;
    shopName: string;
    shopType: ShopType | null;
    items: ShopItem[];
  };
  /** Interaction prompt near shops */
  interactionPrompt: string | null;
  minimap: {
    dots: MinimapDot[];
    playerHeading: number;
  };
  pauseMenu: {
    open: boolean;
    settings: {
      mouseSensitivity: string;
      trafficDensity: string;
      crowdDensity: string;
      showDebug: string;
    };
    recentCheat: string | null;
    cheats: string[];
  };
};

export type PlayerState = {
  position: Vector3;
  velocity: Vector3;
  mesh: Group;
  health: number;
  armor: number;
  cash: number;
  wanted: number;
  wantedTimer: number;
  onGround: boolean;
  inVehicle: boolean;
  vehicleId: string | null;
  weapon: WeaponId;
  ammo: Record<Exclude<WeaponId, "fists">, number>;
  shootCooldown: number;
  radius: number;
  /** Digital Footprint / ViceGram trending score (0-100) */
  digitalFootprint: number;
  /** Timer for footprint decay */
  footprintDecayTimer: number;
  /** Timer for breaking news cooldown */
  breakingNewsCooldown: number;
  mixer?: AnimationMixer;
  idleAction?: AnimationAction;
  walkAction?: AnimationAction;
  runAction?: AnimationAction;
  aimAction?: AnimationAction;
  shootAction?: AnimationAction;
  crouchAction?: AnimationAction;
  meleeAction?: AnimationAction;
  hurtAction?: AnimationAction;
  deathAction?: AnimationAction;
};

/** Vehicle damage dent record */
export type VehicleDent = {
  /** Child mesh index that was deformed */
  meshIndex: number;
  /** Scale distortion applied */
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** Position offset */
  offsetX: number;
  offsetZ: number;
};

export type VehicleEntity = {
  id: string;
  mesh: Group;
  position: Vector3;
  direction: number;
  speed: number;
  kind: VehicleKind;
  vehicleClass: VehicleClass;
  occupiedByPlayer: boolean;
  driverPedId: string | null;
  parked: boolean;
  hp: number;
  maxHp: number;
  routeIndex: number | null;
  nodeIndex: number;
  radius: number;
  maxSpeed: number;
  wheelMeshes: Mesh[];
  driverAvatar: Group | null;
  sirenTimer: number;
  _cellKey?: string;
  /** Crash damage dents */
  dents: VehicleDent[];
  /** Cumulative damage level 0-1 */
  damageLevel: number;
  /** Vehicle heat signature for police recognition (0-1, higher = easier to spot) */
  vehicleHeat: number;
  /** Is currently smoking from damage */
  smoking: boolean;
  /** Original body color for damage darkening */
  originalColor: number;
  /** Vehicle mass for physics (kg equivalent) */
  mass: number;
  /** Traction/grip factor */
  traction: number;
  /** Acceleration multiplier */
  accelRate: number;
  /** Timer tracking how long vehicle path is blocked */
  blockedTimer: number;
  /** If the vehicle has exploded */
  exploded: boolean;
  /** Timer for how long the carcass burns before disappearing */
  burnTimer: number;
  /** Timer tracking how long the vehicle is on fire before exploding */
  fireTimer: number;
  /** If the vehicle is currently on fire (pre-explosion state) */
  onFire: boolean;
};

export type PedestrianEntity = {
  id: string;
  mesh: Group;
  position: Vector3;
  target: Vector3;
  speed: number;
  state: PedestrianState;
  role: PedestrianRole;
  archetype: Archetype;
  panicTimer: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  reactionTimer: number;
  inVehicleId: string | null;
  radius: number;
  _cellKey?: string;
  /** FSM brain state for advanced behavior */
  fsmState: NPCBrainState;
  /** Timer for current FSM state (how long in this state) */
  fsmTimer: number;
  /** Cached threat distance to player */
  threatDistance: number;
  /** Whether NPC has line-of-sight to player */
  hasLineOfSight: boolean;
  /** Position NPC is trying to reach for cover */
  coverTarget: Vector3 | null;
  /** Timer for ViceGram filming behavior */
  filmingTimer: number;
  /** Blood effect timer (visual flash) */
  bloodTimer: number;
  /** Whether NPC was knocked by vehicle impact */
  knockedBack: boolean;
  /** Knockback velocity */
  knockVelocity: Vector3;
  /** Current daily activity when idle */
  dailyActivity: NPCDailyActivity;
  /** Timer for current daily activity duration */
  dailyActivityTimer: number;
  /** Anger timer — for carjacked / attacked reaction */
  angerTimer: number;
  /** NPC crime target ID (another pedestrian or vehicle) */
  crimeTargetId: string | null;
  /** NPC crime cooldown — prevents constant crime attempts */
  crimeCooldown: number;
  /** What this NPC is actively pursuing, if anything */
  pursuitTarget: "player" | "npc" | null;
  /** Target entity id when pursuing an NPC criminal */
  pursuitTargetId: string | null;
  /** Who influenced this NPC's state (for social spread) */
  influencedBy: string | null;
  /** Current awareness scale (0-100) */
  awarenessLevel: number;
  characterVariantId?: CharacterVariantId;
  mixer?: AnimationMixer;
  idleAction?: AnimationAction;
  walkAction?: AnimationAction;
  runAction?: AnimationAction;
  aimAction?: AnimationAction;
  shootAction?: AnimationAction;
  crouchAction?: AnimationAction;
  meleeAction?: AnimationAction;
  hurtAction?: AnimationAction;
  deathAction?: AnimationAction;
};

export type ExternalSceneAsset = {
  scene: Group;
};

export type ExternalAnimatedAsset = ExternalSceneAsset & {
  animations: AnimationClip[];
};

export type BulletRecord = {
  mesh: Mesh;
  position: Vector3;
  velocity: Vector3;
  life: number;
  damage: number;
  source: "player" | "police";
  active: boolean;
};

export type PickupEntity = {
  id: string;
  mesh: Group;
  position: Vector3;
  kind: "smg" | "armor" | "cash";
  taken: boolean;
};

export type MissionStep = {
  kind: MissionStepKind;
  text: string;
  target: Vector3;
  radius: number;
  requiredPickupId?: string;
};

export type MissionDefinition = {
  id: string;
  name: string;
  reward: number;
  start: Vector3;
  steps: MissionStep[];
};

export type MissionRuntime = {
  definition: MissionDefinition;
  stepIndex: number;
  active: boolean;
  completed: boolean;
  marker: Mesh;
  beam: Mesh;
};

export type PersistenceState = {
  collectedPickups: string[];
  completedMissions: string[];
  lastSaved: string | null;
};

export type EngineEvents = {
  notify: {
    message: string;
    tone: NoticeTone;
  };
};

export type TrafficSpawn = {
  routeIndex: number;
  nodeIndex: number;
  vehicleClass: VehicleClass;
  kind: VehicleKind;
};

export type ParkedSpawn = {
  position: Vector3;
  direction: number;
  vehicleClass: VehicleClass;
  withDriver: boolean;
};
