import * as THREE from "three";

/** Stylized water level (meters, fixture-local). INFERRED constant, documented in PROVENANCE.md. */
export const WATER_LEVEL = 0.0;

export interface FixtureFeature {
  id: string;
  ring?: number[][];
  line?: number[][];
  height_m?: number;
  levels?: number;
  roof?: string;
  partOf?: string;
  class?: string;
  surface?: string;
}

export interface ChunkRecord {
  z: number;
  x: number;
  y: number;
  originX: number;
  originY: number;
  features: FixtureFeature[];
}

export interface ChunkTerrain {
  z: number;
  x: number;
  y: number;
  originX: number;
  originY: number;
  size: number;
  stepMeters: number;
  heights: number[][];
  provenance?: string;
}

export interface WorldFixture {
  manifest: {
    name: string;
    bbox: number[];
    origin: { x: number; y: number };
    chunkSize: number;
    featureCounts?: Record<string, number>;
    [key: string]: unknown;
  };
  buildings: ChunkRecord[];
  roads: ChunkRecord[];
  water: ChunkRecord[];
  landcover: ChunkRecord[];
  terrain: ChunkTerrain[];
}

export type ChunkKey = string;

export interface WorldCounts {
  buildings: number;
  roads: number;
  waterPolys: number;
  landcover: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface WorldProvenance {
  observed: number;
  derived: number;
  inferred: number;
}

export interface WorldGroups {
  terrain: Map<ChunkKey, THREE.Group>;
  roads: Map<ChunkKey, THREE.Group>;
  water: Map<ChunkKey, THREE.Group>;
  landcover: Map<ChunkKey, THREE.Group>;
  buildings: Map<ChunkKey, THREE.Group>;
}

export interface WorldModel {
  groups: WorldGroups;
  counts: WorldCounts;
  bounds: WorldBounds;
  provenance: WorldProvenance;
}

/** FNV-1a 32-bit hash — deterministic across runs; no Math.random anywhere in generation. */
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deduping vertex/color buffer builder producing one indexed BufferGeometry per chunk kind. */
class VertexBuilder {
  private positions: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];
  private map = new Map<string, number>();

  /** Reset the dedup scope (per-building dedup keeps the map tiny; shared
   *  vertices across unrelated features are vanishingly rare in real data). */
  begin(): void {
    this.map.clear();
  }

  add(x: number, y: number, z: number, r: number, g: number, b: number): number {
    const key = `${x},${y},${z},${r},${g},${b}`;
    const existing = this.map.get(key);
    if (existing !== undefined) return existing;
    const idx = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.colors.push(r, g, b);
    this.map.set(key, idx);
    return idx;
  }

  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  toMesh(material: THREE.Material): THREE.Mesh | null {
    if (this.indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(this.indices, 1));
    // All materials are flatShaded (face normals via shader derivatives), so
    // the normal attribute is never sampled for lighting: constant normals
    // are 10-50x cheaper than computeVertexNormals() over 100k+ vertices.
    const normals = new Float32Array(this.positions.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    return new THREE.Mesh(geometry, material);
  }
}

const ROAD_WIDTHS: Record<string, number> = {
  motorway: 14,
  trunk: 11,
  primary: 9,
  secondary: 7.5,
  tertiary: 6,
  residential: 5,
  service: 4,
  living_street: 4.5,
  unclassified: 4,
  pedestrian: 4,
  footway: 2.5,
  path: 2,
  steps: 2.5,
  cycleway: 2.5,
};

const FACADE_PALETTE: number[][] = [
  [0.78, 0.63, 0.48],
  [0.83, 0.66, 0.51],
  [0.71, 0.55, 0.42],
  [0.85, 0.73, 0.6],
  [0.76, 0.58, 0.46],
  [0.8, 0.68, 0.52],
];

const chunkKey = (z: number, x: number, y: number): ChunkKey => `${z}-${x}-${y}`;

/** Bilinear terrain height at fixture-local (x, y); grid rows run north (originY) to south. */
export function sampleTerrain(terrain: ChunkTerrain[], x: number, y: number): number {
  const cell = (c: ChunkTerrain): number => {
    const u = (x - c.originX) / c.stepMeters;
    const v = (c.originY - y) / c.stepMeters;
    const cu = Math.max(0, Math.min(c.size - 1, u));
    const cv = Math.max(0, Math.min(c.size - 1, v));
    const i0 = Math.floor(cu);
    const j0 = Math.floor(cv);
    const i1 = Math.min(c.size - 1, i0 + 1);
    const j1 = Math.min(c.size - 1, j0 + 1);
    const fx = cu - i0;
    const fy = cv - j0;
    const a = c.heights[j0][i0];
    const b = c.heights[j0][i1];
    const cc = c.heights[j1][i0];
    const d = c.heights[j1][i1];
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + cc * (1 - fx) * fy + d * fx * fy;
  };
  for (const c of terrain) {
    const span = (c.size - 1) * c.stepMeters;
    if (
      x >= c.originX - 1e-6 &&
      x <= c.originX + span + 1e-6 &&
      y <= c.originY + 1e-6 &&
      y >= c.originY - span - 1e-6
    ) {
      return cell(c);
    }
  }
  return cell(terrain[0]);
}

function distinctPoints(ring: number[][]): number[][] {
  const last = ring[ring.length - 1];
  const first = ring[0];
  if (last && first && last[0] === first[0] && last[1] === first[1]) return ring.slice(0, -1);
  return ring;
}

/**
 * Deterministic ring decimation for RENDER paths only: ear-clipping is O(n^2)
 * and real footprints/rivers can carry thousands of vertices (single-polygon
 * triangulation then blocks the main thread for ~hundreds of ms). Sampling to
 * <= maxVerts keeps the silhouette at miniature scale while bounding build
 * cost. Physics colliders keep the FULL ring (box from bbox, unaffected).
 */
function decimateRing(pts: number[][], maxVerts = 64): number[][] {
  if (pts.length <= maxVerts) return pts;
  const out: number[][] = [];
  const span = pts.length - 1;
  for (let i = 0; i < maxVerts; i++) {
    const idx = Math.round((i * span) / (maxVerts - 1));
    out.push(pts[idx]);
  }
  return out;
}

function ringArea(pts: number[][]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a / 2);
}

function centroid(pts: number[][]): [number, number] {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  return [sx / pts.length, sy / pts.length];
}

function triangulate(pts: number[][]): number[][] {
  const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
  return THREE.ShapeUtils.triangulateShape(contour, []);
}

function buildTerrainChunkMesh(c: ChunkTerrain): THREE.Mesh | null {
  const vb = new VertexBuilder();
  const n = c.size;
  const h = c.heights;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = c.originX + i * c.stepMeters;
      const z = c.originY - j * c.stepMeters;
      const y = h[j][i];
      const dhdx = (h[j][Math.min(n - 1, i + 1)] - h[j][Math.max(0, i - 1)]) / (2 * c.stepMeters);
      const dhdz = (h[Math.min(n - 1, j + 1)][i] - h[Math.max(0, j - 1)][i]) / (2 * c.stepMeters);
      const slopeDeg = (Math.atan(Math.hypot(dhdx, dhdz)) * 180) / Math.PI;
      let r: number;
      let g: number;
      let b: number;
      if (slopeDeg < 12) {
        r = 0.42; g = 0.65; b = 0.3;
      } else if (slopeDeg <= 30) {
        r = 0.44; g = 0.54; b = 0.27;
      } else {
        r = 0.62; g = 0.62; b = 0.63;
      }
      const darken = 1 - Math.min(0.25, Math.max(0, y * 0.0012));
      vb.add(x, y, z, r * darken, g * darken, b * darken);
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b2 = j * n + i + 1;
      const c2 = (j + 1) * n + i;
      const d = (j + 1) * n + i + 1;
      vb.tri(a, b2, c2);
      vb.tri(b2, d, c2);
    }
  }
  return vb.toMesh(TERRAIN_MATERIAL);
}

function buildWaterChunkMesh(c: ChunkRecord): { mesh: THREE.Mesh | null; count: number } {
  const vb = new VertexBuilder();
  let count = 0;
  for (const f of c.features) {
    if (!f.ring) continue;
    const pts = decimateRing(distinctPoints(f.ring));
    if (pts.length < 3 || ringArea(pts) < 0.5) continue;
    const faces = triangulate(pts);
    const base = fnv1a(f.id) % 5;
    count++;
    for (const face of faces) {
      const [a, b, cc] = face;
      const ny =
        (pts[b][1] - pts[a][1]) * (pts[cc][0] - pts[a][0]) -
        (pts[b][0] - pts[a][0]) * (pts[cc][1] - pts[a][1]);
      const order = ny < 0 ? [a, cc, b] : [a, b, cc];
      const idx = order.map((p) => {
        const [x, z] = pts[p];
        const v = (base + p) % 5;
        const lightness = 0.02 * (v - 2);
        return vb.add(x, WATER_LEVEL - 0.05, z, 0.18 + lightness, 0.42 + lightness, 0.62 + lightness);
      });
      vb.tri(idx[0], idx[1], idx[2]);
    }
  }
  return { mesh: vb.toMesh(WATER_MATERIAL), count };
}

function buildLandcoverChunkMesh(c: ChunkRecord, terrain: ChunkTerrain[]): { mesh: THREE.Mesh | null; count: number } {
  const vb = new VertexBuilder();
  let count = 0;
  for (const f of c.features) {
    if (!f.ring) continue;
    const pts = decimateRing(distinctPoints(f.ring));
    if (pts.length < 3 || ringArea(pts) < 0.5) continue;
    const [cx, cy] = centroid(pts);
    const y = sampleTerrain(terrain, cx, cy) + 0.05;
    let color: number[];
    if (f.class === "grass") color = [0.36, 0.58, 0.26];
    else if (f.class === "forest") color = [0.22, 0.4, 0.19];
    else color = [0.34, 0.54, 0.24];
    const faces = triangulate(pts);
    count++;
    for (const face of faces) {
      const [a, b, cc] = face;
      const ny =
        (pts[b][1] - pts[a][1]) * (pts[cc][0] - pts[a][0]) -
        (pts[b][0] - pts[a][0]) * (pts[cc][1] - pts[a][1]);
      const order = ny < 0 ? [a, cc, b] : [a, b, cc];
      const idx = order.map((p) => {
        const [x, z] = pts[p];
        return vb.add(x, y, z, color[0], color[1], color[2]);
      });
      vb.tri(idx[0], idx[1], idx[2]);
    }
  }
  return { mesh: vb.toMesh(LANDCOVER_MATERIAL), count };
}

function pointInRing(px: number, pz: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0];
    const zi = ring[i]![1];
    const xj = ring[j]![0];
    const zj = ring[j]![1];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function waterRingsOf(fixture: WorldFixture): number[][][] {
  const out: number[][][] = [];
  for (const c of fixture.water) {
    for (const f of c.features) {
      if (!f.ring || f.ring.length < 3) continue;
      out.push(decimateRing(distinctPoints(f.ring)));
    }
  }
  return out;
}

function buildRoadChunkMesh(
  c: ChunkRecord,
  terrain: ChunkTerrain[],
  waterRings: number[][][],
): { mesh: THREE.Mesh | null; count: number } {
  const vb = new VertexBuilder();
  let count = 0;
  for (const f of c.features) {
    if (!f.line || f.line.length < 2) continue;
    const pts: number[][] = [];
    for (const p of f.line) {
      const last = pts[pts.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
    }
    if (pts.length < 2) continue;
    const width = ROAD_WIDTHS[f.class ?? ""] ?? 4;
    const classVar = (fnv1a(f.class ?? "") % 3 - 1) * 0.03;
    const r = 0.32 + classVar;
    const g = 0.32 + classVar;
    const b = 0.34 + classVar;
    const left: number[][] = [];
    const right: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next[0] - prev[0];
      let dz = next[1] - prev[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-9) {
        dx = 1;
        dz = 0;
      } else {
        dx /= len;
        dz /= len;
      }
      const h = sampleTerrain(terrain, pts[i][0], pts[i][1]) + 0.06;
      const overWater = waterRings.some((ring) => pointInRing(pts[i][0], pts[i][1], ring));
      left.push([pts[i][0] + (-dz) * (width / 2), pts[i][1] + dx * (width / 2)]);
      right.push([pts[i][0] - (-dz) * (width / 2), pts[i][1] - dx * (width / 2)]);
      // Bridge rule: roads crossing water are decks at the water surface so
      // they never dive into the bay/river bed (WP-09/R-019 minimal set).
      y.push(overWater ? WATER_LEVEL + 0.3 : h);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = left[i][0];
      const az = left[i][1];
      const bx = right[i][0];
      const bz = right[i][1];
      const cx = left[i + 1][0];
      const cz = left[i + 1][1];
      const dx = right[i + 1][0];
      const dz = right[i + 1][1];
      const ny1 = (cz - az) * (bx - ax) - (cx - ax) * (bz - az);
      const ny2 = (cz - bz) * (dx - bx) - (cx - bx) * (dz - bz);
      const a = vb.add(ax, y[i], az, r, g, b);
      const b2 = vb.add(bx, y[i], bz, r, g, b);
      const c2 = vb.add(cx, y[i + 1], cz, r, g, b);
      const d = vb.add(dx, y[i + 1], dz, r, g, b);
      if (ny1 < 0) vb.tri(a, b2, c2);
      else vb.tri(a, c2, b2);
      if (ny2 < 0) vb.tri(b2, d, c2);
      else vb.tri(b2, c2, d);
    }
    count++;
  }
  return { mesh: vb.toMesh(ROAD_MATERIAL), count };
}

interface BuildingParts {
  ring: number[][];
  height: number;
  roof?: string;
  provenance: "observed" | "derived" | "inferred";
}

export interface ResolvedBuilding extends BuildingParts {
  id: string;
}

/** Effective footprint+height for a building parent (parts override parents). Shared with physics. */
export function resolveBuilding(f: FixtureFeature, parts: Map<string, FixtureFeature[]>): ResolvedBuilding | null {
  const pts = distinctPoints(f.ring ?? []);
  if (pts.length < 3 || ringArea(pts) < 4) return null;
  const parentParts = parts.get(f.id);
  let ring = pts;
  let heightAttr: number | undefined = f.height_m;
  let levels: number | undefined = f.levels;
  let roof = f.roof;
  if (parentParts && parentParts.length > 0) {
    const part = parentParts[0];
    const partPts = distinctPoints(part.ring ?? []);
    if (partPts.length >= 3 && ringArea(partPts) >= 4) ring = partPts;
    heightAttr = part.height_m ?? heightAttr;
    levels = part.levels ?? levels;
    roof = part.roof ?? roof;
  }
  let height: number;
  let provenance: BuildingParts["provenance"];
  if (heightAttr !== undefined && Number.isFinite(heightAttr)) {
    height = heightAttr;
    provenance = "observed";
  } else if (levels !== undefined && Number.isFinite(levels)) {
    height = levels * 3;
    provenance = "derived";
  } else {
    height = 8 + (fnv1a(f.id) % 7);
    provenance = "inferred";
  }
  return { id: f.id, ring, height: Math.max(3, height), roof, provenance };
}

function* buildBuildingChunkPieces(c: ChunkRecord, terrain: ChunkTerrain[]): Generator<void, { mesh: THREE.Mesh | null; count: number; provenance: WorldProvenance }, void> {
  const vb = new VertexBuilder();
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
  let count = 0;
  let processed = 0;
  const provenance: WorldProvenance = { observed: 0, derived: 0, inferred: 0 };
  for (const f of parents) {
    const built = resolveBuilding(f, parts);
    if (!built) continue;
    const ring = decimateRing(built.ring);
    const { height, roof } = built;
    vb.begin();
    const [cx, cy] = centroid(ring);
    const baseY = sampleTerrain(terrain, cx, cy) - 0.15;
    const wallTop = baseY + height;
    const paletteIdx = fnv1a(f.id) % FACADE_PALETTE.length;
    const facade = FACADE_PALETTE[paletteIdx];
    const roofCol = [facade[0] * 0.8, facade[1] * 0.8, facade[2] * 0.8];
    const groundCol = [facade[0] * 0.7, facade[1] * 0.7, facade[2] * 0.7];
    const faces = triangulate(ring);
    const gabled = roof === "gabled" || roof === "hipped";
    const minX = Math.min(...ring.map((p) => p[0]));
    const maxX = Math.max(...ring.map((p) => p[0]));
    const minZ = Math.min(...ring.map((p) => p[1]));
    const maxZ = Math.max(...ring.map((p) => p[1]));
    const extentX = maxX - minX;
    const extentZ = maxZ - minZ;
    const ridgeX = extentX >= extentZ;
    const apex = Math.min(4, height * 0.25);
    const roofYAt = (p: number[]): number => {
      if (!gabled) return wallTop;
      const t = ridgeX ? (p[0] - minX) / Math.max(1e-9, extentX) : (p[1] - minZ) / Math.max(1e-9, extentZ);
      return wallTop + 2 * apex * Math.min(t, 1 - t);
    };
    const capVerts: number[] = ring.map((p) =>
      vb.add(p[0], roofYAt(p), p[1], roofCol[0], roofCol[1], roofCol[2]),
    );
    const groundVerts: number[] = ring.map((p) => vb.add(p[0], baseY, p[1], groundCol[0], groundCol[1], groundCol[2]));
    const wallTopVerts: number[] = ring.map((p) =>
      vb.add(p[0], wallTop, p[1], facade[0], facade[1], facade[2]),
    );
    for (const [a, b2, c2] of faces) {
      vb.tri(capVerts[a], capVerts[b2], capVerts[c2]);
      vb.tri(groundVerts[a], groundVerts[c2], groundVerts[b2]);
    }
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      const a = groundVerts[i];
      const b2 = groundVerts[j];
      const c2 = wallTopVerts[j];
      const d = wallTopVerts[i];
      vb.tri(a, c2, b2);
      vb.tri(a, d, c2);
    }
    count++;
    provenance[built.provenance]++;
    if (++processed % 120 === 0) yield;
  }
  return { mesh: vb.toMesh(BUILDING_MATERIAL), count, provenance };
}

const TERRAIN_MATERIAL = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true });
const ROAD_MATERIAL = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true });
const WATER_MATERIAL = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
const LANDCOVER_MATERIAL = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true });
const BUILDING_MATERIAL = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true });

export interface ChunkBuildResult {
  group: THREE.Group;
  counts: { buildings: number; roads: number; waterPolys: number; landcover: number };
  provenance: WorldProvenance;
}

/** Build the render group for ONE z15 chunk (terrain+roads+water+landcover+buildings). */
export function buildChunkGroup(fixture: WorldFixture, z: number, x: number, y: number): ChunkBuildResult {
  const it = buildChunkPieces(fixture, z, x, y);
  let step = it.next();
  while (!step.done) step = it.next();
  return step.value;
}

/**
 * Same as buildChunkGroup but as a generator: yields control points between
 * work batches so an async host can interleave chunk generation with rendering
 * (no >1-frame main-thread stalls) while keeping byte-deterministic output.
 */
export function* buildChunkPieces(fixture: WorldFixture, z: number, x: number, y: number): Generator<void, ChunkBuildResult, void> {
  void z;
  const group = new THREE.Group();
  const counts = { buildings: 0, roads: 0, waterPolys: 0, landcover: 0 };
  const provenance: WorldProvenance = { observed: 0, derived: 0, inferred: 0 };

  const terrain = fixture.terrain.find((c) => c.x === x && c.y === y);
  if (terrain) {
    const mesh = buildTerrainChunkMesh(terrain);
    if (mesh) group.add(mesh);
    yield;
  }
  const addChunk = <T extends { z: number; x: number; y: number }>(
    records: T[],
    build: (c: T) => { mesh: THREE.Mesh | null; count: number },
    countKey: keyof typeof counts,
  ): void => {
    const rec = records.find((c) => c.x === x && c.y === y);
    if (!rec) return;
    const { mesh, count } = build(rec);
    counts[countKey] += count;
    if (mesh) group.add(mesh);
  };
  addChunk(fixture.roads, (c) => buildRoadChunkMesh(c, fixture.terrain, waterRingsOf(fixture)), "roads");
  yield;
  addChunk(fixture.water, (c) => buildWaterChunkMesh(c), "waterPolys");
  yield;
  addChunk(fixture.landcover, (c) => buildLandcoverChunkMesh(c, fixture.terrain), "landcover");
  yield;

  const bRec = fixture.buildings.find((c) => c.x === x && c.y === y);
  if (bRec) {
    const pieces = buildBuildingChunkPieces(bRec, fixture.terrain);
    let step = pieces.next();
    while (!step.done) {
      yield;
      step = pieces.next();
    }
    const { mesh, count, provenance: p } = step.value;
    counts.buildings += count;
    provenance.observed += p.observed;
    provenance.derived += p.derived;
    provenance.inferred += p.inferred;
    if (mesh) group.add(mesh);
  }
  yield;
  return { group, counts, provenance };
}

/**
 * Build the full stylized low-poly world from a pinned fixture.
 * Deterministic: same fixture JSON always produces identical geometry.
 */
export function buildWorld(fixture: WorldFixture): WorldModel {
  const terrainGroups = new Map<ChunkKey, THREE.Group>();
  for (const c of fixture.terrain) {
    const mesh = buildTerrainChunkMesh(c);
    const group = new THREE.Group();
    if (mesh) group.add(mesh);
    terrainGroups.set(chunkKey(c.z, c.x, c.y), group);
  }

  const roadGroups = new Map<ChunkKey, THREE.Group>();
  const waterGroups = new Map<ChunkKey, THREE.Group>();
  const landcoverGroups = new Map<ChunkKey, THREE.Group>();
  const buildingGroups = new Map<ChunkKey, THREE.Group>();
  const counts: WorldCounts = { buildings: 0, roads: 0, waterPolys: 0, landcover: 0 };
  const provenance: WorldProvenance = { observed: 0, derived: 0, inferred: 0 };

  for (const c of fixture.roads) {
    const { mesh, count } = buildRoadChunkMesh(c, fixture.terrain, waterRingsOf(fixture));
    counts.roads += count;
    if (mesh) {
      const group = new THREE.Group();
      group.add(mesh);
      roadGroups.set(chunkKey(c.z, c.x, c.y), group);
    }
  }
  for (const c of fixture.water) {
    const { mesh, count } = buildWaterChunkMesh(c);
    counts.waterPolys += count;
    if (mesh) {
      const group = new THREE.Group();
      group.add(mesh);
      waterGroups.set(chunkKey(c.z, c.x, c.y), group);
    }
  }
  for (const c of fixture.landcover) {
    const { mesh, count } = buildLandcoverChunkMesh(c, fixture.terrain);
    counts.landcover += count;
    if (mesh) {
      const group = new THREE.Group();
      group.add(mesh);
      landcoverGroups.set(chunkKey(c.z, c.x, c.y), group);
    }
  }
  for (const c of fixture.buildings) {
    const pieces = buildBuildingChunkPieces(c, fixture.terrain);
    let step = pieces.next();
    while (!step.done) step = pieces.next();
    const { mesh, count, provenance: p } = step.value;
    counts.buildings += count;
    provenance.observed += p.observed;
    provenance.derived += p.derived;
    provenance.inferred += p.inferred;
    if (mesh) {
      const group = new THREE.Group();
      group.add(mesh);
      buildingGroups.set(chunkKey(c.z, c.x, c.y), group);
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of fixture.terrain) {
    const span = (c.size - 1) * c.stepMeters;
    minX = Math.min(minX, c.originX);
    minY = Math.min(minY, c.originY - span);
    maxX = Math.max(maxX, c.originX + span);
    maxY = Math.max(maxY, c.originY);
  }
  const expand = (pts: number[][] | undefined) => {
    if (!pts) return;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  };
  for (const c of fixture.buildings) for (const f of c.features) expand(f.ring);
  for (const c of fixture.roads) for (const f of c.features) expand(f.line);

  return {
    groups: {
      terrain: terrainGroups,
      roads: roadGroups,
      water: waterGroups,
      landcover: landcoverGroups,
      buildings: buildingGroups,
    },
    counts,
    bounds: { minX, minY, maxX, maxY },
    provenance,
  };
}
