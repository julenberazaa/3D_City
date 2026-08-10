import { tileOriginX, tileOriginY, tileSizeMeters, webMercatorX, webMercatorY, worldToTileX, worldToTileY } from "../geo/projection.ts";

export const RELEASE = "2026-07-22.0";
export const PINNED_AT = "2026-07-22.0";
export const OVERTURE_BASE = `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${RELEASE}`;
export const TERRARIUM_PATTERN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const Z15 = 15;
export const Z14 = 14;
export const Z13 = 13;
export const TERRAIN_GRID = 33;

export const DEFAULT_BBOX: [number, number, number, number] = [-122.425, 37.767, -122.396, 37.792];

export const ROAD_CLASSES = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "service",
  "living_street",
  "unclassified",
  "footway",
  "path",
  "steps",
  "pedestrian",
  "cycleway",
]);

export const round2 = (v: number): number => Math.round(v * 100) / 100;
export const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

export interface TileRef {
  z: number;
  x: number;
  y: number;
}

export interface RawLayerItem {
  tile: TileRef;
  extent: number;
  ring?: number[][];
  line?: number[][];
  props: Record<string, unknown>;
}

export interface DecodedHeights {
  w: number;
  h: number;
  heights: Float32Array;
}

export interface BuildFixtureInput {
  name: string;
  bbox: [number, number, number, number];
  chunks: TileRef[];
  z14TileCount: number;
  z13TileCount: number;
  buildings: RawLayerItem[];
  buildingParts: RawLayerItem[];
  roads: RawLayerItem[];
  water: RawLayerItem[];
  landcover: RawLayerItem[];
  /** z15 chunk key "x/y" → decoded terrain heights for the z15 tile and/or its z14 parent. */
  terrains: Map<string, { z15?: DecodedHeights; z14?: DecodedHeights }>;
}

export interface WorldFixtureJson {
  manifest: Record<string, unknown>;
  buildings: { chunks: unknown[] };
  roads: { chunks: unknown[] };
  water: { chunks: unknown[] };
  landcover: { chunks: unknown[] };
  terrain: { chunks: unknown[] };
}

/** Bounding box -> z15 tile grid (inclusive). */
export function z15Grid(bbox: [number, number, number, number]): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const [w, s, e, n] = bbox;
  return {
    xMin: Math.floor(worldToTileX(webMercatorX(w), Z15)),
    xMax: Math.floor(worldToTileX(webMercatorX(e), Z15)),
    yMin: Math.floor(worldToTileY(webMercatorY(n), Z15)),
    yMax: Math.floor(worldToTileY(webMercatorY(s), Z15)),
  };
}

/** World mercator coords -> z15 chunk key if inside grid, else null. */
export function chunkOf(x: number, y: number, grid: { xMin: number; xMax: number; yMin: number; yMax: number }): string | null {
  const tx = Math.floor(worldToTileX(x, Z15));
  const ty = Math.floor(worldToTileY(y, Z15));
  if (tx < grid.xMin || tx > grid.xMax || ty < grid.yMin || ty > grid.yMax) return null;
  return `${tx}/${ty}`;
}

/** Convert tile-local points (px 0..extent) to local meters relative to origin. */
export function localize(points: number[][], z: number, tx: number, ty: number, extent: number, origin: { x: number; y: number }): number[][] {
  const size = tileSizeMeters(z);
  const ox = tileOriginX(tx, z);
  const oy = tileOriginY(ty, z);
  return points.map(([px, py]) => {
    const x = ox + (px / extent) * size;
    const y = oy - (py / extent) * size;
    return [round2(x - origin.x), round2(y - origin.y)];
  });
}

/** World coords of a tile-local point. */
export function localToWorld(px: number, py: number, z: number, tx: number, ty: number, extent: number): [number, number] {
  const size = tileSizeMeters(z);
  return [tileOriginX(tx, z) + (px / extent) * size, tileOriginY(ty, z) - (py / extent) * size];
}

/** Mean of points (centroid proxy, sufficient for chunk bucketing). */
export function pointsCentroid(points: number[][]): [number, number] {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
  }
  return [sx / points.length, sy / points.length];
}

/** Absolute shoelace area of a ring in tile-local units. */
export function ringArea(points: number[][]): number {
  let a = 0;
  for (let i = 0; i < points.length - 1; i++) {
    a += points[i]![0]! * points[i + 1]![1]! - points[i + 1]![0]! * points[i]![1]!;
  }
  return Math.abs(a / 2);
}

/** Count distinct (x,y) points in a ring. */
export function distinctPoints(points: number[][]): number {
  const seen = new Set<string>();
  for (const [x, y] of points) seen.add(`${x},${y}`);
  return seen.size;
}

/** Ensure a closed ring (last point == first) after rounding. */
export function closeRing(ring: number[][]): number[][] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([first[0], first[1]]);
  return ring;
}

/** Stable sort by id string. */
export function sortByFeatureId<T extends { id: string }>(features: T[]): T[] {
  return [...features].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

export function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function bilinearSample(data: Float32Array, w: number, h: number, u: number, v: number): number {
  const x = Math.max(0, Math.min(w - 1, u));
  const y = Math.max(0, Math.min(h - 1, v));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = data[y0 * w + x0]!;
  const b = data[y0 * w + x1]!;
  const c = data[y1 * w + x0]!;
  const d = data[y1 * w + x1]!;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/** Resample a w*h height field to a TERRAIN_GRID^2 grid of rounded meters. */
export function resampleHeights(data: Float32Array, w: number, h: number): number[][] {
  const step = (w - 1) / (TERRAIN_GRID - 1);
  const out: number[][] = [];
  for (let j = 0; j < TERRAIN_GRID; j++) {
    const row: number[] = [];
    for (let i = 0; i < TERRAIN_GRID; i++) {
      row.push(round2(bilinearSample(data, w, h, i * step, j * step)));
    }
    out.push(row);
  }
  return out;
}

/** Resample only the sub-extent of a parent tile covered by a zoom+1 child tile. */
export function resampleHeightsSubExtent(data: Float32Array, w: number, h: number, fx: number, fy: number, frac: number): number[][] {
  const out: number[][] = [];
  for (let j = 0; j < TERRAIN_GRID; j++) {
    const row: number[] = [];
    for (let i = 0; i < TERRAIN_GRID; i++) {
      const u = (fx + (i / (TERRAIN_GRID - 1)) * frac) * (w - 1);
      const v = (fy + (j / (TERRAIN_GRID - 1)) * frac) * (h - 1);
      row.push(round2(bilinearSample(data, w, h, u, v)));
    }
    out.push(row);
  }
  return out;
}

interface CategorySpec {
  name: string;
  prefix: string;
  geom: "ring" | "line";
  keep?: (item: RawLayerItem) => boolean;
  toFeature: (item: RawLayerItem) => Record<string, unknown>;
}

/**
 * Build the fixture JSON for a bbox from raw decoded layer items and terrain
 * heights. Deterministic: same inputs → byte-identical outputs. Mirrors the
 * original tools/fetch-fixture.mjs behavior exactly.
 */
export function buildFixture(input: BuildFixtureInput): WorldFixtureJson {
  const { bbox, chunks, terrains } = input;
  const origin = {
    x: round2((webMercatorX(bbox[0]) + webMercatorX(bbox[2])) / 2),
    y: round2((webMercatorY(bbox[3]) + webMercatorY(bbox[1])) / 2),
  };
  const center = {
    lat: round6((2 * Math.atan(Math.exp(origin.y / 6378137)) - Math.PI / 2) * 180 / Math.PI),
    lon: round6(origin.x / 20037508.342789244 * 180),
  };
  const grid = z15Grid(bbox);

  const bucket = (item: RawLayerItem): { key: string; x: number; y: number } | null => {
    const points = item.ring ?? item.line ?? [];
    const [cx, cy] = pointsCentroid(points);
    const [wx, wy] = localToWorld(cx, cy, item.tile.z, item.tile.x, item.tile.y, item.extent);
    const key = chunkOf(wx, wy, grid);
    if (!key) return null;
    const [x, y] = key.split("/").map(Number);
    return { key, x, y };
  };

  const areaM2 = (item: RawLayerItem): number => {
    const s = tileSizeMeters(item.tile.z) / item.extent;
    return ringArea(item.ring ?? []) * s * s;
  };

  const categories: CategorySpec[] = [
    {
      name: "buildings",
      prefix: "b",
      geom: "ring",
      toFeature: (item) => {
        const props = item.props;
        return {
          id: str(props.id) || str(props.gers_id),
          height_m: num(props.height),
          levels: num(props.num_floors) ?? num(props.levels),
          roof: str(props.roof_shape) || str(props["roof_shape:type"]) || undefined,
          partOf: str(props.building_id) || undefined,
        };
      },
    },
    {
      name: "roads",
      prefix: "r",
      geom: "line",
      toFeature: (item) => {
        const props = item.props;
        const rawSurface = props.road_surface ?? props.surface;
        let surface: string | undefined;
        if (Array.isArray(rawSurface)) {
          const first = rawSurface[0];
          surface = typeof first === "object" && first !== null ? str((first as { value?: unknown }).value) : str(first);
        } else {
          surface = str(rawSurface);
        }
        return { id: str(props.id), cls: str(props.class), surface: surface || undefined };
      },
      keep: (item) => ROAD_CLASSES.has(str(item.props.class)),
    },
    {
      name: "water",
      prefix: "w",
      geom: "ring",
      toFeature: (item) => ({ id: str(item.props.id), cls: str(item.props.class) || undefined }),
    },
    {
      name: "landcover",
      prefix: "l",
      geom: "ring",
      toFeature: (item) => ({
        id: str(item.props.id),
        cls: str(item.props.subtype) || str(item.props.class) || undefined,
      }),
    },
  ];

  const byKind: Record<string, RawLayerItem[]> = {
    buildings: input.buildings,
    roads: input.roads,
    water: input.water,
    landcover: input.landcover,
  };

  const catItems = categories.map((cat) => {
    const items: Array<RawLayerItem & { key: string; x: number; y: number }> = [];
    for (const item of byKind[cat.name] ?? []) {
      if (cat.geom === "ring" && !item.ring) continue;
      if (cat.geom === "line" && !item.line) continue;
      if (cat.keep && !cat.keep(item)) continue;
      if (cat.geom === "ring") {
        if (distinctPoints(item.ring ?? []) < 3) continue;
        if (cat.name === "buildings" && areaM2(item) < 4) continue;
      }
      const b = bucket(item);
      if (!b) continue;
      items.push({ ...item, ...b });
    }
    return { cat, items };
  });

  // building parts join the buildings category
  for (const item of input.buildingParts) {
    if (distinctPoints(item.ring ?? []) < 3) continue;
    if (areaM2(item) < 4) continue;
    const b = bucket(item);
    if (!b) continue;
    catItems[0]!.items.push({ ...item, ...b });
  }

  const featureCounts: Record<string, number> = {};
  const jsonFiles: Record<string, string> = {};

  for (const { cat, items } of catItems) {
    const perChunk = new Map<string, Array<RawLayerItem & { key: string }>>();
    for (const item of items) {
      if (!perChunk.has(item.key)) perChunk.set(item.key, []);
      perChunk.get(item.key)!.push(item);
    }
    const chunkRecords: unknown[] = [];
    for (const c of chunks) {
      const key = `${c.x}/${c.y}`;
      const chunkItems = perChunk.get(key) ?? [];
      const originX = round2(tileOriginX(c.x, Z15) - origin.x);
      const originY = round2(tileOriginY(c.y, Z15) - origin.y);
      const features = chunkItems.map((item, i) => {
        const g = item.ring ?? item.line ?? [];
        const localized = localize(g, item.tile.z, item.tile.x, item.tile.y, item.extent, origin);
        const extra = cat.toFeature(item);
        const featId = (extra.id as string) || `${cat.prefix}-${i}`;
        const f: Record<string, unknown> =
          cat.geom === "ring" ? { id: featId, ring: closeRing(localized) } : { id: featId, line: localized };
        if (extra.height_m !== undefined) f.height_m = extra.height_m;
        if (extra.levels !== undefined) f.levels = extra.levels;
        if (extra.roof !== undefined) f.roof = extra.roof;
        if (extra.partOf !== undefined) f.partOf = extra.partOf;
        if (extra.surface !== undefined) f.surface = extra.surface;
        if (extra.cls !== undefined) f.class = extra.cls;
        return f;
      });
      const sorted = sortByFeatureId(features as Array<{ id: string }>);
      featureCounts[cat.name] = (featureCounts[cat.name] ?? 0) + sorted.length;
      if (sorted.length) {
        chunkRecords.push({ z: Z15, x: c.x, y: c.y, originX, originY, features: sorted });
      }
    }
    jsonFiles[cat.name] = JSON.stringify({ chunks: chunkRecords }) + "\n";
  }

  const terrainChunks: unknown[] = [];
  for (const c of chunks) {
    const t = terrains.get(`${c.x}/${c.y}`);
    let heightsGrid: number[][];
    let provenance: string;
    if (t?.z15) {
      heightsGrid = resampleHeights(t.z15.heights, t.z15.w, t.z15.h);
      provenance = "z15";
    } else if (t?.z14) {
      const fx = (((c.x % 2) + 2) % 2) / 2;
      const fy = (((c.y % 2) + 2) % 2) / 2;
      heightsGrid = resampleHeightsSubExtent(t.z14.heights, t.z14.w, t.z14.h, fx, fy, 0.5);
      provenance = "z14-fallback";
    } else {
      heightsGrid = Array.from({ length: TERRAIN_GRID }, () => Array(TERRAIN_GRID).fill(0));
      provenance = "missing";
    }
    terrainChunks.push({
      z: Z15,
      x: c.x,
      y: c.y,
      originX: round2(tileOriginX(c.x, Z15) - origin.x),
      originY: round2(tileOriginY(c.y, Z15) - origin.y),
      size: TERRAIN_GRID,
      stepMeters: round2(tileSizeMeters(Z15) / (TERRAIN_GRID - 1)),
      heights: heightsGrid,
      provenance,
    });
  }
  terrainChunks.sort((a, b) => (a as { y: number }).y - (b as { y: number }).y || (a as { x: number }).x - (b as { x: number }).x);

  const manifest = {
    name: input.name,
    bbox,
    origin: { x: origin.x, y: origin.y },
    center,
    release: RELEASE,
    sources: [
      `${OVERTURE_BASE}/buildings.pmtiles`,
      `${OVERTURE_BASE}/transportation.pmtiles`,
      `${OVERTURE_BASE}/base.pmtiles`,
      TERRARIUM_PATTERN,
    ],
    chunkSize: tileSizeMeters(Z15),
    pinnedAt: PINNED_AT,
    tileCount: input.z14TileCount * 2 + input.z13TileCount + chunks.length,
    featureCounts,
  };

  return {
    manifest,
    buildings: JSON.parse(jsonFiles.buildings) as { chunks: unknown[] },
    roads: JSON.parse(jsonFiles.roads) as { chunks: unknown[] },
    water: JSON.parse(jsonFiles.water) as { chunks: unknown[] },
    landcover: JSON.parse(jsonFiles.landcover) as { chunks: unknown[] },
    terrain: JSON.parse(JSON.stringify({ chunks: terrainChunks }) + "\n") as { chunks: unknown[] },
  };
}
