import { Vector3 } from "three";
import type { Collider, NPCBrainState, NPCDailyActivity, PedestrianEntity, PlayerState } from "@/game/types";

/** ── Threat evaluation thresholds (meters) ── */
const THREAT_RANGES = {
  selfPreservation: 8,
  panicked: 25,
  alarmed: 50,
  curious: 100
};

/** How long NPC must stay in panicked state before self-preservation kicks in */
const SELF_PRESERVATION_THRESHOLD = 12;

/** Minimum time in curious state before transitioning */
const CURIOUS_EVALUATION_TIME = 3;

/** Daily activity durations (seconds) */
const DAILY_ACTIVITY_DURATIONS: Record<NPCDailyActivity, [number, number]> = {
  walking: [5, 15],
  window_shopping: [4, 10],
  sitting_bench: [8, 20],
  talking_group: [6, 15],
  phone_checking: [3, 8]
};

/**
 * NPC Finite State Machine — evaluates environmental threats
 * and determines the correct brain state.
 *
 * Priority order:
 *   P1: Self-preservation (flee, cover, call 911)
 *   P2: Threat assessment (evaluate LOS, distance, sound)
 *   P3: Social behavior (film on ViceGram, shout alerts)
 *   P4: Ambient loop (idle animations, dialogue)
 */
export function evaluateNPCState(
  pedestrian: PedestrianEntity,
  player: PlayerState,
  isPlayerThreatening: boolean,
  dt: number
): NPCBrainState {
  const distance = pedestrian.position.distanceTo(player.position);
  pedestrian.threatDistance = distance;

  // Increment FSM timer
  pedestrian.fsmTimer += dt;

  // If player is not threatening and far away, go idle
  if (!isPlayerThreatening && distance > THREAT_RANGES.curious) {
    if (pedestrian.fsmState !== "idle") {
      pedestrian.fsmTimer = 0;
    }
    return "idle";
  }

  // ── P1: Self-Preservation ──
  // If NPC has been panicked for over 12 seconds, seek cover
  if (
    pedestrian.fsmState === "panicked" &&
    pedestrian.fsmTimer > SELF_PRESERVATION_THRESHOLD
  ) {
    pedestrian.fsmTimer = 0;
    return "selfPreservation";
  }

  // Already in self-preservation? Stay until threat clears
  if (pedestrian.fsmState === "selfPreservation") {
    if (!isPlayerThreatening || distance > THREAT_RANGES.curious) {
      pedestrian.fsmTimer = 0;
      return "idle";
    }
    return "selfPreservation";
  }

  // ── P2: Threat Assessment ──
  if (isPlayerThreatening) {
    // Direct weapon threat within 25m → Panic
    if (distance < THREAT_RANGES.panicked) {
      if (pedestrian.fsmState !== "panicked") {
        pedestrian.fsmTimer = 0;
      }
      return "panicked";
    }

    // Commotion/explosion within 50m → Alarmed
    if (distance < THREAT_RANGES.alarmed) {
      if (pedestrian.fsmState !== "alarmed") {
        pedestrian.fsmTimer = 0;
      }
      return "alarmed";
    }

    // Distant activity within 100m → Curious
    if (distance < THREAT_RANGES.curious) {
      if (pedestrian.fsmState !== "curious") {
        pedestrian.fsmTimer = 0;
      }
      return "curious";
    }
  }

  // Panic timer still active? Keep running
  if (pedestrian.panicTimer > 0) {
    return "panicked";
  }

  return "idle";
}

/**
 * Convert FSM brain state to the legacy PedestrianState for compatibility.
 * Cops have their own state logic.
 */
export function fsmToLegacyState(
  brainState: NPCBrainState,
  pedestrian: PedestrianEntity,
  player: PlayerState
): PedestrianEntity["state"] {
  if (pedestrian.role === "cop") {
    return player.wanted > 0 ? "pursue" : "patrol";
  }

  // If NPC is angry (was carjacked / attacked), they override the FSM
  if (pedestrian.angerTimer > 0) {
    return "angry";
  }

  // If NPC is doing a crime, keep that state
  if (pedestrian.state === "npc_steal" || pedestrian.state === "npc_rob" || pedestrian.state === "npc_attack") {
    return pedestrian.state;
  }

  switch (brainState) {
    case "idle":
      // Check if NPC should be doing a daily activity
      if (pedestrian.dailyActivityTimer > 0) {
        return "daily_activity";
      }
      return "wander";
    case "curious":
      return "observe";
    case "alarmed":
      // Alarmed NPCs back away slowly while observing
      return "observe";
    case "panicked":
      return getPanicReaction(pedestrian);
    case "selfPreservation":
      return "flee";
    default:
      return "wander";
  }
}

/**
 * Get the archetype-based reaction when an NPC's car is stolen.
 * Returns the state the NPC should enter.
 */
export function getCarjackReaction(pedestrian: PedestrianEntity): PedestrianEntity["state"] {
  switch (pedestrian.archetype) {
    case "aggressive":
      return "angry"; // Fight back, chase the player
    case "hustler":
      return "angry"; // Also angry but will try to steal another car
    case "cautious":
      return "flee"; // Run away scared
    case "tourist":
      return "flee"; // Scream and run
    default:
      return "flee";
  }
}

/**
 * Get the archetype-based reaction when an NPC is attacked (hit/shot).
 */
export function getAttackReaction(pedestrian: PedestrianEntity): PedestrianEntity["state"] {
  switch (pedestrian.archetype) {
    case "aggressive":
      return "attack"; // Fight back
    case "hustler":
      return Math.random() > 0.5 ? "attack" : "flee"; // Run but might retaliate
    case "cautious":
      return "flee"; // Run and seek cover
    case "tourist":
      return "duck"; // Better to cower
    default:
      return "flee";
  }
}

/**
 * Get the archetype-based reaction when an NPC is panicked by loud noises, crashes, or general discomfort.
 */
export function getPanicReaction(pedestrian: PedestrianEntity): PedestrianEntity["state"] {
  if (pedestrian.inVehicleId) {
    if (pedestrian.archetype === "cautious" || pedestrian.archetype === "tourist") {
      return "abandon_vehicle";
    }
  }

  const roll = Math.random();
  switch (pedestrian.archetype) {
    case "aggressive":
      if (roll < 0.2) return "attack";
      if (roll < 0.5) return "duck";
      return "flee";
    case "tourist":
      if (roll < 0.4) return "duck";
      return "flee";
    case "hustler":
      return "flee";
    case "cautious":
      return "flee";
    default:
      return "flee";
  }
}

/**
 * Check if NPC should be "filming" for ViceGram
 * (Alarmed state with LOS to player)
 */
export function shouldFilm(
  pedestrian: PedestrianEntity,
  player: PlayerState
): boolean {
  if (pedestrian.role === "cop") return false;
  if (pedestrian.fsmState !== "alarmed" && pedestrian.fsmState !== "curious") return false;
  if (!pedestrian.hasLineOfSight) return false;
  if (pedestrian.threatDistance > 80) return false;
  return true;
}

/**
 * Pick a random daily activity for an idle NPC.
 */
export function pickDailyActivity(): { activity: NPCDailyActivity; duration: number } {
  const activities: NPCDailyActivity[] = ["walking", "window_shopping", "sitting_bench", "talking_group", "phone_checking"];
  const activity = activities[Math.floor(Math.random() * activities.length)];
  const [minDur, maxDur] = DAILY_ACTIVITY_DURATIONS[activity];
  const duration = minDur + Math.random() * (maxDur - minDur);
  return { activity, duration };
}

/**
 * Determine if an NPC should attempt a crime based on archetype.
 * Only aggressive and hustler types can commit crimes.
 */
export function shouldAttemptCrime(pedestrian: PedestrianEntity): boolean {
  if (pedestrian.role !== "civilian") return false;
  if (pedestrian.crimeCooldown > 0) return false;
  if (pedestrian.state !== "wander" && pedestrian.state !== "daily_activity") return false;
  if (pedestrian.archetype !== "aggressive" && pedestrian.archetype !== "hustler") return false;
  return true;
}

/**
 * Pick what crime an NPC attempts:
 * - aggressive: more likely to attack
 * - hustler: more likely to steal/rob
 */
export function pickNPCCrime(pedestrian: PedestrianEntity): "npc_steal" | "npc_rob" | "npc_attack" {
  if (pedestrian.archetype === "aggressive") {
    const roll = Math.random();
    if (roll < 0.5) return "npc_attack";
    if (roll < 0.8) return "npc_rob";
    return "npc_steal";
  }
  // hustler
  const roll = Math.random();
  if (roll < 0.5) return "npc_steal";
  if (roll < 0.85) return "npc_rob";
  return "npc_attack";
}

/**
 * Find cover position — look for the nearest building collider
 * and position the NPC behind it relative to the threat.
 */
export function findCoverPosition(
  pedestrian: PedestrianEntity,
  player: PlayerState,
  colliders: Collider[]
): Vector3 | null {
  const threatDir = pedestrian.position.clone().sub(player.position);
  threatDir.y = 0;
  threatDir.normalize();

  let bestCover: Vector3 | null = null;
  let bestDistSq = Infinity;

  for (const collider of colliders) {
    // Center of building
    const cx = (collider.minX + collider.maxX) / 2;
    const cz = (collider.minZ + collider.maxZ) / 2;

    // Candidate cover position: behind the building relative to the player
    const coverPos = new Vector3(
      cx + threatDir.x * ((collider.maxX - collider.minX) / 2 + 1.5),
      0,
      cz + threatDir.z * ((collider.maxZ - collider.minZ) / 2 + 1.5)
    );

    const distSq = pedestrian.position.distanceToSquared(coverPos);

    // Must be within reasonable range
    if (distSq < 40 * 40 && distSq < bestDistSq) {
      bestDistSq = distSq;
      bestCover = coverPos;
    }
  }

  return bestCover;
}

/** Move pedestrian toward a target position */
export function movePedestrianToward(
  pedestrian: PedestrianEntity,
  target: Vector3,
  speed: number,
  dt: number
) {
  const offset = target.clone().sub(pedestrian.position);
  offset.y = 0;

  if (offset.lengthSq() < 0.0001) {
    return;
  }

  offset.normalize();
  pedestrian.position.addScaledVector(offset, speed * dt);
  pedestrian.mesh.rotation.y = Math.atan2(offset.x, offset.z);
}

/** Pick a random wander target near an origin */
export function pickNearbyWanderTarget(origin: Vector3, radius = 24) {
  const target = origin.clone();
  if (Math.random() > 0.5) {
    target.x += (Math.random() - 0.5) * radius * 1.5;
    target.z += (Math.random() - 0.5) * radius * 0.4;
  } else {
    target.z += (Math.random() - 0.5) * radius * 1.5;
    target.x += (Math.random() - 0.5) * radius * 0.4;
  }
  return target;
}

/**
 * Simple line-of-sight check against axis-aligned building colliders.
 * Returns true if there is an unobstructed path between A and B.
 */
export function checkLineOfSight(
  from: Vector3,
  to: Vector3,
  colliders: Collider[]
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const steps = Math.ceil(Math.sqrt(dx * dx + dz * dz) / 3);

  if (steps === 0) return true;

  const stepX = dx / steps;
  const stepZ = dz / steps;

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = from.x + stepX * i;
    const pz = from.z + stepZ * i;
    const py = from.y + (to.y - from.y) * t;

    for (const c of colliders) {
      const minY = c.minY ?? -Infinity;
      const maxY = c.maxY ?? Infinity;
      if (
        px >= c.minX &&
        px <= c.maxX &&
        pz >= c.minZ &&
        pz <= c.maxZ &&
        py >= minY &&
        py <= maxY
      ) {
        return false;
      }
    }
  }

  return true;
}
