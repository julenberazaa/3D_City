import { PMTiles } from "pmtiles";
import { decodeTile } from "../geo/mvt.ts";
import { decodeTerrariumPng } from "../geo/terrarium.ts";
import {
  buildFixture,
  OVERTURE_BASE,
  RELEASE,
  TERRARIUM_PATTERN,
  Z15,
  Z14,
  Z13,
  z15Grid,
  type BuildFixtureInput,
  type DecodedHeights,
  type RawLayerItem,
} from "./fixtureBuilder.ts";
import type { WorldFixture } from "../world/generator";
import { prepareFixture } from "../geo/fusion.ts";
import { ChunkCache, type CacheBackend } from "../cache/store";
import { createIndexedDbCacheBackend } from "../cache/indexedDb";

export interface LiveProgress {
  stage: "tiles" | "terrain" | "building";
  done: number;
  total: number;
}

export interface LiveLoadHandle {
  fixture: Promise<WorldFixture>;
  progress: (cb: (p: LiveProgress) => void) => void;
}

export const CACHE_BUDGET_BYTES = 200 * 1024 * 1024;

let cache: ChunkCache | null = null;

function getCache(): ChunkCache | null {
  if (typeof indexedDB === "undefined") return null;
  if (!cache) {
    const backend: CacheBackend = createIndexedDbCacheBackend();
    cache = new ChunkCache(backend, CACHE_BUDGET_BYTES);
  }
  return cache;
}

const cacheKey = (kind: string, z: number, x: number, y: number): string =>
  `${RELEASE}|${kind}|${z}/${x}/${y}`;

export function cacheStats(): { hits: number; misses: number; evicted: number; sizeBytes: number } | null {
  return cache?.statsSnapshot() ?? null;
}

async function getMvtTile(theme: string, z: number, x: number, y: number): Promise<Uint8Array | undefined> {
  const url = `${OVERTURE_BASE}/${theme}.pmtiles`;
  const key = cacheKey(`mvt:${theme}`, z, x, y);
  const c = getCache();
  if (c) {
    const hit = await c.get(key);
    if (hit) return new Uint8Array(hit);
  }
  try {
    const source = new PMTiles(url);
    const res = await source.getZxy(z, x, y);
    if (!res) return undefined;
    const bytes = new Uint8Array(res.data);
    if (c) await c.put(key, bytes.buffer as ArrayBuffer);
    return bytes;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A missing tile (data-poor area) is not a network failure: skip it.
    if (/404|not found|no tile/i.test(msg)) return undefined;
    throw new Error(`network: pmtiles fetch failed (${url}): ${msg}`, { cause: err });
  }
}

/** Decode a PNG byte buffer to RGBA in the browser (OffscreenCanvas path). */
export async function decodePngBrowser(bytes: Uint8Array): Promise<{ width: number; height: number; data: Uint8Array }> {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" });
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  return { width: img.width, height: img.height, data: new Uint8Array(img.data.buffer) };
}

async function fetchTerrain(z: number, x: number, y: number): Promise<DecodedHeights | undefined> {
  const url = TERRARIUM_PATTERN.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  const key = cacheKey("terr", z, x, y);
  const c = getCache();
  if (c) {
    const hit = await c.get(key);
    if (hit) {
      const png = await decodePngBrowser(new Uint8Array(hit));
      const heights = decodeTerrariumPng(png.width, png.height, png.data);
      return { w: png.width, h: png.height, heights };
    }
  }
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`network: terrain fetch failed (${url}): ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
  if (!res.ok) return undefined;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (c) await c.put(key, bytes.buffer as ArrayBuffer);
  const png = await decodePngBrowser(bytes);
  const heights = decodeTerrariumPng(png.width, png.height, png.data);
  return { w: png.width, h: png.height, heights };
}

async function fetchLayerFeatures(theme: string, tiles: Array<{ z: number; x: number; y: number }>, layer: string): Promise<RawLayerItem[]> {
  const out: RawLayerItem[] = [];
  for (const t of tiles) {
    const buf = await getMvtTile(theme, t.z, t.x, t.y);
    if (!buf) continue;
    const tile = decodeTile(buf);
    const l = tile.layers.get(layer);
    if (!l) continue;
    for (const f of l.features) {
      if (f.type === "Polygon") {
        if (f.geometry.length) out.push({ tile: t, extent: l.extent, ring: f.geometry[0] as number[][], props: f.properties });
      } else if (f.type === "LineString") {
        const lines = f.geometry as number[][][];
        if (!lines.length) continue;
        const longest = [...lines].sort((a, b) => b.length - a.length)[0]!;
        out.push({ tile: t, extent: l.extent, line: longest, props: f.properties });
      }
    }
  }
  return out;
}

/**
 * Load a live WorldFixture for an arbitrary bbox from the pinned open sources
 * (Overture PMTiles + Mapzen terrarium). Deterministic per release+chunk.
 */
export async function loadLiveFixture(
  bbox: [number, number, number, number],
  onProgress?: (p: LiveProgress) => void,
): Promise<WorldFixture> {
  const grid = z15Grid(bbox);
  const chunks: Array<{ z: number; x: number; y: number }> = [];
  for (let y = grid.yMin; y <= grid.yMax; y++) {
    for (let x = grid.xMin; x <= grid.xMax; x++) chunks.push({ z: Z15, x, y });
  }

  const z14Tiles = [...new Set(chunks.map((c) => `${c.x >> 1}/${c.y >> 1}`))].map((k) => {
    const [x, y] = k.split("/").map(Number);
    return { z: Z14, x, y };
  });
  const z13Tiles = [...new Set(chunks.map((c) => `${c.x >> 2}/${c.y >> 2}`))].map((k) => {
    const [x, y] = k.split("/").map(Number);
    return { z: Z13, x, y };
  });

  onProgress?.({ stage: "tiles", done: 0, total: z14Tiles.length * 2 + z13Tiles.length });
  const [buildings, buildingParts, roads, water, landcover] = await Promise.all([
    fetchLayerFeatures("buildings", z14Tiles, "building"),
    fetchLayerFeatures("buildings", z14Tiles, "building_part"),
    fetchLayerFeatures("transportation", z14Tiles, "segment"),
    fetchLayerFeatures("base", z13Tiles, "water"),
    fetchLayerFeatures("base", z13Tiles, "land_cover"),
  ]);

  const terrains = new Map<string, { z15?: DecodedHeights; z14?: DecodedHeights }>();
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    onProgress?.({ stage: "terrain", done: i, total: chunks.length });
    const z15 = await fetchTerrain(Z15, c.x, c.y);
    let z14: DecodedHeights | undefined;
    if (!z15) {
      z14 = await fetchTerrain(Z14, c.x >> 1, c.y >> 1);
    }
    terrains.set(`${c.x}/${c.y}`, { z15, z14 });
  }

  onProgress?.({ stage: "building", done: 0, total: 1 });
  const input: BuildFixtureInput = {
    name: "live",
    bbox,
    chunks,
    z14TileCount: z14Tiles.length,
    z13TileCount: z13Tiles.length,
    buildings,
    buildingParts,
    roads,
    water,
    landcover,
    terrains,
  };
  const built = buildFixture(input);
  const fixture: WorldFixture = {
    manifest: built.manifest as WorldFixture["manifest"],
    buildings: built.buildings.chunks as WorldFixture["buildings"],
    roads: built.roads.chunks as WorldFixture["roads"],
    water: built.water.chunks as WorldFixture["water"],
    landcover: built.landcover.chunks as WorldFixture["landcover"],
    terrain: built.terrain.chunks as WorldFixture["terrain"],
  };
  return prepareFixture(fixture);
}
