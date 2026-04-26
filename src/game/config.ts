/** ── Vehicle class physics constants ── */
export const VEHICLE_PHYSICS = {
  car: {
    topSpeed: 15,
    accelRate: 19,
    steerFactor: 1.85,
    mass: 1400,
    traction: 0.85,
    hp: 70,
    heat: 0.35,
    label: "Sedan"
  },
  bike: {
    topSpeed: 19,
    accelRate: 24,
    steerFactor: 2.4,
    mass: 350,
    traction: 0.7,
    hp: 45,
    heat: 0.25,
    label: "Bike"
  },
  muscle: {
    topSpeed: 22,
    accelRate: 22,
    steerFactor: 1.55,
    mass: 1800,
    traction: 0.55,
    hp: 85,
    heat: 0.6,
    label: "Muscle"
  },
  ev: {
    topSpeed: 16,
    accelRate: 32,
    steerFactor: 1.9,
    mass: 2200,
    traction: 0.8,
    hp: 75,
    heat: 0.2,
    label: "EV"
  },
  suv: {
    topSpeed: 13,
    accelRate: 14,
    steerFactor: 1.45,
    mass: 2600,
    traction: 0.92,
    hp: 110,
    heat: 0.3,
    label: "SUV"
  }
} as const;

/** ── Police search & LKP config ── */
export const POLICE_CONFIG = {
  losCheckInterval: 0.5,
  lkpRushDuration: 8,
  gridSweepRadius: 60,
  gridSweepExpandRate: 12,
  checkpointWantedThreshold: 4,
  vehicleHeatMultiplier: {
    neonSupercar: 0.85,
    whiteSports: 0.55,
    greySeden: 0.2,
    stolenPolice: 0.15
  },
  searchPhaseSpeeds: {
    chase: 1.0,
    rush_lkp: 0.9,
    grid_sweep: 0.6,
    checkpoint: 0.3
  }
} as const;

/** ── Digital Footprint / ViceGram config ── */
export const FOOTPRINT_CONFIG = {
  maxScore: 100,
  decayPerSecond: 0.2,
  filmingUploadScore: 8,
  crimePublicScore: 15,
  deadZoneDecayMultiplier: 3,
  thresholds: {
    low: 20,
    medium: 60,
    high: 80
  },
  policeResponseMultiplier: {
    low: 1.0,
    medium: 1.5,
    high: 2.0
  },
  breakingNewsCooldown: 45,
  vicegramAlertInterval: 20
} as const;

/** ── Particle system config ── */
export const PARTICLE_CONFIG = {
  bloodSplatterCount: 5,
  bloodSplatterSpeed: 4.5,
  bloodSplatterLife: 3.0,
  bloodPoolLife: 12.0,
  debrisCount: 4,
  debrisSpeed: 6.0,
  debrisLife: 2.5,
  sparkCount: 3,
  sparkSpeed: 8.0,
  sparkLife: 0.6,
  smokeLife: 4.0,
  smokeRiseSpeed: 1.5,
  glassCount: 6,
  glassSpeed: 5.0,
  glassLife: 2.0,
  explosionCount: 45,
  explosionSpeed: 18.0,
  explosionLife: 1.5,
  fireCount: 25,
  fireSpeed: 3.5,
  fireLife: 2.0,
  maxParticles: 400
} as const;

/** ── Destruction tier config ── */
export const DESTRUCTION_CONFIG = {
  propHp: 15,
  structuralHp: 50,
  minImpactSpeed: 5,
  propDebrisCount: 3,
  glassShardCount: 5
} as const;

/** ── Traffic light timing config ── */
export const TRAFFIC_LIGHT_CONFIG = {
  greenDuration: 8,
  yellowDuration: 2,
  redDuration: 8,
  stopDistance: 12,
  slowDistance: 20
} as const;

/** ── NPC crime behavior config ── */
export const NPC_CRIME_CONFIG = {
  /** Chance per second for aggressive/hustler NPCs to attempt crime */
  crimeChancePerSecond: 0.00045,
  /** Minimum cooldown between crime attempts per NPC */
  crimeCooldown: 60,
  /** Distance to look for crime targets */
  crimeRange: 20,
  /** How long angry NPCs chase after being carjacked */
  angerDuration: 10,
  /** Min distance police must be to notice NPC crime */
  policeNoticeRange: 40
} as const;

/** ── Shop config ── */
export const SHOP_CONFIG = {
  interactionRange: 4.5,
  shops: {
    convenience: {
      name: "24/7 Convenience",
      items: [
        { name: "Bandage", price: 25, effect: "health" as const, value: 15 },
        { name: "Med Kit", price: 80, effect: "health" as const, value: 50 },
        { name: "Energy Drink", price: 15, effect: "health" as const, value: 10 }
      ]
    },
    burger: {
      name: "Vice Burger",
      items: [
        { name: "Classic Burger", price: 20, effect: "health" as const, value: 25 },
        { name: "Fries", price: 8, effect: "health" as const, value: 10 },
        { name: "Mega Meal", price: 45, effect: "health" as const, value: 60 }
      ]
    },
    clothing: {
      name: "Vice Threads",
      items: [
        { name: "Kevlar Vest", price: 200, effect: "armor" as const, value: 50 },
        { name: "Street Jacket", price: 100, effect: "armor" as const, value: 25 },
        { name: "Reinforced Hoodie", price: 60, effect: "armor" as const, value: 15 }
      ]
    }
  }
} as const;

export const GAME_CONFIG = {
  fixedStep: 1 / 60,
  maxPhysicsSteps: 3,
  playerSpeed: 11.5,
  playerAimSpeed: 8.25,
  jumpVelocity: 8,
  gravity: -24,
  cameraDistance: 11.5,
  cameraHeight: 5.2,
  aimCameraDistance: 5.8,
  aimShoulderOffset: 1.9,
  cameraSmooth: 0.2,
  floatingOriginThreshold: 180,
  wantedDecaySeconds: 24,
  bulletSpeed: 92,
  policeSpawnDistance: 76,
  interactionRange: 4,
  pedestrianCount: 110,
  trafficCount: 20,
  parkedCount: 14,
  blockSize: 52,
  roadWidth: 18,
  blocksX: 5,
  blocksZ: 4,
  worldMinX: -260,
  worldMaxX: 260,
  worldMinZ: -220,
  worldMaxZ: 240,
  minimapSize: 100,
  mouseSensitivityOptions: [0.8, 1, 1.25] as const,
  densityOptions: [0.75, 1, 1.35] as const
} as const;

export const WEAPONS = {
  fists: {
    name: "Fists",
    cooldown: 0.55,
    damage: 18,
    range: 3
  },
  pistol: {
    name: "Pistol",
    cooldown: 0.22,
    damage: 22,
    range: 96
  },
  smg: {
    name: "SMG",
    cooldown: 0.08,
    damage: 9,
    range: 84
  },
  shotgun: {
    name: "Shotgun",
    cooldown: 0.72,
    damage: 30,
    range: 40
  }
} as const;

export const CITY_COLORS = {
  asphalt: 0x414856,
  water: 0x1c537f,
  sand: 0xcaa56e,
  park: 0x4b8747,
  neonBlue: 0x54d8ff,
  neonOrange: 0xff8656,
  policeBlue: 0x274ed5,
  policeWhite: 0xf0f5ff,
  policeBlack: 0x0f1621,
  civilianCar: [0xda5a46, 0xf0b54b, 0x5ab3b8, 0x9b72ba, 0x72b56b, 0xd66d9f],
  bike: [0x202020, 0xcc2f2f, 0x2f63cc],
  muscle: [0xb52222, 0x1a1a1a, 0x2a4db5, 0xf5a623],
  ev: [0xe8f4f8, 0x2ad4bf, 0x6ec6ff, 0xc8f7dc],
  suv: [0x3a3a3a, 0x5c5c5c, 0x8b7355, 0x2c4a1e],
  blood: 0x8b0000,
  bloodBright: 0xcc1111,
  debris: 0x444444,
  spark: 0xffdd44,
  smoke: 0x666666,
  glass: 0xaaddff,
  trafficLightGreen: 0x22cc44,
  trafficLightRed: 0xcc2222,
  trafficLightYellow: 0xffcc22,
  propWood: 0x8b6914,
  propMetal: 0x888888,
  explosion: 0xff5511,
  fire: 0xffaa00
};

export const CHEAT_CODES = [
  {
    code: "aspirine",
    label: "Restore Health"
  },
  {
    code: "preciousprotection",
    label: "Full Armor"
  },
  {
    code: "leavemealone",
    label: "Clear Wanted"
  },
  {
    code: "thugstools",
    label: "Weapon Refill"
  },
  {
    code: "betterthanwalking",
    label: "Spawn Bike"
  },
  {
    code: "bigbang",
    label: "Wreck Nearby Cars"
  },
  {
    code: "silentride",
    label: "Spawn EV"
  },
  {
    code: "americanmuscle",
    label: "Spawn Muscle Car"
  },
  {
    code: "offroad",
    label: "Spawn SUV"
  },
  {
    code: "ghostprotocol",
    label: "Clear Digital Footprint"
  }
] as const;
