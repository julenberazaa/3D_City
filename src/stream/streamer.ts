import * as THREE from "three";
import { ChunkManager, chunkCenter, DEFAULT_STREAM_CONFIG, type ChunkState, type PlayerState } from "./chunkManager";
import type { WorldFixture } from "../world/generator";
import { buildChunkGroup, type WorldProvenance } from "../world/generator";
import { createPhysicsChunk, removePhysicsChunk, type PhysicsChunkHandle, type PhysicsWorld } from "../physics/world";

export interface StreamerHandle {
  update(player: PlayerState): void;
  state(key: string): ChunkState;
  counters(): ReturnType<ChunkManager["countersSnapshot"]>;
  activeChunks(): string[];
  sceneCounts(): { meshes: number };
  activeCounts(): { buildings: number; roads: number; waterPolys: number; landcover: number };
  activeProvenance(): WorldProvenance;
  physicsStats(): { chunks: number; buildings: number };
  dispose(): void;
  onChunkActivated?: (key: string) => void;
}

/**
 * Binds the pure ChunkManager to the live scene + physics world: activates
 * chunks (render group + colliders) around the player, evicts distant ones.
 */
export function createStreamer(scene: THREE.Scene, physics: PhysicsWorld, fixture: WorldFixture): StreamerHandle {
  const manager = new ChunkManager({ ...DEFAULT_STREAM_CONFIG, origin: fixture.manifest.origin });
  const groups = new Map<string, THREE.Group>();
  const physicsHandles = new Map<string, PhysicsChunkHandle>();
  const physicsBuildings = new Map<string, number>();
  const counts = new Map<string, { buildings: number; roads: number; waterPolys: number; landcover: number }>();
  const provenance = new Map<string, WorldProvenance>();
  const activeCounts = { buildings: 0, roads: 0, waterPolys: 0, landcover: 0 };
  const activeProvenance: WorldProvenance = { observed: 0, derived: 0, inferred: 0 };

  const activate = (key: string): void => {
    if (groups.has(key)) {
      manager.setState(key, "generating", "active");
      return;
    }
    const [x, y] = key.split("/").map(Number);
    const built = buildChunkGroup(fixture, 15, x, y);
    groups.set(key, built.group);
    counts.set(key, built.counts);
    provenance.set(key, built.provenance);
    scene.add(built.group);
    activeCounts.buildings += built.counts.buildings;
    activeCounts.roads += built.counts.roads;
    activeCounts.waterPolys += built.counts.waterPolys;
    activeCounts.landcover += built.counts.landcover;
    activeProvenance.observed += built.provenance.observed;
    activeProvenance.derived += built.provenance.derived;
    activeProvenance.inferred += built.provenance.inferred;
    manager.setState(key, "generating", "active");
    handle.onChunkActivated?.(key);
  };

  const deactivate = (key: string): void => {
    const g = groups.get(key);
    if (g) {
      scene.remove(g);
      groups.delete(key);
    }
    const ph = physicsHandles.get(key);
    if (ph) {
      removePhysicsChunk(physics, ph);
      physicsHandles.delete(key);
      physicsBuildings.delete(key);
    }
    const c = counts.get(key);
    if (c) {
      activeCounts.buildings -= c.buildings;
      activeCounts.roads -= c.roads;
      activeCounts.waterPolys -= c.waterPolys;
      activeCounts.landcover -= c.landcover;
      counts.delete(key);
    }
    const p = provenance.get(key);
    if (p) {
      activeProvenance.observed -= p.observed;
      activeProvenance.derived -= p.derived;
      activeProvenance.inferred -= p.inferred;
      provenance.delete(key);
    }
  };

  const handle: StreamerHandle = {
    update(player: PlayerState): void {
      const actions = manager.update(player);
      for (const a of actions) {
        if (a.action === "load") {
          // Fixture-backed provider: generation is synchronous here.
          if (manager.state(a.key) === "queued") manager.setState(a.key, "queued", "fetching");
          if (manager.state(a.key) === "fetching") manager.setState(a.key, "fetching", "generating");
          activate(a.key);
        } else {
          deactivate(a.key);
        }
      }
      // Physics only near the player (§30): colliders follow the physics radius.
      // Distance is measured to the chunk BOUNDS (not its center) so the chunk
      // containing the player always qualifies.
      const physicsR = manager.config.physicsRadius;
      const half = 1222.99 / 2;
      for (const key of manager.activeKeys()) {
        const c = chunkCenter(manager.config.origin, key);
        const dx = Math.max(0, Math.abs(c.x - player.x) - half);
        const dz = Math.max(0, Math.abs(c.z - player.z) - half);
        const dist = Math.hypot(dx, dz);
        const has = physicsHandles.has(key);
        if (dist <= physicsR && !has) {
          const ph = createPhysicsChunk(physics, key);
          if (ph) {
            physicsHandles.set(key, ph);
            physicsBuildings.set(key, ph.buildings);
          }
        } else if (dist > physicsR && has) {
          removePhysicsChunk(physics, physicsHandles.get(key)!);
          physicsHandles.delete(key);
          physicsBuildings.delete(key);
        }
      }
    },
    physicsStats: () => {
      let buildings = 0;
      for (const b of physicsBuildings.values()) buildings += b;
      return { chunks: physicsHandles.size, buildings };
    },
    state: (key: string) => manager.state(key),
    counters: () => manager.countersSnapshot(),
    activeChunks: () => manager.activeKeys(),
    sceneCounts: () => ({ meshes: groups.size }),
    activeCounts: () => ({ ...activeCounts }),
    activeProvenance: () => ({ ...activeProvenance }),
    dispose(): void {
      for (const key of [...groups.keys()]) deactivate(key);
    },
  };
  return handle;
}

export type { PlayerState };
