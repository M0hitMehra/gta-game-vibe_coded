import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  MeshLambertMaterial,
  Scene,
  SphereGeometry,
  Vector3
} from "three";
import { CITY_COLORS, PARTICLE_CONFIG } from "@/game/config";
import type { ParticleType } from "@/game/types";

type Particle = {
  mesh: Mesh;
  position: Vector3;
  velocity: Vector3;
  life: number;
  maxLife: number;
  type: ParticleType;
  active: boolean;
  gravity: number;
  fadeOut: boolean;
};

export class ParticleSystem {
  private readonly scene: Scene;
  private readonly pool: Particle[] = [];
  private readonly active: Particle[] = [];

  constructor(scene: Scene) {
    this.scene = scene;

    // Pre-allocate particle pool
    for (let i = 0; i < PARTICLE_CONFIG.maxParticles; i++) {
      const mesh = new Mesh(
        new SphereGeometry(0.12, 6, 6),
        new MeshLambertMaterial({ color: 0xffffff })
      );
      mesh.visible = false;
      this.scene.add(mesh);

      this.pool.push({
        mesh,
        position: new Vector3(),
        velocity: new Vector3(),
        life: 0,
        maxLife: 0,
        type: "debris",
        active: false,
        gravity: -15,
        fadeOut: true
      });
    }
  }

  private acquire(): Particle | null {
    const particle = this.pool.pop();
    if (!particle) return null;
    particle.active = true;
    particle.mesh.visible = true;
    this.active.push(particle);
    return particle;
  }

  private release(particle: Particle) {
    particle.active = false;
    particle.mesh.visible = false;
    particle.life = 0;
    const idx = this.active.indexOf(particle);
    if (idx >= 0) this.active.splice(idx, 1);
    this.pool.push(particle);
  }

  /** Spawn blood splatter particles from an impact point */
  spawnBloodSplatter(origin: Vector3, impactDirection: Vector3) {
    const count = PARTICLE_CONFIG.bloodSplatterCount;
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) return;

      p.type = "blood_splatter";
      p.life = PARTICLE_CONFIG.bloodSplatterLife;
      p.maxLife = PARTICLE_CONFIG.bloodSplatterLife;
      p.gravity = -12;
      p.fadeOut = true;
      p.position.copy(origin).setY(origin.y + 0.8 + Math.random() * 0.6);

      // Spread outward from impact direction with randomness
      const spread = PARTICLE_CONFIG.bloodSplatterSpeed;
      p.velocity.set(
        impactDirection.x * spread + (Math.random() - 0.5) * 3,
        Math.random() * 3 + 1.5,
        impactDirection.z * spread + (Math.random() - 0.5) * 3
      );

      // Blood red color with variation
      const mat = p.mesh.material as MeshLambertMaterial;
      const isLight = Math.random() > 0.5;
      mat.color.setHex(isLight ? CITY_COLORS.bloodBright : CITY_COLORS.blood);
      mat.emissive.setHex(CITY_COLORS.blood);
      mat.emissiveIntensity = 0.3;

      // Vary size
      const size = 0.08 + Math.random() * 0.12;
      p.mesh.geometry.dispose();
      p.mesh.geometry = new SphereGeometry(size, 5, 5);
    }
  }

  /** Spawn a blood pool decal on the ground */
  spawnBloodPool(position: Vector3) {
    const p = this.acquire();
    if (!p) return;

    p.type = "blood_pool";
    p.life = PARTICLE_CONFIG.bloodPoolLife;
    p.maxLife = PARTICLE_CONFIG.bloodPoolLife;
    p.gravity = 0;
    p.fadeOut = true;
    p.position.copy(position).setY(0.03);
    p.velocity.set(0, 0, 0);

    // Flat disc shape
    p.mesh.geometry.dispose();
    p.mesh.geometry = new CylinderGeometry(0.8, 1.2, 0.04, 8);

    const mat = p.mesh.material as MeshLambertMaterial;
    mat.color.setHex(CITY_COLORS.blood);
    mat.emissive.setHex(CITY_COLORS.blood);
    mat.emissiveIntensity = 0.15;
    mat.transparent = true;
    mat.opacity = 0.85;
  }

  /** Spawn debris from vehicle crash or prop destruction */
  spawnDebris(origin: Vector3, impactDirection: Vector3, color = CITY_COLORS.debris) {
    const count = PARTICLE_CONFIG.debrisCount;
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) return;

      p.type = "debris";
      p.life = PARTICLE_CONFIG.debrisLife;
      p.maxLife = PARTICLE_CONFIG.debrisLife;
      p.gravity = -18;
      p.fadeOut = true;
      p.position.copy(origin).setY(origin.y + 0.5 + Math.random() * 0.5);

      const spread = PARTICLE_CONFIG.debrisSpeed;
      p.velocity.set(
        impactDirection.x * spread * 0.5 + (Math.random() - 0.5) * spread,
        Math.random() * 4 + 2,
        impactDirection.z * spread * 0.5 + (Math.random() - 0.5) * spread
      );

      // Small cube debris
      const size = 0.1 + Math.random() * 0.15;
      p.mesh.geometry.dispose();
      p.mesh.geometry = new BoxGeometry(size, size, size);

      const mat = p.mesh.material as MeshLambertMaterial;
      mat.color.setHex(color);
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
      mat.transparent = false;
      mat.opacity = 1;
    }
  }

  /** Spawn sparks from bullet impact */
  spawnSparks(origin: Vector3, direction: Vector3) {
    const count = PARTICLE_CONFIG.sparkCount;
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) return;

      p.type = "spark";
      p.life = PARTICLE_CONFIG.sparkLife;
      p.maxLife = PARTICLE_CONFIG.sparkLife;
      p.gravity = -8;
      p.fadeOut = true;
      p.position.copy(origin);

      const spread = PARTICLE_CONFIG.sparkSpeed;
      p.velocity.set(
        direction.x * spread + (Math.random() - 0.5) * spread * 0.8,
        Math.random() * 3 + 1,
        direction.z * spread + (Math.random() - 0.5) * spread * 0.8
      );

      const size = 0.04 + Math.random() * 0.06;
      p.mesh.geometry.dispose();
      p.mesh.geometry = new SphereGeometry(size, 4, 4);

      const mat = p.mesh.material as MeshLambertMaterial;
      mat.color.setHex(CITY_COLORS.spark);
      mat.emissive.setHex(CITY_COLORS.spark);
      mat.emissiveIntensity = 2.0;
      mat.transparent = false;
      mat.opacity = 1;
    }
  }

  /** Spawn smoke from damaged vehicle */
  spawnSmoke(origin: Vector3) {
    const p = this.acquire();
    if (!p) return;

    p.type = "smoke";
    p.life = PARTICLE_CONFIG.smokeLife;
    p.maxLife = PARTICLE_CONFIG.smokeLife;
    p.gravity = 0;
    p.fadeOut = true;
    p.position.copy(origin).setY(origin.y + 1.2);
    p.velocity.set(
      (Math.random() - 0.5) * 0.8,
      PARTICLE_CONFIG.smokeRiseSpeed,
      (Math.random() - 0.5) * 0.8
    );

    const size = 0.3 + Math.random() * 0.4;
    p.mesh.geometry.dispose();
    p.mesh.geometry = new SphereGeometry(size, 6, 6);

    const mat = p.mesh.material as MeshLambertMaterial;
    mat.color.setHex(CITY_COLORS.smoke);
    mat.emissive.setHex(0x000000);
    mat.transparent = true;
    mat.opacity = 0.6;
  }

  /** Spawn glass shards from structural destruction */
  spawnGlass(origin: Vector3, impactDirection: Vector3) {
    const count = PARTICLE_CONFIG.glassCount;
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) return;

      p.type = "glass";
      p.life = PARTICLE_CONFIG.glassLife;
      p.maxLife = PARTICLE_CONFIG.glassLife;
      p.gravity = -14;
      p.fadeOut = true;
      p.position.copy(origin).setY(origin.y + Math.random() * 2);

      const spread = PARTICLE_CONFIG.glassSpeed;
      p.velocity.set(
        impactDirection.x * spread + (Math.random() - 0.5) * spread,
        Math.random() * 2 + 1,
        impactDirection.z * spread + (Math.random() - 0.5) * spread
      );

      const sx = 0.05 + Math.random() * 0.12;
      const sy = 0.12 + Math.random() * 0.18;
      p.mesh.geometry.dispose();
      p.mesh.geometry = new BoxGeometry(sx, sy, 0.02);

      const mat = p.mesh.material as MeshLambertMaterial;
      mat.color.setHex(CITY_COLORS.glass);
      mat.emissive.setHex(CITY_COLORS.glass);
      mat.emissiveIntensity = 0.4;
      mat.transparent = true;
      mat.opacity = 0.7;
    }
  }

  /** Spawn fire particles slowly (for burning vehicles) */
  spawnFire(origin: Vector3) {
    const fireCount = 4;
    for (let i = 0; i < fireCount; i++) {
       const p = this.acquire();
       if (!p) return;

       p.type = "fire";
       p.life = PARTICLE_CONFIG.fireLife * (0.5 + Math.random() * 0.5);
       p.maxLife = p.life;
       p.gravity = 1.2;
       p.fadeOut = true;
       p.position.copy(origin).setY(origin.y + 0.5 + Math.random() * 1.5);

       const speed = PARTICLE_CONFIG.fireSpeed * 0.4;
       p.velocity.set(
         (Math.random() - 0.5) * speed,
         Math.random() * speed + 1,
         (Math.random() - 0.5) * speed
       );

       const size = 0.4 + Math.random() * 0.6;
       p.mesh.geometry.dispose();
       p.mesh.geometry = new BoxGeometry(size, size, size);

       const mat = p.mesh.material as MeshLambertMaterial;
       mat.color.setHex(CITY_COLORS.fire);
       mat.emissive.setHex(CITY_COLORS.fire);
       mat.emissiveIntensity = 1.5;
       mat.transparent = true;
       mat.opacity = 0.8;
    }
  }

  /** Spawn an explosion */
  spawnExplosion(origin: Vector3) {
    const explosionCount = PARTICLE_CONFIG.explosionCount;
    for (let i = 0; i < explosionCount; i++) {
      const p = this.acquire();
      if (!p) return;

      p.type = "explosion";
      p.life = PARTICLE_CONFIG.explosionLife * (0.8 + Math.random() * 0.4);
      p.maxLife = p.life;
      p.gravity = 5; // Expand outwards and slightly upwards
      p.fadeOut = true;
      p.position.copy(origin).setY(origin.y + 0.5 + Math.random() * 2);

      // Spherical expansion
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = PARTICLE_CONFIG.explosionSpeed * (0.5 + Math.random() * 0.5);
      
      p.velocity.set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
        Math.cos(phi) * speed
      );

      const size = 0.8 + Math.random() * 1.5;
      p.mesh.geometry.dispose();
      p.mesh.geometry = new SphereGeometry(size, 8, 8);

      const mat = p.mesh.material as MeshLambertMaterial;
      const isCore = Math.random() > 0.6;
      mat.color.setHex(isCore ? 0xffffff : CITY_COLORS.explosion);
      mat.emissive.setHex(isCore ? 0xffffff : CITY_COLORS.explosion);
      mat.emissiveIntensity = 4.0;
      mat.transparent = true;
      mat.opacity = 1;
    }

    const fireCount = PARTICLE_CONFIG.fireCount;
    for (let i = 0; i < fireCount; i++) {
      const p = this.acquire();
      if (!p) return;

      p.type = "fire";
      p.life = PARTICLE_CONFIG.fireLife * (0.8 + Math.random() * 0.4);
      p.maxLife = p.life;
      p.gravity = 2.5; 
      p.fadeOut = true;
      p.position.copy(origin).setY(origin.y + Math.random() * 1.5);

      const speed = PARTICLE_CONFIG.fireSpeed;
      p.velocity.set(
        (Math.random() - 0.5) * speed,
        Math.random() * speed + 2,
        (Math.random() - 0.5) * speed
      );

      const size = 0.6 + Math.random() * 1.0;
      p.mesh.geometry.dispose();
      p.mesh.geometry = new BoxGeometry(size, size, size);

      const mat = p.mesh.material as MeshLambertMaterial;
      mat.color.setHex(CITY_COLORS.fire);
      mat.emissive.setHex(CITY_COLORS.fire);
      mat.emissiveIntensity = 2.0;
      mat.transparent = true;
      mat.opacity = 0.9;
    }

    this.spawnSmoke(origin);
    this.spawnSmoke(origin.clone().add(new Vector3(1, 0, 0)));
    this.spawnSmoke(origin.clone().add(new Vector3(-1, 0, 0)));
  }

  /** Update all active particles */
  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.release(p);
        continue;
      }

      // Apply gravity
      p.velocity.y += p.gravity * dt;

      // Move
      p.position.addScaledVector(p.velocity, dt);

      // Ground collision — stop falling
      if (p.position.y <= 0.02 && p.type !== "blood_pool") {
        p.position.y = 0.02;
        p.velocity.y = 0;
        p.velocity.x *= 0.6;
        p.velocity.z *= 0.6;

        // Blood that hits ground could stay
        if (p.type === "blood_splatter" && p.life > 1) {
          p.velocity.set(0, 0, 0);
          p.gravity = 0;
        }
      }

      // Fade out
      if (p.fadeOut) {
        const mat = p.mesh.material as MeshLambertMaterial;
        const ratio = p.life / p.maxLife;

        if (p.type === "smoke") {
          mat.opacity = ratio * 0.6;
          // Smoke grows bigger as it rises
          const scale = 1 + (1 - ratio) * 2;
          p.mesh.scale.set(scale, scale, scale);
        } else if (p.type === "blood_pool") {
          // Blood pools last longer, only fade near end
          mat.opacity = Math.min(0.85, ratio * 3);
          // Grow slightly
          const scale = 1 + (1 - ratio) * 0.5;
          p.mesh.scale.set(scale, 1, scale);
        } else if (p.type === "spark") {
          mat.emissiveIntensity = ratio * 2.0;
        } else if (p.type === "explosion") {
          mat.opacity = ratio;
          mat.emissiveIntensity = ratio * 4.0;
          const scale = 1 + (1 - ratio) * 3; // grow rapidly
          p.mesh.scale.set(scale, scale, scale);
          
          if (ratio < 0.5) {
             // turn to dark smoke as it fades
             mat.color.setHex(CITY_COLORS.smoke);
             mat.emissive.setHex(0x000000);
          }
        } else if (p.type === "fire") {
          mat.opacity = ratio * 0.9;
          mat.emissiveIntensity = ratio * 2.0;
          const scale = 1 + (1 - ratio) * 1.5;
          p.mesh.scale.set(scale, scale, scale);
        }
      }

      // Sync mesh position
      p.mesh.position.copy(p.position);

      // Rotate debris/glass for tumble effect
      if (p.type === "debris" || p.type === "glass") {
        p.mesh.rotation.x += dt * 5;
        p.mesh.rotation.z += dt * 3;
      }
    }
  }

  /** Get count of active particles */
  get activeCount(): number {
    return this.active.length;
  }
}
