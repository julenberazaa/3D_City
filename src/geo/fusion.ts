import type { ChunkTerrain, WorldFixture } from "../world/generator";
import { sampleTerrain } from "../world/generator";
import { webMercatorX, webMercatorY } from "./projection";

export { sampleTerrain };

export interface GeoPoint {
  lon: number;
  lat: number;
}

export interface LocalPoint {
  x: number;
  z: number;
}

export interface WorldOrigin {
  /** Fixture origin in EPSG:3857 meters (the manifest.origin). */
  x: number;
  y: number;
}

/** Fixture-local (x, z) → geographic lon/lat via the fixture's mercator origin. */
export function localToGeo(origin: WorldOrigin, x: number, z: number): GeoPoint {
  return {
    lon: (origin.x + x) / 20037508.342789244 * 180,
    lat: (2 * Math.atan(Math.exp((origin.y + z) / 6378137)) - Math.PI / 2) * 180 / Math.PI,
  };
}

/** Geographic lon/lat → fixture-local (x, z). */
export function geoToLocal(origin: WorldOrigin, lon: number, lat: number): LocalPoint {
  return {
    x: webMercatorX(lon) - origin.x,
    z: webMercatorY(lat) - origin.y,
  };
}

/**
 * Stitch terrain seams between adjacent chunks so shared edges agree.
 * For each chunk pair, the shared edge values are replaced by their average;
 * the two outermost rows/columns are then blended toward the neighbor's edge
 * with a linear falloff so the transition is smooth. Deterministic and
 * idempotent (once edges agree, averaging changes nothing).
 */
export function stitchTerrainEdges(terrain: ChunkTerrain[]): ChunkTerrain[] {
  const out = terrain.map((c) => ({
    ...c,
    heights: c.heights.map((row) => row.slice()),
  }));
  const byKey = new Map(out.map((c) => [chunkKey(c.z, c.x, c.y), c]));
  const n = out[0]?.size ?? 0;
  if (n === 0) return out;
  const last = n - 1;

  const blendCol = (c: ChunkTerrain, col: number, rowA: number, rowB: number, w: number, v: number): void => {
    c.heights[rowA]![col] = v;
    c.heights[rowB]![col] = c.heights[rowB]![col] * (1 - w) + v * w;
  };

  // East-west pairs first, then north-south, then corners: independent axis
  // passes would otherwise break the corner posts of the other axis.
  for (const c of out) {
    const e = byKey.get(chunkKey(c.z, c.x + 1, c.y));
    if (!e) continue;
    for (let j = 0; j < n; j++) {
      const a = c.heights[j]![last]!;
      const b = e.heights[j]![0]!;
      if (Math.abs(a - b) < 1e-6) continue;
      const v = (a + b) / 2;
      c.heights[j]![last] = v;
      e.heights[j]![0] = v;
      const w1 = 0.33;
      const w2 = 0.67;
      if (last - 1 >= 0) c.heights[j]![last - 1] = c.heights[j]![last - 1]! * (1 - w1) + v * w1;
      if (1 < n) e.heights[j]![1] = e.heights[j]![1]! * (1 - w1) + v * w1;
      if (last - 2 >= 0) c.heights[j]![last - 2] = c.heights[j]![last - 2]! * (1 - w2) + v * w2;
      if (2 < n) e.heights[j]![2] = e.heights[j]![2]! * (1 - w2) + v * w2;
    }
  }
  // North-south pairs: the shared edge of chunk c and its NORTH neighbor nb
  // (tile y-1, higher originY) is c.row 0 vs nb.row 32 (both hold the same
  // geographic line; local z decreases southward so row 0 is the north edge).
  for (const c of out) {
    const nb = byKey.get(chunkKey(c.z, c.x, c.y - 1));
    if (!nb) continue;
    for (let i = 0; i < n; i++) {
      const a = c.heights[0]![i]!;
      const b = nb.heights[last]![i]!;
      if (Math.abs(a - b) < 1e-6) continue;
      const v = (a + b) / 2;
      c.heights[0]![i] = v;
      nb.heights[last]![i] = v;
      const w1 = 0.33;
      const w2 = 0.67;
      if (1 < n) c.heights[1]![i] = c.heights[1]![i]! * (1 - w1) + v * w1;
      if (last - 1 >= 0) nb.heights[last - 1]![i] = nb.heights[last - 1]![i]! * (1 - w1) + v * w1;
      if (2 < n) c.heights[2]![i] = c.heights[2]![i]! * (1 - w2) + v * w2;
      if (last - 2 >= 0) nb.heights[last - 2]![i] = nb.heights[last - 2]![i]! * (1 - w2) + v * w2;
    }
  }
  // Corner posts are shared by up to four chunks: average them so both axis
  // seams stay continuous at the corners.
  const cornerAvg = new Map<string, number>();
  const cornerOwners = new Map<string, Array<{ c: ChunkTerrain; row: number; col: number }>>();
  const cornerKey = (cx: number, cy: number, row: number, col: number): string =>
    `${cx}/${cy}/${row === 0 ? "n" : "s"}/${col === 0 ? "w" : "e"}`;
  for (const c of out) {
    for (const [row, col] of [
      [0, 0],
      [0, last],
      [last, 0],
      [last, last],
    ] as Array<[number, number]>) {
      const key = cornerKey(c.x, c.y, row, col);
      if (!cornerOwners.has(key)) cornerOwners.set(key, []);
      cornerOwners.get(key)!.push({ c, row, col });
    }
  }
  for (const [key, owners] of cornerOwners) {
    let sum = 0;
    for (const o of owners) sum += o.c.heights[o.row]![o.col]!;
    cornerAvg.set(key, sum / owners.length);
  }
  for (const [key, avg] of cornerAvg) {
    for (const o of cornerOwners.get(key)!) o.c.heights[o.row]![o.col] = avg;
  }
  return out;
}

/**
 * Prepare a fixture for world building: terrain seams stitched so render and
 * physics use identical, seam-free heights. Deterministic.
 */
export function prepareFixture(fixture: WorldFixture): WorldFixture {
  return { ...fixture, terrain: stitchTerrainEdges(fixture.terrain) };
}

/**
 * One elevation policy for the whole world: sample a terrain set at
 * fixture-local (x, z). Render, physics, spawn and fusion all use this.
 */
export const elevationPolicy = {
  sample: sampleTerrain,
};

/**
 * Floating-origin groundwork: translate geometry between two world origins.
 * newLocal = oldLocal + (oldOrigin - newOrigin). Geographic coordinates are
 * the stable identity; local coordinates are origin-relative.
 */
export function rebasePoint(
  oldOrigin: WorldOrigin,
  newOrigin: WorldOrigin,
  x: number,
  z: number,
): LocalPoint {
  return { x: x + (oldOrigin.x - newOrigin.x), z: z + (oldOrigin.y - newOrigin.y) };
}

function chunkKey(z: number, x: number, y: number): string {
  return `${z}-${x}-${y}`;
}

export interface FusionPipeline {
  origin: WorldOrigin;
  terrain: ChunkTerrain[];
  toLocal(lon: number, lat: number): LocalPoint;
  toGeo(x: number, z: number): GeoPoint;
  elevation(x: number, z: number): number;
  rebase(newOrigin: WorldOrigin, x: number, z: number): LocalPoint;
}

/** Full pipeline bound to a prepared fixture. */
export function createFusion(fixture: WorldFixture): FusionPipeline {
  const terrain = stitchTerrainEdges(fixture.terrain);
  const origin: WorldOrigin = { x: fixture.manifest.origin.x, y: fixture.manifest.origin.y };
  return {
    origin,
    terrain,
    toLocal: (lon, lat) => geoToLocal(origin, lon, lat),
    toGeo: (x, z) => localToGeo(origin, x, z),
    elevation: (x, z) => sampleTerrain(terrain, x, z),
    rebase: (newOrigin, x, z) => rebasePoint(origin, newOrigin, x, z),
  };
}
