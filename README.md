# Golden Coast Syndicate

Lightweight open-world prototype built with Next.js, plain React, Node route handlers, and Three.js.

## What This Includes

- A modular client-side game engine instead of one monolithic HTML script
- Lightweight low-poly city rendering
- Third-person player movement and drivable civilian vehicles
- Wanted escalation, police spawning, civilian flee behavior, and pooled bullets
- Mission start markers with short objective chains
- Floating-origin style world shifting
- Node-backed persistence for collected pickups and completed missions

## Structure

- `app/page.tsx`
  Renders the React shell and the game overlay.
- `src/components/GameShell.tsx`
  Owns startup flow and binds the engine to the canvas.
- `src/game/GameEngine.ts`
  Main simulation loop, input, camera, combat, missions, HUD state.
- `src/game/core/*`
  Event bus, spatial hash, and object pool helpers.
- `src/game/world/worldGen.ts`
  Procedural low-poly city generation and spawn layout.
- `app/api/world/route.ts`
  Local Node persistence endpoint writing to `data/world-state.json`.

## How It Maps To Your System Design

- Data-oriented updates:
  Dynamic entities are stored in arrays and updated in batches.
- Spatial partitioning:
  Nearby lookups for NPCs and vehicles go through a spatial hash.
- Pooling:
  Projectiles reuse meshes and state objects to reduce churn.
- Fixed-step simulation:
  Physics-sensitive updates run on a stable timestep, separate from render.
- Floating origin:
  When the player drifts too far, the loaded world shifts back toward the origin.
- Event-driven UI feedback:
  Notifications and HUD updates are emitted from the engine instead of directly manipulating the DOM.

## Running

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.
