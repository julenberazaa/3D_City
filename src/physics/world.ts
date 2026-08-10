import {
  ColliderDesc,
  RigidBodyDesc,
  World,
  type Collider,
  type World as RapierWorld,
} from "@dimforge/rapier3d-compat";
import type { ChunkRecord, ChunkTerrain, FixtureFeature, WorldFixture } from "../world/generator";
import { resolveBuilding, sampleTerrain } from "../world/generator";

interface ColliderDescFactory {
  cuboid(hx: number, hy: number, hz: number): ColliderDesc;
  heightfield(nrows: number, ncols: number, heights: ArrayLike<number>, scale: { x: number; y: number; z: number }, flags?: number): ColliderDesc;
}

const descFactory = ColliderDesc as unknown as ColliderDescFactory;

export interface CarSpawnPoint {
  x: number;
  y: number;
  z: number;
  heading: number;
}

interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function buildingAabbs(fixture: WorldFixture): Aabb[] {
  const out: Aabb[] = [];
  for (const c of fixture.buildings) {
    const parts = new Map<string, FixtureFeature[]>();
    const parents: FixtureFeature[] = [];
    for (const f of c.features) {
      if (f.partOf) {
        const list = parts.get(f.partOf) ?? [];
        list.push(f);
        parts.set(f.partOf, list);
      } else {
        parents.push(f);
      }
    }
    for (const f of parents) {
      const built = resolveBuilding(f, parts);
      if (!built) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of built.ring) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
        minZ = Math.min(minZ, p[1]);
        maxZ = Math.max(maxZ, p[1]);
      }
      out.push({ minX, maxX, minZ, maxZ });
    }
  }
  return out;
}

/**
 * Choose a playable spawn: nearest road feature to (0,0) whose point AND the
 * point 12 m ahead along the road are clear of building footprints (3 m
 * margin). Oriented along the road direction; base height from terrain.
 * Falls back to the nearest road point.
 */
export function findSpawnPoint(
  roads: ChunkRecord[],
  terrain: ChunkTerrain[],
  fixture?: WorldFixture,
): CarSpawnPoint {
  const aabbs = fixture ? buildingAabbs(fixture) : [];
  const margin = 3;
  const clear = (x: number, z: number): boolean => {
    for (const b of aabbs) {
      if (x >= b.minX - margin && x <= b.maxX + margin && z >= b.minZ - margin && z <= b.maxZ + margin) {
        return false;
      }
    }
    return true;
  };

  const candidates: Array<{ x: number; z: number; heading: number; dist: number }> = [];
  for (const c of roads) {
    for (const f of c.features) {
      const line = f.line;
      if (!line || line.length < 2) continue;
      const [ax, az] = line[0];
      candidates.push({
        x: ax,
        z: az,
        heading: Math.atan2(line[1][0] - ax, line[1][1] - az),
        dist: Math.hypot(ax, az),
      });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);

  for (const cand of candidates.slice(0, 2000)) {
    if (!clear(cand.x, cand.z)) continue;
    const fx = Math.sin(cand.heading);
    const fz = Math.cos(cand.heading);
    if (!clear(cand.x + fx * 12, cand.z + fz * 12)) continue;
    return { x: cand.x, y: sampleTerrain(terrain, cand.x, cand.z) + 0.6, z: cand.z, heading: cand.heading };
  }

  const best = candidates[0];
  if (!best) {
    const y = sampleTerrain(terrain, 0, 50) + 0.6;
    return { x: 0, y, z: 50, heading: 0 };
  }
  return { x: best.x, y: sampleTerrain(terrain, best.x, best.z) + 0.6, z: best.z, heading: best.heading };
}


export interface PhysicsWorld {
  world: RapierWorld;
  terrainColliders: Collider[];
  buildingColliders: Collider[];
  fixture: WorldFixture;
  stats: { terrainChunks: number; buildings: number; skipped: number };
}

/**
 * Build a Rapier heightfield collider for one terrain chunk.
 *
 * Convention (verified empirically against rapier/parry 0.20 + parry source):
 * - the raw heightfield takes CELL counts (nrows=ncols=size-1) and a heights
 *   matrix of (nrows+1)x(ncols+1) POST values;
 * Convention (verified empirically with ramp sweeps against rapier/parry 0.20):
 * - raw heightfield takes CELL counts (nrows=ncols=size-1) and a heights matrix
 *   of (nrows+1)x(ncols+1) POST values, col-major: element (r,c)=data[r + c*nrows];
 * - the grid is CENTERED on the collider body: post (r,c) sits at local
 *   x = (c - ncols/2)*step, z = (r - nrows/2)*step (row r advances +z, col c +x);
 * - the render mesh places vertex (i, j) at x = originX + i*step, z = originY - j*step,
 *   i.e. mesh rows advance -z, so matrix row r must hold MESH row (n-1-r)
 *   (rows reversed), and the body must sit at the mesh grid CENTER
 *   (originX + halfSpan, 0, originY - halfSpan).
 */
export function terrainColliderFor(world: RapierWorld, c: ChunkTerrain): Collider {
  const n = c.size;
  const cells = n - 1;
  const step = c.stepMeters;
  const data = new Float32Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      data[r + col * n] = c.heights[n - 1 - r]![col]!;
    }
  }
  const desc = descFactory.heightfield(cells, cells, data, { x: cells * step, y: 1, z: cells * step }, 0);
  desc.setFriction(1.0);
  const halfSpan = (cells * step) / 2;
  const body = world.createRigidBody(
    RigidBodyDesc.fixed().setTranslation(c.originX + halfSpan, 0, c.originY - halfSpan),
  );
  return world.createCollider(desc, body);
}

function buildingBoxFor(
  world: RapierWorld,
  terrain: ChunkTerrain[],
  ring: number[][],
  height: number,
): Collider | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[1]);
    maxZ = Math.max(maxZ, p[1]);
  }
  const hx = (maxX - minX) / 2;
  const hz = (maxZ - minZ) / 2;
  if (hx < 0.3 || hz < 0.3) return null;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const baseY = sampleTerrain(terrain, cx, cz);
  const hy = height / 2;
  const body = world.createRigidBody(RigidBodyDesc.fixed().setTranslation(cx, baseY + hy, cz));
  const desc = descFactory.cuboid(hx, hy, hz);
  desc.setFriction(1.0);
  desc.setRestitution(0.0);
  return world.createCollider(desc, body);
}

/**
 * Create the physics world mirroring the render world (same fixture).
 * Visual geometry != physics geometry: buildings are simplified boxes,
 * terrain is a heightfield. All colliders are fixed.
 */
export function createPhysicsWorld(fixture: WorldFixture): PhysicsWorld {
  const world = new World({ x: 0, y: -9.81, z: 0 });
  const terrainColliders: Collider[] = [];
  const buildingColliders: Collider[] = [];
  const stats = { terrainChunks: 0, buildings: 0, skipped: 0 };

  for (const c of fixture.terrain) {
    terrainColliders.push(terrainColliderFor(world, c));
    stats.terrainChunks++;
  }

  for (const c of fixture.buildings) {
    const parts = new Map<string, FixtureFeature[]>();
    const parents: FixtureFeature[] = [];
    for (const f of c.features) {
      if (f.partOf) {
        const list = parts.get(f.partOf) ?? [];
        list.push(f);
        parts.set(f.partOf, list);
      } else {
        parents.push(f);
      }
    }
    for (const f of parents) {
      const built = resolveBuilding(f, parts);
      if (!built) {
        stats.skipped++;
        continue;
      }
      const collider = buildingBoxFor(world, fixture.terrain, built.ring, built.height);
      if (!collider) {
        stats.skipped++;
        continue;
      }
      buildingColliders.push(collider);
      stats.buildings++;
    }
  }

  return { world, terrainColliders, buildingColliders, fixture, stats };
}
