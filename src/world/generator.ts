import * as THREE from "three";
import { createLabelSprite, labelPriorityOf, MAX_LABELS_PER_CHUNK } from "../render/labels";

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
  /** Overture building subtype (residential, commercial, civic, …). */
  subtype?: string;
  /** OBSERVED facade/roof style from Overture (hex or material name). */
  facadeColor?: string;
  facadeMaterial?: string;
  roofColor?: string;
  roofMaterial?: string;
  roofHeight?: number;
  roofOrientation?: string;
  name?: string;
  minHeight?: number;
  level?: number;
  /** Junction topology: connector refs with fractional position along the line. */
  connectors?: Array<{ id: string; at: number }>;
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
  motorway: 7.5,
  trunk: 6.5,
  primary: 9,
  secondary: 7.5,
  tertiary: 6,
  residential: 5,
  service: 4,
  living_street: 4.5,
  unclassified: 4,
  pedestrian: 3,
  footway: 1.8,
  path: 1.4,
  steps: 1.8,
  cycleway: 1.8,
};

const NON_VEHICULAR_CLASSES = new Set(["footway", "path", "steps", "pedestrian", "cycleway", "track"]);

const CURB_COLOR: number[] = [0.23, 0.23, 0.25];
const ROAD_SURFACE: number[] = [0.44, 0.44, 0.46];
const PATH_COLOR: number[] = [0.3, 0.29, 0.28];
const CURB_INSET = 1.0;

interface RoadJunction {
  x: number;
  z: number;
  radius: number;
  features: Array<{ f: FixtureFeature; width: number }>;
  /** 2-way split of the same collinear road: pass-through, no cap/trim. */
  passThrough?: boolean;
}

function normalize2(dx: number, dz: number): [number, number] | null {
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return null;
  return [dx / len, dz / len];
}

/** Trim the polyline end that connects to `junction` (walk inward by radius). */
function trimToRadius(pts: number[][], fromStart: boolean, radius: number): number[][] {
  if (pts.length < 2 || radius <= 0) return pts;
  const out = pts.map((p) => [p[0], p[1]] as number[]);
  let i = fromStart ? 0 : out.length - 1;
  const step = fromStart ? 1 : -1;
  let remaining = radius;
  while (out.length > 2) {
    const a = out[i]!;
    const b = out[i + step]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg <= remaining) {
      out.splice(i, 1);
      if (fromStart) i = 0;
      else i = out.length - 1;
      remaining -= seg;
    } else {
      const t = remaining / Math.max(1e-9, seg);
      if (fromStart) {
        out[0] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      } else {
        out[out.length - 1] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
      break;
    }
  }
  return out;
}

/**
 * Mitered ribbon pass: emits quads for one road strip (outer curb pass or inner
 * surface pass). Interior vertices use clamped miter joins; ends use plain
 * perpendicular offsets. Deterministic.
 */
function emitRibbon(
  vb: VertexBuilder,
  pts: number[][],
  half: number,
  yAt: (x: number, z: number, i: number) => number,
  color: number[],
  bridgeY: (x: number, z: number) => number | null,
  yOffset = 0,
): void {
  const n = pts.length;
  if (n < 2) return;
  const left: number[][] = [];
  const right: number[][] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(n - 1, i + 1)]!;
    // Smoothed direction (prev→next): proven to keep quad ordering on sharp
    // turns; mitered incoming-direction offsets twisted quads at hairpins.
    const d = normalize2(next[0] - prev[0], next[1] - prev[1]) ?? [1, 0];
    const n1: [number, number] = [-d[1], d[0]];
    left.push([pts[i]![0] + n1[0] * half, pts[i]![1] + n1[1] * half]);
    right.push([pts[i]![0] - n1[0] * half, pts[i]![1] - n1[1] * half]);
  }
  for (let i = 0; i < n - 1; i++) {
    const yA = (bridgeY(pts[i]![0], pts[i]![1]) ?? yAt(pts[i]![0], pts[i]![1], i)) + yOffset;
    const yB = (bridgeY(pts[i + 1]![0], pts[i + 1]![1]) ?? yAt(pts[i + 1]![0], pts[i + 1]![1], i + 1)) + yOffset;
    const a = vb.add(left[i]![0], yA, left[i]![1], color[0], color[1], color[2]);
    const b2 = vb.add(right[i]![0], yA, right[i]![1], color[0], color[1], color[2]);
    const c2 = vb.add(left[i + 1]![0], yB, left[i + 1]![1], color[0], color[1], color[2]);
    const d = vb.add(right[i + 1]![0], yB, right[i + 1]![1], color[0], color[1], color[2]);
    const ax = left[i]![0];
    const az = left[i]![1];
    const bx = right[i]![0];
    const bz = right[i]![1];
    const cx = left[i + 1]![0];
    const cz = left[i + 1]![1];
    const dx = right[i + 1]![0];
    const dz = right[i + 1]![1];
    const ny2 = (cz - az) * (bx - ax) - (cx - ax) * (bz - az);
    const ny3 = (cz - bz) * (dx - bx) - (cx - bx) * (dz - bz);
    if (ny2 < 0) vb.tri(a, b2, c2);
    else vb.tri(a, c2, b2);
    if (ny3 < 0) vb.tri(b2, d, c2);
    else vb.tri(b2, c2, d);
  }
}

const FACADE_PALETTE: number[][] = [
  [0.78, 0.63, 0.48],
  [0.83, 0.66, 0.51],
  [0.71, 0.55, 0.42],
  [0.85, 0.73, 0.6],
  [0.76, 0.58, 0.46],
  [0.8, 0.68, 0.52],
];

/** OBSERVED facade_material / roof_material → color (miniature style, no textures). */
const MATERIAL_COLORS: Record<string, number[]> = {
  brick: [0.62, 0.34, 0.24],
  red_brick: [0.66, 0.33, 0.27],
  concrete: [0.72, 0.72, 0.7],
  glass: [0.45, 0.62, 0.7],
  metal: [0.52, 0.55, 0.58],
  steel: [0.55, 0.58, 0.6],
  wood: [0.56, 0.42, 0.28],
  timber: [0.52, 0.38, 0.24],
  plaster: [0.82, 0.78, 0.7],
  stucco: [0.8, 0.75, 0.68],
  stone: [0.68, 0.66, 0.62],
  sandstone: [0.74, 0.66, 0.52],
  limestone: [0.8, 0.77, 0.7],
  marble: [0.85, 0.84, 0.8],
  slate: [0.35, 0.36, 0.4],
  copper: [0.45, 0.55, 0.5],
  tile: [0.58, 0.4, 0.3],
  ceramic: [0.75, 0.6, 0.5],
  zinc: [0.55, 0.58, 0.6],
  asphalt: [0.35, 0.35, 0.36],
  tar: [0.3, 0.3, 0.32],
};

/** DERIVED: Overture building subtype → stylized facade. */
const SUBTYPE_FACADES: Record<string, number[]> = {
  residential: [0.76, 0.55, 0.38],
  apartments: [0.7, 0.52, 0.42],
  house: [0.8, 0.6, 0.42],
  commercial: [0.55, 0.62, 0.72],
  retail: [0.6, 0.55, 0.65],
  offices: [0.5, 0.58, 0.68],
  civic: [0.78, 0.72, 0.6],
  education: [0.72, 0.6, 0.48],
  religious: [0.42, 0.42, 0.48],
  transportation: [0.5, 0.55, 0.6],
  industrial: [0.6, 0.58, 0.56],
  warehouse: [0.58, 0.56, 0.54],
  agricultural: [0.55, 0.5, 0.4],
  outbuilding: [0.62, 0.55, 0.45],
  entertainment: [0.58, 0.48, 0.62],
  hospital: [0.66, 0.68, 0.72],
  hotel: [0.68, 0.6, 0.55],
};

function hexToRgb(hex: string): number[] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1]!, 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff].map((c) => c / 255);
}

/**
 * Evidence-hierarchy facade color (OBSERVED hex → OBSERVED material →
 * DERIVED subtype style → INFERRED deterministic palette).
 */
export function facadeColorOf(f: FixtureFeature): number[] {
  if (f.facadeColor) {
    const hex = hexToRgb(f.facadeColor);
    if (hex) return hex;
  }
  if (f.facadeMaterial) {
    const mat = MATERIAL_COLORS[f.facadeMaterial.toLowerCase()];
    if (mat) return mat;
  }
  if (f.subtype) {
    const st = SUBTYPE_FACADES[f.subtype.toLowerCase()];
    if (st) return st;
  }
  return FACADE_PALETTE[fnv1a(f.id) % FACADE_PALETTE.length]!;
}

/** Evidence-hierarchy roof color (OBSERVED hex → OBSERVED material → facade-derived). */
export function roofColorOf(f: FixtureFeature, facade: number[]): number[] {
  if (f.roofColor) {
    const hex = hexToRgb(f.roofColor);
    if (hex) return hex;
  }
  if (f.roofMaterial) {
    const mat = MATERIAL_COLORS[f.roofMaterial.toLowerCase()];
    if (mat) return mat;
  }
  return [facade[0] * 0.82, facade[1] * 0.82, facade[2] * 0.82];
}

/** Roof apex height: OBSERVED roof_height when present, else stylized fraction. */
export function roofApexOf(f: FixtureFeature, height: number): number {
  if (f.roofHeight !== undefined && Number.isFinite(f.roofHeight)) {
    return Math.min(8, Math.max(0.6, f.roofHeight));
  }
  return Math.min(4, height * 0.25);
}

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
  const SHORE: number[] = [0.09, 0.22, 0.34];
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
        return vb.add(x, WATER_LEVEL - 0.05, z, 0.16 + lightness, 0.4 + lightness, 0.62 + lightness);
      });
      vb.tri(idx[0], idx[1], idx[2]);
    }
    // Shoreline ring: darker inward strip that separates water from land.
    emitRibbon(vb, pts, 0.55, () => WATER_LEVEL - 0.06, SHORE, () => null, -0.03);
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
    const y = sampleTerrain(terrain, cx, cy) + 0.03;
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
): { mesh: THREE.Mesh | null; count: number; stats: RoadMeshStats } {
  const vb = new VertexBuilder();
  let count = 0;

  // Elevation layering (all offsets relative to terrain): curb pass rides at
  // +0.06, the surface pass and junction caps at +0.08 — separate planes so
  // the two coplanar passes never z-fight.
  const CURB_Y = 0.06;
  const SURFACE_Y = 0.08;
  const yAt = (x: number, z: number): number => sampleTerrain(terrain, x, z);
  const bridgeY = (x: number, z: number): number | null =>
    waterRings.some((ring) => pointInRing(x, z, ring)) ? WATER_LEVEL + 0.3 : null;

  // Deduped polylines per feature.
  interface Seg {
    f: FixtureFeature;
    pts: number[][];
    width: number;
    vehicular: boolean;
    connectors?: Array<{ id: string; at: number }>;
  }
  const segs: Seg[] = [];
  let anyConnectors = false;
  for (const f of c.features) {
    if (!f.line || f.line.length < 2) continue;
    const pts: number[][] = [];
    for (const p of f.line) {
      const last = pts[pts.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
    }
    if (pts.length < 2) continue;
    if (f.connectors && f.connectors.length > 0) anyConnectors = true;
    const vehicular = !NON_VEHICULAR_CLASSES.has(f.class ?? "");
    segs.push({
      f,
      pts,
      width: ROAD_WIDTHS[f.class ?? ""] ?? 4,
      vehicular,
      connectors: f.connectors,
    });
  }

  // Junction graph: connector ids (Overture topology) when present; otherwise
  // pseudo-junctions from shared endpoints (legacy/connector-less fixtures).
  const junctions = new Map<string, RoadJunction>();
  const addJunction = (id: string, x: number, z: number, seg: Seg): void => {
    let j = junctions.get(id);
    if (!j) {
      j = { x, z, radius: 0, features: [] };
      junctions.set(id, j);
    }
    j.features.push({ f: seg.f, width: seg.width });
    j.radius = Math.max(j.radius, seg.width / 2);
  };
  for (const s of segs) {
    for (const conn of s.connectors ?? []) {
      const pos = conn.at <= 0.5 ? s.pts[0]! : s.pts[s.pts.length - 1]!;
      addJunction(conn.id, pos[0], pos[1], s);
    }
  }
  if (!anyConnectors) {
    // Endpoint clustering: segments sharing an endpoint (within 0.75 m) form
    // a junction — same topology the connectors would have given.
    const byEnd = new Map<string, Array<{ seg: Seg; atStart: boolean }>>();
    const key = (x: number, z: number) => `${Math.round(x / 0.75)}:${Math.round(z / 0.75)}`;
    for (const s of segs) {
      const a = s.pts[0]!;
      const b = s.pts[s.pts.length - 1]!;
      const ka = key(a[0], a[1]);
      const kb = key(b[0], b[1]);
      const la = byEnd.get(ka) ?? [];
      la.push({ seg: s, atStart: true });
      byEnd.set(ka, la);
      const lb = byEnd.get(kb) ?? [];
      lb.push({ seg: s, atStart: false });
      byEnd.set(kb, lb);
    }
    let pseudo = 0;
    for (const [, list] of byEnd) {
      if (list.length < 2) continue;
      const { seg } = list[0]!;
      const pos = list[0]!.atStart ? seg.pts[0]! : seg.pts[seg.pts.length - 1]!;
      for (const item of list) {
        const p = item.atStart ? item.seg.pts[0]! : item.seg.pts[item.seg.pts.length - 1]!;
        addJunction(`pseudo:${pseudo}:${Math.round(p[0])}:${Math.round(p[1])}`, pos[0], pos[1], item.seg);
      }
      pseudo++;
    }
  }

  // Pass-through detection: OSM splits every way at its nodes, so 2-way
  // junctions of the SAME class and roughly collinear segments are NOT real
  // intersections — they would cap every ~80 m of a straight street (the
  // "beaded road" artifact). Such junctions get no cap and no trim.
  // Direction uses each segment's OWN connector `at` flag (robust to rounded
  // endpoint coordinates), not position matching.
  const dirAtJunction = (f: FixtureFeature, jid: string): [number, number] | null => {
    const line = f.line;
    if (!line || line.length < 2) return null;
    const ref = (f.connectors ?? []).find((c) => c.id === jid);
    const fromStart = ref ? ref.at <= 0.5 : true;
    if (fromStart) return normalize2(line[1]![0] - line[0]![0], line[1]![1] - line[0]![1]);
    const p = line[line.length - 1]!;
    return normalize2(p[0] - line[line.length - 2]![0], p[1] - line[line.length - 2]![1]);
  };
  for (const [jid, j] of junctions) {
    if (j.features.length !== 2) continue;
    const [a, b] = j.features;
    if ((a.f.class ?? "") !== (b.f.class ?? "")) continue;
    const d1 = dirAtJunction(a.f, jid);
    const d2 = dirAtJunction(b.f, jid);
    if (d1 && d2) {
      const dot = Math.abs(d1[0] * d2[0] + d1[1] * d2[1]);
      if (dot >= 0.9) j.passThrough = true;
    }
  }
  let passThroughCount = 0;
  let realJunctionCount = 0;
  for (const j of junctions.values()) {
    if (j.features.length < 2) continue;
    if (j.passThrough) passThroughCount++;
    else realJunctionCount++;
  }

  // Trim ribbons to their junction radii (clamped so short segments between
  // junctions never vanish) and emit passes.
  const segLen = (pts: number[][]): number => {
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) len += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
    return len;
  };
  for (const s of segs) {
    let pts = s.pts;
    const totalLen = segLen(s.pts);
    for (const conn of s.connectors ?? []) {
      const j = junctions.get(conn.id);
      if (!j || j.features.length < 2 || j.passThrough) continue;
      const fromStart = conn.at <= 0.5;
      const budget = Math.max(0, (totalLen - 1.5) / 2);
      const radius = Math.min(j.radius + (s.vehicular ? 0 : 0.2), budget);
      if (radius > 0) pts = trimToRadius(pts, fromStart, radius);
    }
    if (pts.length < 2) continue;
    const clsVar = (fnv1a(s.f.class ?? "") % 3 - 1) * 0.015;
    if (s.vehicular) {
      const surface: number[] = [ROAD_SURFACE[0] + clsVar, ROAD_SURFACE[1] + clsVar, ROAD_SURFACE[2] + clsVar];
      const inset = Math.min(CURB_INSET, s.width / 4);
      emitRibbon(vb, pts, s.width / 2, yAt, CURB_COLOR, bridgeY, CURB_Y);
      emitRibbon(vb, pts, s.width / 2 - inset, yAt, surface, bridgeY, SURFACE_Y);
    } else {
      const path: number[] = [PATH_COLOR[0] + clsVar, PATH_COLOR[1] + clsVar, PATH_COLOR[2] + clsVar];
      emitRibbon(vb, pts, s.width / 2, yAt, path, bridgeY, CURB_Y);
    }
    count++;
  }

  // Junction caps: one polygon per REAL junction (>=2 incident roads, not
  // pass-through splits), sized to the largest incident half-width; fills the
  // trimmed crossing. A curb ring (radius+0.35) is emitted underneath so the
  // road's dark edge outline stays continuous through every intersection —
  // without it the curb visually disappears at each junction (beaded road).
  const capFan = (jx: number, jz: number, radius: number, color: number[], y: number): void => {
    const N = 10;
    for (let k = 0; k < N; k++) {
      const a0 = (2 * Math.PI * k) / N;
      const a1 = (2 * Math.PI * (k + 1)) / N;
      const p0: number[] = [jx + Math.cos(a0) * radius, jz + Math.sin(a0) * radius];
      const p1: number[] = [jx + Math.cos(a1) * radius, jz + Math.sin(a1) * radius];
      const va = vb.add(p0[0], y, p0[1], color[0], color[1], color[2]);
      const vc = vb.add(p1[0], y, p1[1], color[0], color[1], color[2]);
      const vctr = vb.add(jx, y, jz, color[0], color[1], color[2]);
      // Winding guard (same convention as ribbons): fan must face up.
      const ny = (p1[0] - jx) * (p0[1] - jz) - (p1[1] - jz) * (p0[0] - jx);
      if (ny >= 0) vb.tri(vctr, va, vc);
      else vb.tri(vctr, vc, va);
    }
  };
  let caps = 0;
  for (const j of junctions.values()) {
    if (j.features.length < 2 || j.passThrough) continue;
    const y = (bridgeY(j.x, j.z) ?? yAt(j.x, j.z)) + SURFACE_Y;
    capFan(j.x, j.z, j.radius + 0.35, CURB_COLOR, y - (SURFACE_Y - CURB_Y));
    capFan(j.x, j.z, j.radius, ROAD_SURFACE, y);
    count += 2;
    caps += 2;
  }

  return { mesh: vb.toMesh(ROAD_MATERIAL), count, stats: { caps, passThrough: passThroughCount, realJunctions: realJunctionCount } };
}

interface BuildingParts {
  ring: number[][];
  height: number;
  roof?: string;
  provenance: "observed" | "derived" | "inferred";
}

export interface ResolvedBuilding extends BuildingParts {
  id: string;
  levels?: number;
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
  return { id: f.id, ring, height: Math.max(3, height), roof, levels, provenance };
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
    const [cx, cz] = centroid(ring);
    // Terrain-hugging base: each ring vertex sits on its own terrain height
    // (sloped skirt), while the roof stays flat at maxBase + height. Physics
    // uses the same max-base policy (box), so colliders never hang in air.
    let maxBase = -Infinity;
    const baseYAt: number[] = [];
    for (const p of ring) {
      const t = sampleTerrain(terrain, p[0], p[1]) - 0.15;
      baseYAt.push(t);
      maxBase = Math.max(maxBase, t);
    }
    const wallTop = maxBase + height;
    const facade = facadeColorOf(f);
    const roofCol = roofColorOf(f, facade);
    const groundCol = [facade[0] * 0.7, facade[1] * 0.7, facade[2] * 0.7];
    const faces = triangulate(ring);
    const gabled = roof === "gabled" || roof === "hipped";
    const pyramidal = roof === "pyramidal" || roof === "pyramid";
    const apex = roofApexOf(f, height);
    const minX = Math.min(...ring.map((p) => p[0]));
    const maxX = Math.max(...ring.map((p) => p[0]));
    const minZ = Math.min(...ring.map((p) => p[1]));
    const maxZ = Math.max(...ring.map((p) => p[1]));
    const extentX = maxX - minX;
    const extentZ = maxZ - minZ;
    const ridgeX = extentX >= extentZ;
    const roofYAt = (p: number[]): number => {
      if (pyramidal) {
        const t = Math.max(Math.abs(p[0] - cx) / Math.max(1e-9, extentX / 2), Math.abs(p[1] - cz) / Math.max(1e-9, extentZ / 2));
        return wallTop + apex * (1 - Math.min(1, t));
      }
      if (!gabled) return wallTop;
      const t = ridgeX ? (p[0] - minX) / Math.max(1e-9, extentX) : (p[1] - minZ) / Math.max(1e-9, extentZ);
      return wallTop + 2 * apex * Math.min(t, 1 - t);
    };
    const capVerts: number[] = ring.map((p) =>
      vb.add(p[0], roofYAt(p), p[1], roofCol[0], roofCol[1], roofCol[2]),
    );
    const groundVerts: number[] = ring.map((p, i) => vb.add(p[0], baseYAt[i]!, p[1], groundCol[0], groundCol[1], groundCol[2]));
    // Facade rhythm: few horizontal bands (miniature floors) when levels are
    // known — bounded (≤4 bands) so tall buildings stay cheap.
    const bands = built.levels !== undefined && Number.isFinite(built.levels) && built.levels > 1 ? Math.min(4, Math.max(2, Math.round(built.levels / 4))) : 1;
    const bandTops: number[][] = [];
    for (let b = 0; b < bands; b++) {
      const shade = 1 - 0.1 * (b % 2);
      bandTops.push(
        ring.map((p, i) =>
          vb.add(p[0], baseYAt[i]! + (height * (b + 1)) / bands, p[1], facade[0] * shade, facade[1] * shade, facade[2] * shade),
        ),
      );
    }
    for (const [a, b2, c2] of faces) {
      vb.tri(capVerts[a], capVerts[b2], capVerts[c2]);
      vb.tri(groundVerts[a], groundVerts[c2], groundVerts[b2]);
    }
    let prevBand = groundVerts;
    for (const band of bandTops) {
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        const a = prevBand[i];
        const b2 = prevBand[j];
        const c2 = band[j];
        const d = band[i];
        vb.tri(a, c2, b2);
        vb.tri(a, d, c2);
      }
      prevBand = band;
    }
    // Flat top edge (roof sits at maxBase + height; sloped bands end lower on
    // low corners, so close the strip at the true wall top).
    const topShade = 1 - 0.1 * (bands % 2);
    const wallTopVerts: number[] = ring.map((p) =>
      vb.add(p[0], wallTop, p[1], facade[0] * topShade, facade[1] * topShade, facade[2] * topShade),
    );
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      const a = prevBand[i];
      const b2 = prevBand[j];
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

// --- Trees (deterministic stylized placement, shared geometries) ------------

const TREE_CAP_PER_CHUNK = 80;
let TREE_GEO: { trunk: THREE.CylinderGeometry; foliage: THREE.ConeGeometry } | null = null;

function treeGeometries(): { trunk: THREE.CylinderGeometry; foliage: THREE.ConeGeometry } {
  if (!TREE_GEO) {
    TREE_GEO = {
      trunk: new THREE.CylinderGeometry(0.14, 0.2, 0.9, 6),
      foliage: new THREE.ConeGeometry(1.25, 2.6, 7),
    };
  }
  return TREE_GEO;
}

function distToPolyline(px: number, pz: number, line: number[][]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i]![0];
    const az = line[i]![1];
    const bx = line[i + 1]![0];
    const bz = line[i + 1]![1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), pz - (az + t * dz)));
  }
  return best;
}

/**
 * Deterministic stylized trees inside real green polygons (forest/grass),
 * cleared of roads/buildings/water. Seeded per (chunk,index) — no Math.random.
 */
function buildTreeChunkExtras(
  landcover: ChunkRecord | undefined,
  roads: ChunkRecord | undefined,
  buildings: ChunkRecord | undefined,
  terrain: ChunkTerrain[],
): THREE.Group | null {
  if (!landcover) return null;
  const roadLines: number[][][] = [];
  for (const f of roads?.features ?? []) if (f.line) roadLines.push(f.line);
  const buildingRings: number[][][] = [];
  for (const f of buildings?.features ?? []) if (f.ring) buildingRings.push(f.ring);
  const group = new THREE.Group();
  let placed = 0;
  for (const f of landcover.features) {
    if (!f.ring || placed >= TREE_CAP_PER_CHUNK) continue;
    const cls = f.class;
    if (cls !== "forest" && cls !== "grass") continue;
    const pts = distinctPoints(f.ring);
    if (pts.length < 3) continue;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const spacing = cls === "forest" ? 8 : 13;
    const cols = Math.max(1, Math.floor((maxX - minX) / spacing));
    const rows = Math.max(1, Math.floor((maxZ - minZ) / spacing));
    const seed = fnv1a(f.id);
    for (let r = 0; r < rows && placed < TREE_CAP_PER_CHUNK; r++) {
      for (let c = 0; c < cols && placed < TREE_CAP_PER_CHUNK; c++) {
        const h1 = (fnv1a(`${f.id}:${r}:${c}:${seed}`) % 1000) / 1000;
        const h2 = (fnv1a(`${f.id}:${c}:${r}:${seed ^ 0x9e37}`) % 1000) / 1000;
        const x = minX + (c + 0.25 + h1 * 0.5) * spacing;
        const z = minZ + (r + 0.25 + h2 * 0.5) * spacing;
        if (!pointInRing(x, z, pts)) continue;
        if (roadLines.some((line) => distToPolyline(x, z, line) < 2.5)) continue;
        if (buildingRings.some((ring) => pointInRing(x, z, ring))) continue;
        const scale = 0.7 + h1 * 0.6;
        const geo = treeGeometries();
        const y = sampleTerrain(terrain, x, z);
        const trunk = new THREE.Mesh(geo.trunk, new THREE.MeshLambertMaterial({ color: 0x5d4430 }));
        trunk.position.set(x, y + 0.45 * scale, z);
        trunk.scale.setScalar(scale);
        const foliageTone = cls === "forest" ? 0.23 + h2 * 0.12 : 0.34 + h2 * 0.16;
        const foliage = new THREE.Mesh(
          geo.foliage,
          new THREE.MeshLambertMaterial({ color: new THREE.Color(foliageTone, 0.4 + h2 * 0.22, 0.18 + h2 * 0.12) }),
        );
        foliage.position.set(x, y + (0.9 + 1.3) * scale, z);
        foliage.scale.setScalar(scale);
        group.add(trunk);
        group.add(foliage);
        placed++;
      }
    }
  }
  return placed > 0 ? group : null;
}

export interface RoadMeshStats {
  /** Junction caps emitted (surface + curb ring each count as one cap). */
  caps: number;
  /** 2-way collinear splits suppressed as pass-through (no cap/trim). */
  passThrough: number;
  /** Non-pass-through junctions that legitimately keep caps. */
  realJunctions: number;
}

export interface ChunkBuildResult {
  group: THREE.Group;
  counts: { buildings: number; roads: number; waterPolys: number; landcover: number };
  provenance: WorldProvenance;
  roadStats: RoadMeshStats;
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
  const roadStats: RoadMeshStats = { caps: 0, passThrough: 0, realJunctions: 0 };

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
  const rRec0 = fixture.roads.find((c) => c.x === x && c.y === y);
  if (rRec0) {
    const built = buildRoadChunkMesh(rRec0, fixture.terrain, waterRingsOf(fixture));
    counts.roads += built.count;
    roadStats.caps += built.stats.caps;
    roadStats.passThrough += built.stats.passThrough;
    roadStats.realJunctions += built.stats.realJunctions;
    if (built.mesh) group.add(built.mesh);
  }
  yield;
  addChunk(fixture.water, (c) => buildWaterChunkMesh(c), "waterPolys");
  yield;
  addChunk(fixture.landcover, (c) => buildLandcoverChunkMesh(c, fixture.terrain), "landcover");
  yield;
  // Street labels: ON-ROAD map-like placement (owner decision). Each label
  // sits at the midpoint of the road's LONGEST segment — away from junction
  // centers — at a small offset above the surface (no floating billboards).
  // Class-prioritized + density-capped; very long roads may repeat with strict
  // spacing; per-chunk name dedup + chunk-edge margin avoid duplicates.
  const rRec = fixture.roads.find((c) => c.x === x && c.y === y);
  if (rRec) {
    const chunkSpan = fixture.manifest.chunkSize as number;
    const halfSpan = chunkSpan / 2;
    const edgeMargin = 120;
    const farFromEdge = (px: number, pz: number): boolean => {
      const dx = Math.min(px + halfSpan, halfSpan - px);
      const dz = Math.min(pz + halfSpan, halfSpan - pz);
      return dx > edgeMargin && dz > edgeMargin;
    };
    const named: Array<{ name: string; x: number; z: number; prio: number; len: number }> = [];
    const seen = new Set<string>();
    for (const f of rRec.features) {
      if (!f.line || f.line.length < 2) continue;
      if (!f.name || seen.has(f.name)) continue;
      const prio = labelPriorityOf(f.class ?? "");
      if (prio < 1) continue;
      const line = f.line;
      const segLenAt = (i: number) => Math.hypot(line[i + 1]![0] - line[i]![0], line[i + 1]![1] - line[i]![1]);
      const totalLen = (() => {
        let l = 0;
        for (let i = 0; i < line.length - 1; i++) l += segLenAt(i);
        return l;
      })();
      // Longest segment (>=10 m preferred; otherwise the feature is a stub).
      let best = -1;
      let bestLen = -1;
      for (let i = 0; i < line.length - 1; i++) {
        const l = segLenAt(i);
        if (l > bestLen) {
          bestLen = l;
          best = i;
        }
      }
      if (best < 0 || bestLen < 8) continue;
      const roadName = f.name;
      const roadLine = line;
      const addLabelAt = (i: number, t: number): void => {
        const px = roadLine[i]![0] + (roadLine[i + 1]![0] - roadLine[i]![0]) * t;
        const pz = roadLine[i]![1] + (roadLine[i + 1]![1] - roadLine[i]![1]) * t;
        if (!farFromEdge(px, pz)) return;
        named.push({ name: roadName, x: px, z: pz, prio, len: roadName.length });
      };
      addLabelAt(best, 0.5);
      // Very long roads: one repeat at >=200 m from the first label.
      if (totalLen > 400 && bestLen < totalLen - 200) {
        const second = (() => {
          let cum = 0;
          const target = Math.min(totalLen - 60, bestLen + 200);
          for (let i = 0; i < f.line.length - 1; i++) {
            const l = segLenAt(i);
            if (cum + l >= target) {
              const t = (target - cum) / Math.max(1e-9, l);
              const px = f.line[i]![0] + (f.line[i + 1]![0] - f.line[i]![0]) * t;
              const pz = f.line[i]![1] + (f.line[i + 1]![1] - f.line[i]![1]) * t;
              if (farFromEdge(px, pz) && Math.hypot(px - named[named.length - 1]!.x, pz - named[named.length - 1]!.z) > 200) {
                named.push({ name: f.name, x: px, z: pz, prio, len: f.name.length });
              }
              return;
            }
            cum += l;
          }
        })();
        void second;
      }
      seen.add(f.name);
    }
    named.sort((a, b) => b.prio - a.prio || a.len - b.len);
    if (typeof document !== "undefined") {
      for (const n of named.slice(0, MAX_LABELS_PER_CHUNK)) {
        // Small vertical offset only: clear of the surface plane, never floating
        // above the street (owner decision: on-street labels).
        const y = sampleTerrain(fixture.terrain, n.x, n.z) + 0.6;
        group.add(createLabelSprite({ name: n.name, x: n.x, z: n.z, y, scale: Math.min(20, 2.2 + n.len * 1.15) }));
      }
    }
  }
  yield;
  // Stylized trees inside real green polygons (deterministic placement).
  const lcRec = fixture.landcover.find((c) => c.x === x && c.y === y);
  const bRec0 = fixture.buildings.find((c) => c.x === x && c.y === y);
  if (lcRec || rRec) {
    const trees = buildTreeChunkExtras(lcRec, rRec, bRec0, fixture.terrain);
    if (trees) group.add(trees);
  }
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
  return { group, counts, provenance, roadStats };
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
    const built = buildRoadChunkMesh(c, fixture.terrain, waterRingsOf(fixture));
    counts.roads += built.count;
    if (built.mesh) {
      const group = new THREE.Group();
      group.add(built.mesh);
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
