#!/usr/bin/env node
/**
 * fetch-fixture.mjs — download real open data once and pin deterministic fixtures.
 *
 * Usage: node tools/fetch-fixture.mjs <name> [w,s,e,n]
 * Default bbox: sf-downtown (Financial District / SoMa / Nob Hill, San Francisco).
 *
 * Outputs to fixtures/<name>/:
 *   manifest.json  — metadata (bbox, origin, sources, counts)
 *   buildings.json — building footprints + parts, local meters per z15 chunk
 *   roads.json     — transportation segments (allowed classes), per chunk
 *   water.json     — Overture base 'water' polygons, per chunk
 *   landcover.json — Overture base 'land_cover' polygons, per chunk
 *   terrain.json   — terrarium heights resampled to a 33x33 grid per chunk
 *
 * Deterministic: no timestamps/randomness, stable sorts, fixed constants.
 * Network is needed only at authoring time; reruns produce byte-identical files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PMTiles } from "pmtiles";
import { PNG } from "pngjs";
import { decodeTile } from "../src/geo/mvt.ts";
import { decodeTerrariumPng } from "../src/geo/terrarium.ts";
import {
  webMercatorX,
  webMercatorY,
  mercatorXToLon,
  mercatorYToLat,
  tileOriginX,
  tileOriginY,
  tileSizeMeters,
  worldToTileX,
  worldToTileY,
} from "../src/geo/projection.ts";

const RELEASE = "2026-07-22.0";
const PINNED_AT = "2026-07-22.0";
const OVERTURE_BASE = `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${RELEASE}`;
const TERRARIUM_PATTERN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

const Z15 = 15;
const Z14 = 14;
const Z13 = 13;
const TERRAIN_GRID = 33;

const DEFAULT_BBOX = [-122.425, 37.767, -122.396, 37.792];

const ROAD_CLASSES = new Set([
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

const round2 = (v) => Math.round(v * 100) / 100;
const round6 = (v) => Math.round(v * 1e6) / 1e6;

function log(...args) {
  console.error(...args);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Fetch helper with retries and a hard timeout. */
async function fetchWithRetry(url, retries = 3, timeoutMs = 90_000) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      return res;
    } catch (err) {
      lastErr = err;
      log(`  fetch attempt ${attempt + 1}/${retries} failed for ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

const pmtilesSources = new Map();

async function getMvtTile(theme, z, x, y) {
  const url = `${OVERTURE_BASE}/${theme}.pmtiles`;
  if (!pmtilesSources.has(url)) pmtilesSources.set(url, new PMTiles(url));
  const source = pmtilesSources.get(url);
  const res = await source.getZxy(z, x, y);
  return res ? res.data : undefined;
}

/** Bounding box -> z15 tile grid (inclusive). */
function z15Grid(bbox) {
  const [w, s, e, n] = bbox;
  const xMin = Math.floor(worldToTileX(webMercatorX(w), Z15));
  const xMax = Math.floor(worldToTileX(webMercatorX(e), Z15));
  const yMin = Math.floor(worldToTileY(webMercatorY(n), Z15));
  const yMax = Math.floor(worldToTileY(webMercatorY(s), Z15));
  return { xMin, xMax, yMin, yMax };
}

/** World mercator coords -> z15 chunk key if inside grid, else null. */
function chunkOf(x, y, grid) {
  const tx = Math.floor(worldToTileX(x, Z15));
  const ty = Math.floor(worldToTileY(y, Z15));
  if (tx < grid.xMin || tx > grid.xMax || ty < grid.yMin || ty > grid.yMax) return null;
  return `${tx}/${ty}`;
}

/** Convert tile-local points (px 0..extent) to local meters relative to origin. */
function localize(points, z, tx, ty, extent, origin) {
  const size = tileSizeMeters(z);
  const ox = tileOriginX(tx, z);
  const oy = tileOriginY(ty, z);
  return points.map(([px, py]) => {
    const x = ox + (px / extent) * size;
    const y = oy - (py / extent) * size;
    return [round2(x - origin.x), round2(y - origin.y)];
  });
}

/** Mean of points in tile-local coords (centroid proxy, sufficient for chunk bucketing). */
function pointsCentroid(points) {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
  }
  return [sx / points.length, sy / points.length];
}

/** Absolute shoelace area of a closed ring in tile-local units. */
function ringArea(points) {
  let a = 0;
  for (let i = 0; i < points.length - 1; i++) {
    a += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
  }
  return Math.abs(a / 2);
}

/** Count distinct (x,y) points in a ring. */
function distinctPoints(points) {
  const seen = new Set();
  for (const [x, y] of points) seen.add(`${x},${y}`);
  return seen.size;
}

/** Ensure a closed ring (last point == first) after rounding. */
function closeRing(ring) {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([first[0], first[1]]);
  return ring;
}

/** Stable sort by id string. */
function sortByFeatureId(features) {
  return [...features].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function str(v) {
  return v === undefined || v === null ? "" : String(v);
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function bilinearSample(data, w, h, u, v) {
  const x = Math.max(0, Math.min(w - 1, u));
  const y = Math.max(0, Math.min(h - 1, v));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = data[y0 * w + x0];
  const b = data[y0 * w + x1];
  const c = data[y1 * w + x0];
  const d = data[y1 * w + x1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/** Resample a w*h Float32Array height field to a TERRAIN_GRID^2 grid of rounded meters. */
function resampleHeights(data, w, h) {
  const step = (w - 1) / (TERRAIN_GRID - 1);
  const out = [];
  for (let j = 0; j < TERRAIN_GRID; j++) {
    const row = [];
    for (let i = 0; i < TERRAIN_GRID; i++) {
      row.push(round2(bilinearSample(data, w, h, i * step, j * step)));
    }
    out.push(row);
  }
  return out;
}

/** Download + decode a terrarium PNG; undefined if missing or undecodable. */
async function fetchTerrainPng(z, x, y) {
  const url = TERRARIUM_PATTERN.replace("{z}", z).replace("{x}", x).replace("{y}", y);
  const res = await fetchWithRetry(url, 2, 60_000);
  if (res.status !== 200) return undefined;
  const buf = Buffer.from(await res.arrayBuffer());
  let png;
  try {
    png = PNG.sync.read(buf);
  } catch {
    return undefined;
  }
  const heights = decodeTerrariumPng(png.width, png.height, png.data);
  return { w: png.width, h: png.height, heights };
}

/** World coords of a tile-local point. */
function localToWorld(px, py, z, tx, ty, extent) {
  const size = tileSizeMeters(z);
  return [tileOriginX(tx, z) + (px / extent) * size, tileOriginY(ty, z) - (py / extent) * size];
}

/** Download + decode one MVT layer across a set of tiles. */
async function fetchLayerFeatures(theme, tiles, layer) {
  const out = [];
  for (const t of tiles) {
    const buf = await getMvtTile(theme, t.z, t.x, t.y);
    if (!buf) {
      log(`  missing tile: ${theme} ${t.z}/${t.x}/${t.y} (skipped)`);
      continue;
    }
    const tile = decodeTile(buf);
    const l = tile.layers.get(layer);
    if (!l) {
      log(`  no layer '${layer}' in ${theme} ${t.z}/${t.x}/${t.y}`);
      continue;
    }
    for (const f of l.features) {
      if (f.type === "Polygon") {
        if (f.geometry.length) out.push({ tile: t, extent: l.extent, ring: f.geometry[0], props: f.properties });
      } else if (f.type === "LineString") {
        const lines = f.geometry;
        if (!lines.length) continue;
        const longest = [...lines].sort((a, b) => b.length - a.length)[0];
        out.push({ tile: t, extent: l.extent, line: longest, props: f.properties });
      }
    }
  }
  return out;
}

async function main() {
  const name = process.argv[2];
  if (!name) {
    log("usage: node tools/fetch-fixture.mjs <name> [w,s,e,n]");
    process.exit(1);
  }
  let bbox = DEFAULT_BBOX;
  if (process.argv[3]) {
    bbox = process.argv[3].split(",").map(Number);
    assert(bbox.length === 4 && bbox.every(Number.isFinite), "bbox must be w,s,e,n");
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.join(here, "..", "fixtures", name);

  const origin = {
    x: round2((webMercatorX(bbox[0]) + webMercatorX(bbox[2])) / 2),
    y: round2((webMercatorY(bbox[3]) + webMercatorY(bbox[1])) / 2),
  };
  const center = {
    lat: round6(mercatorYToLat(origin.y)),
    lon: round6(mercatorXToLon(origin.x)),
  };
  const grid = z15Grid(bbox);
  log(`name=${name} bbox=${bbox.join(",")} grid x:${grid.xMin}..${grid.xMax} y:${grid.yMin}..${grid.yMax}`);

  const chunks = [];
  for (let y = grid.yMin; y <= grid.yMax; y++) {
    for (let x = grid.xMin; x <= grid.xMax; x++) chunks.push({ z: Z15, x, y });
  }

  const z14Keys = [...new Set(chunks.map((c) => `${c.x >> 1}/${c.y >> 1}`))];
  const z14Tiles = z14Keys.map((k) => {
    const [x, y] = k.split("/").map(Number);
    return { z: Z14, x, y };
  });
  const z13Keys = [...new Set(chunks.map((c) => `${c.x >> 2}/${c.y >> 2}`))];
  const z13Tiles = z13Keys.map((k) => {
    const [x, y] = k.split("/").map(Number);
    return { z: Z13, x, y };
  });

  log(`tiles: ${z14Tiles.length} z14 (buildings+transportation), ${z13Tiles.length} z13 (base), ${chunks.length} terrain`);

  const buildingRaw = await fetchLayerFeatures("buildings", z14Tiles, "building");
  const partRaw = await fetchLayerFeatures("buildings", z14Tiles, "building_part");
  const roadRaw = await fetchLayerFeatures("transportation", z14Tiles, "segment");
  const waterRaw = await fetchLayerFeatures("base", z13Tiles, "water");
  const landcoverRaw = await fetchLayerFeatures("base", z13Tiles, "land_cover");

  /** Bucket a feature by its centroid into a z15 chunk; skip if outside grid. Returns {key, chunk} or null. */
  function bucket(item) {
    const points = item.ring ?? item.line;
    const [cx, cy] = pointsCentroid(points);
    const [wx, wy] = localToWorld(cx, cy, item.tile.z, item.tile.x, item.tile.y, item.extent);
    const key = chunkOf(wx, wy, grid);
    if (!key) return null;
    const [x, y] = key.split("/").map(Number);
    return { key, x, y };
  }

  function areaM2(item) {
    const s = tileSizeMeters(item.tile.z) / item.extent;
    return ringArea(item.ring) * s * s;
  }

  const categories = [
    {
      name: "buildings",
      prefix: "b",
      geom: "ring",
      items: [],
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
      items: [],
      toFeature: (item) => {
        const props = item.props;
        const rawSurface = props.road_surface ?? props.surface;
        let surface;
        if (Array.isArray(rawSurface)) {
          const first = rawSurface[0];
          surface = typeof first === "object" && first !== null ? str(first.value) : str(first);
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
      items: [],
      toFeature: (item) => ({ id: str(item.props.id), cls: str(item.props.class) || undefined }),
    },
    {
      name: "landcover",
      prefix: "l",
      geom: "ring",
      items: [],
      toFeature: (item) => ({
        id: str(item.props.id),
        cls: str(item.props.subtype) || str(item.props.class) || undefined,
      }),
    },
  ];

  const byKind = {
    buildings: buildingRaw,
    roads: roadRaw,
    water: waterRaw,
    landcover: landcoverRaw,
  };
  for (const cat of categories) {
    for (const item of byKind[cat.name]) {
      if (cat.geom === "ring" && !item.ring) continue;
      if (cat.geom === "line" && !item.line) continue;
      if (cat.keep && !cat.keep(item)) continue;
      if (cat.geom === "ring") {
        if (distinctPoints(item.ring) < 3) continue;
        if (cat.name === "buildings" && areaM2(item) < 4) continue;
      }
      const b = bucket(item);
      if (!b) continue;
      cat.items.push({ ...item, ...b });
    }
  }
  // building parts join the buildings category
  for (const item of partRaw) {
    if (distinctPoints(item.ring) < 3) continue;
    if (areaM2(item) < 4) continue;
    const b = bucket(item);
    if (!b) continue;
    categories[0].items.push({ ...item, ...b });
  }

  const featureCounts = {};
  const jsonFiles = {};

  for (const cat of categories) {
    const perChunk = new Map();
    for (const item of cat.items) {
      if (!perChunk.has(item.key)) perChunk.set(item.key, []);
      perChunk.get(item.key).push(item);
    }
    const chunkRecords = [];
    for (const c of chunks) {
      const key = `${c.x}/${c.y}`;
      const items = perChunk.get(key) ?? [];
      const originX = round2(tileOriginX(c.x, Z15) - origin.x);
      const originY = round2(tileOriginY(c.y, Z15) - origin.y);
      const features = items.map((item, i) => {
        const g = item.ring ?? item.line;
        const localized = localize(g, item.tile.z, item.tile.x, item.tile.y, item.extent, origin);
        const extra = cat.toFeature(item);
        const featId = extra.id || `${cat.prefix}-${i}`;
        const f = cat.geom === "ring" ? { id: featId, ring: closeRing(localized) } : { id: featId, line: localized };
        if (extra.height_m !== undefined) f.height_m = extra.height_m;
        if (extra.levels !== undefined) f.levels = extra.levels;
        if (extra.roof !== undefined) f.roof = extra.roof;
        if (extra.partOf !== undefined) f.partOf = extra.partOf;
        if (extra.surface !== undefined) f.surface = extra.surface;
        if (extra.cls !== undefined) f.class = extra.cls;
        return f;
      });
      const sorted = sortByFeatureId(features);
      featureCounts[cat.name] = (featureCounts[cat.name] ?? 0) + sorted.length;
      if (sorted.length) {
        chunkRecords.push({ z: Z15, x: c.x, y: c.y, originX, originY, features: sorted });
      }
    }
    jsonFiles[cat.name] = JSON.stringify({ chunks: chunkRecords }) + "\n";
    log(`${cat.name}: ${featureCounts[cat.name]} features in ${chunkRecords.length} chunks`);
  }

  const terrainChunks = [];
  for (const c of chunks) {
    const z15 = await fetchTerrainPng(Z15, c.x, c.y);
    let heightsGrid;
    let provenance;
    if (z15) {
      heightsGrid = resampleHeights(z15.heights, z15.w, z15.h);
      provenance = "z15";
    } else {
      const parent = await fetchTerrainPng(Z14, c.x >> 1, c.y >> 1);
      if (parent) {
        heightsGrid = resampleHeights(parent.heights, parent.w, parent.h);
        provenance = "z14-fallback";
        log(`  terrain z14-fallback for ${c.x}/${c.y}`);
      } else {
        heightsGrid = Array.from({ length: TERRAIN_GRID }, () => Array(TERRAIN_GRID).fill(0));
        provenance = "missing";
        log(`  terrain MISSING for ${c.x}/${c.y} (z15+z14 unavailable)`);
      }
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
  terrainChunks.sort((a, b) => a.y - b.y || a.x - b.x);

  const manifest = {
    name,
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
    tileCount: z14Tiles.length * 2 + z13Tiles.length + chunks.length,
    featureCounts,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest) + "\n");
  writeFileSync(path.join(outDir, "buildings.json"), jsonFiles.buildings);
  writeFileSync(path.join(outDir, "roads.json"), jsonFiles.roads);
  writeFileSync(path.join(outDir, "water.json"), jsonFiles.water);
  writeFileSync(path.join(outDir, "landcover.json"), jsonFiles.landcover);
  writeFileSync(path.join(outDir, "terrain.json"), JSON.stringify({ chunks: terrainChunks }) + "\n");

  log(`wrote fixtures/${name}/ (chunks=${chunks.length}, features=${JSON.stringify(featureCounts)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
