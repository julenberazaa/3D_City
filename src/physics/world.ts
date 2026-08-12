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
  /** Not in the compat type defs for 0.20, but present at runtime; takes a flat xyz Float32Array. */
  convexHull(points: Float32Array): ColliderDesc | null;
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

const NON_VEHICULAR_CLASSES = new Set(["footway", "path", "steps", "pedestrian", "cycleway", "track"]);

/**
 * Choose a playable spawn: nearest DRIVABLE road feature to the target whose
 * point AND the point 12 m ahead are clear of building footprints and water
 * (margins), preferring connector-connected junctions (degree >=2) so the car
 * never spawns on a dangling footway stub. Oriented along the road direction;
 * base height from terrain. Falls back to the nearest drivable road point.
 */
export function findSpawnPoint(
  roads: ChunkRecord[],
  terrain: ChunkTerrain[],
  fixture?: WorldFixture,
  near?: { x: number; z: number },
): CarSpawnPoint {
  const aabbs = fixture ? buildingAabbs(fixture) : [];
  const margin = 3;
  const waterMargin = 2;
  const waterAabbs: Aabb[] = fixture
    ? fixture.water.flatMap((c) =>
        c.features.flatMap((f) => {
          const ring = f.ring;
          if (!ring || ring.length < 3) return [];
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
          return [{ minX, maxX, minZ, maxZ }];
        }),
      )
    : [];
  const clear = (x: number, z: number): boolean => {
    for (const b of aabbs) {
      if (x >= b.minX - margin && x <= b.maxX + margin && z >= b.minZ - margin && z <= b.maxZ + margin) {
        return false;
      }
    }
    for (const w of waterAabbs) {
      if (x >= w.minX - waterMargin && x <= w.maxX + waterMargin && z >= w.minZ - waterMargin && z <= w.maxZ + waterMargin) {
        return false;
      }
    }
    return true;
  };

  const candidates: Array<{ x: number; z: number; heading: number; dist: number; connected: boolean }> = [];
  const originX = near?.x ?? 0;
  const originZ = near?.z ?? 0;
  // Connector connectivity: how many features reference each connector id.
  const connectorDegree = new Map<string, number>();
  for (const c of roads) {
    for (const f of c.features) {
      for (const conn of f.connectors ?? []) {
        connectorDegree.set(conn.id, (connectorDegree.get(conn.id) ?? 0) + 1);
      }
    }
  }
  for (const c of roads) {
    for (const f of c.features) {
      const line = f.line;
      if (!line || line.length < 2) continue;
      if (NON_VEHICULAR_CLASSES.has(f.class ?? "")) continue;
      const [ax, az] = line[0];
      // Connected = the start endpoint is a junction shared by >=2 roads.
      let connected = false;
      for (const conn of f.connectors ?? []) {
        if (conn.at <= 0.5 && (connectorDegree.get(conn.id) ?? 0) >= 2) {
          connected = true;
          break;
        }
      }
      candidates.push({
        x: ax,
        z: az,
        heading: Math.atan2(line[1][0] - ax, line[1][1] - az),
        dist: Math.hypot(ax - originX, az - originZ),
        connected,
      });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);

  const tryCandidate = (cand: { x: number; z: number; heading: number }): CarSpawnPoint | null => {
    if (!clear(cand.x, cand.z)) return null;
    const fx = Math.sin(cand.heading);
    const fz = Math.cos(cand.heading);
    if (!clear(cand.x + fx * 12, cand.z + fz * 12)) return null;
    // Slope checks: avoid spawns on steep hills where the car rolls away or
    // stalls climbing (SF-grade streets). Point must be locally flat, and the
    // 12 m ahead must not climb more than ~6%.
    const base = sampleTerrain(terrain, cand.x, cand.z);
    const lat = Math.hypot(
      sampleTerrain(terrain, cand.x + fz * 3, cand.z - fx * 3) - base,
      sampleTerrain(terrain, cand.x - fz * 3, cand.z + fx * 3) - base,
    );
    if (lat > 1.2) return null;
    const back = sampleTerrain(terrain, cand.x - fx * 8, cand.z - fz * 8);
    if (Math.abs(back - base) > 1.2) return null;
    const ahead = sampleTerrain(terrain, cand.x + fx * 12, cand.z + fz * 12);
    if (ahead - base > 0.72) return null;
    return { x: cand.x, y: base + 0.6, z: cand.z, heading: cand.heading };
  };

  /**
   * Prefer spawns with a long clear run ahead: dead-end roads (e.g. footways
   * ending at a waterfront wall) wedge the car within seconds. Scores the
   * candidate by how many of the 12/30/60/90 m-ahead points stay clear of
   * buildings and water; ties go to the nearest road point.
   */
  const clearRunOf = (cand: { x: number; z: number; heading: number }): number => {
    const fx = Math.sin(cand.heading);
    const fz = Math.cos(cand.heading);
    let run = 0;
    for (const d of [12, 30, 60, 90]) {
      if (clear(cand.x + fx * d, cand.z + fz * d)) run++;
      else break;
    }
    return run;
  };
  const scored = candidates
    .filter((c) => tryCandidate(c) !== null)
    .map((c) => ({ ...c, run: clearRunOf(c) }));
  scored.sort((a, b) => (b.connected ? 1 : 0) - (a.connected ? 1 : 0) || b.run - a.run || a.dist - b.dist);
  if (scored.length > 0) return tryCandidate(scored[0])!;

  for (const cand of candidates.slice(0, 2000)) {
    const ok = tryCandidate(cand);
    if (ok) return ok;
  }

  for (const cand of candidates) {
    const ok = tryCandidate(cand);
    if (ok) return ok;
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
 * Convention (verified empirically with ramp sweeps against rapier/parry 0.20):
 * - raw heightfield takes CELL counts (nrows=ncols=size-1) and a heights matrix
 *   of (nrows+1)x(ncols+1) POST values, col-major: element (r,c)=data[r + c*ncols];
 * - the grid is CENTERED on the collider body: post (r,c) sits at local
 *   x = (c - ncols/2)*step, z = (r - nrows/2)*step (row r advances +z, col c +x);
 * - the render mesh places vertex (i, j) at x = originX + i*step, z = originY - j*step,
 *   i.e. mesh rows advance -z, so matrix row r must hold MESH row (n-1-r)
 *   (rows reversed), and the body must sit at the mesh grid CENTER
 *   (originX + halfSpan, 0, originY - halfSpan).
 */
export function terrainColliderFor(world: RapierWorld, c: ChunkTerrain, body?: RapierBody): Collider {
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
  const b =
    body ??
    world.createRigidBody(
      RigidBodyDesc.fixed().setTranslation(c.originX + halfSpan, 0, c.originY - halfSpan),
    );
  b.setTranslation({ x: c.originX + halfSpan, y: 0, z: c.originY - halfSpan }, true);
  return world.createCollider(desc, b);
}

function buildingBoxFor(
  world: RapierWorld,
  terrain: ChunkTerrain[],
  ring: number[][],
  height: number,
  body?: RapierBody,
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
  let baseY = -Infinity;
  for (const p of ring) {
    baseY = Math.max(baseY, sampleTerrain(terrain, p[0], p[1]));
  }
  const hy = height / 2;
  const b = body ?? world.createRigidBody(RigidBodyDesc.fixed().setTranslation(cx, baseY + hy, cz));
  b.setTranslation({ x: cx, y: baseY + hy, z: cz }, true);
  const desc = descFactory.cuboid(hx, hy, hz);
  desc.setFriction(0.35);
  desc.setRestitution(0.0);
  return world.createCollider(desc, b);
}

/** Andrew monotone chain 2D convex hull (deterministic). Returns hull in CW order. */
export function convexHull2D(points: Array<[number, number]>): Array<[number, number]> {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** 2D polygon area (shoelace, absolute). */
export function ringArea2D(pts: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a / 2);
}

/**
 * Hull points for a building collider: the footprint ring (decimated <=48 pts)
 * extruded to [baseY, baseY+height]. Concave footprints get their convex hull —
 * far closer to the visible shape than an AABB (no street-overhang corners).
 */
export function buildingHullPoints(
  ring: number[][],
  baseY: number,
  height: number,
  maxVerts = 48,
): Array<[number, number, number]> {
  const step = Math.max(1, Math.ceil(ring.length / maxVerts));
  const sampled: Array<[number, number]> = [];
  for (let i = 0; i < ring.length; i += step) {
    const p = ring[i]!;
    sampled.push([p[0], p[1]]);
  }
  const hull = convexHull2D(sampled);
  const out: Array<[number, number, number]> = [];
  for (const [x, z] of hull) {
    out.push([x, baseY, z]);
  }
  for (const [x, z] of hull) {
    out.push([x, baseY + height, z]);
  }
  return out;
}

function buildingHullFor(
  world: RapierWorld,
  terrain: ChunkTerrain[],
  ring: number[][],
  height: number,
  body?: RapierBody,
): Collider | null {
  let baseY = -Infinity;
  for (const p of ring) {
    baseY = Math.max(baseY, sampleTerrain(terrain, p[0], p[1]));
  }
  const pts = buildingHullPoints(ring, baseY, height);
  if (pts.length < 4) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]);
    maxZ = Math.max(maxZ, p[2]);
  }
  if (maxX - minX < 0.6 || maxZ - minZ < 0.6) return null;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const cy = baseY + height / 2;
  const b = body ?? world.createRigidBody(RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
  b.setTranslation({ x: cx, y: cy, z: cz }, true);
  // Translate to body-local coordinates (hull points are world-local) and
  // flatten to a Float32Array (the compat wrapper's expected layout).
  const local = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    local[i * 3] = pts[i]![0] - cx;
    local[i * 3 + 1] = pts[i]![1] - cy;
    local[i * 3 + 2] = pts[i]![2] - cz;
  }
  const desc = descFactory.convexHull(local);
  if (!desc) {
    // Hull failure (degenerate input): fall back to the AABB box.
    return buildingBoxFor(world, terrain, ring, height, b);
  }
  desc.setFriction(0.35);
  desc.setRestitution(0.0);
  return world.createCollider(desc, b);
}

export interface PhysicsChunkHandle {
  key: string;
  bodies: RapierBody[];
  buildings: number;
}

type RapierBody = ReturnType<RapierWorld["createRigidBody"]>;

/**
 * Add one chunk's physics (terrain heightfield + building boxes) to the world.
 * Returns a handle for later removal.
 */
export function createPhysicsChunk(pw: PhysicsWorld, key: string): PhysicsChunkHandle | null {
  const [tx, ty] = key.split("/").map(Number);
  const terrain = pw.fixture.terrain.find((c) => c.x === tx && c.y === ty);
  if (!terrain) return null;
  const bodies: RapierBody[] = [];
  const terrainBody = pw.world.createRigidBody(RigidBodyDesc.fixed());
  bodies.push(terrainBody);
  terrainColliderFor(pw.world, terrain, terrainBody);
  let buildings = 0;
  const chunkBuildings = pw.fixture.buildings.find((c) => c.x === tx && c.y === ty);
  if (chunkBuildings) {
    const parts = new Map<string, FixtureFeature[]>();
    const parents: FixtureFeature[] = [];
    for (const f of chunkBuildings.features) {
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
      const body = pw.world.createRigidBody(RigidBodyDesc.fixed());
      const collider = buildingHullFor(pw.world, pw.fixture.terrain, built.ring, built.height, body);
      if (collider) {
        bodies.push(body);
        buildings++;
      }
    }
  }
  return { key, bodies, buildings };
}

/** Remove one chunk's physics (each rigid body removal drops its colliders). */
export function removePhysicsChunk(pw: PhysicsWorld, handle: PhysicsChunkHandle): void {
  for (const body of handle.bodies) pw.world.removeRigidBody(body);
}

/** Empty physics world for streaming: colliders are added per chunk. */
export function createStreamingPhysicsWorld(fixture: WorldFixture): PhysicsWorld {
  return {
    world: new World({ x: 0, y: -9.81, z: 0 }),
    terrainColliders: [],
    buildingColliders: [],
    fixture,
    stats: { terrainChunks: 0, buildings: 0, skipped: 0 },
  };
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
      const collider = buildingHullFor(world, fixture.terrain, built.ring, built.height);
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
