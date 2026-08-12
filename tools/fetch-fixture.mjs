import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PMTiles } from "pmtiles";
import { PNG } from "pngjs";
import { decodeTile } from "../src/geo/mvt.ts";
import { decodeTerrariumPng } from "../src/geo/terrarium.ts";
import {
  buildFixture,
  DEFAULT_BBOX,
  OVERTURE_BASE,
  TERRARIUM_PATTERN,
  Z15,
  Z14,
  Z13,
  z15Grid,
} from "../src/data/fixtureBuilder.ts";

const log = (...args) => console.error(...args);

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
        if (f.geometry.length) {
          let best = f.geometry[0];
          let bestArea = -1;
          for (const ring of f.geometry) {
            let a = 0;
            for (let i = 0; i < ring.length - 1; i++) {
              a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
            }
            a = Math.abs(a / 2);
            if (a > bestArea) {
              bestArea = a;
              best = ring;
            }
          }
          out.push({ tile: t, extent: l.extent, ring: best, props: f.properties });
        }
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

  const [buildingRaw, partRaw, roadRaw, waterRaw, landcoverRaw] = await Promise.all([
    fetchLayerFeatures("buildings", z14Tiles, "building"),
    fetchLayerFeatures("buildings", z14Tiles, "building_part"),
    fetchLayerFeatures("transportation", z14Tiles, "segment"),
    fetchLayerFeatures("base", z13Tiles, "water"),
    fetchLayerFeatures("base", z13Tiles, "land_cover"),
  ]);

  const terrains = new Map();
  for (const c of chunks) {
    const z15 = await fetchTerrainPng(Z15, c.x, c.y);
    let z14;
    if (!z15) {
      z14 = await fetchTerrainPng(Z14, c.x >> 1, c.y >> 1);
      if (z14) log(`  terrain z14-fallback for ${c.x}/${c.y}`);
      else log(`  terrain MISSING for ${c.x}/${c.y} (z15+z14 unavailable)`);
    }
    terrains.set(`${c.x}/${c.y}`, { z15, z14 });
  }

  const input = {
    name,
    bbox,
    chunks,
    z14TileCount: z14Tiles.length,
    z13TileCount: z13Tiles.length,
    buildings: buildingRaw,
    buildingParts: partRaw,
    roads: roadRaw,
    water: waterRaw,
    landcover: landcoverRaw,
    terrains,
  };
  const fixture = buildFixture(input);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(fixture.manifest) + "\n");
  writeFileSync(path.join(outDir, "buildings.json"), JSON.stringify(fixture.buildings) + "\n");
  writeFileSync(path.join(outDir, "roads.json"), JSON.stringify(fixture.roads) + "\n");
  writeFileSync(path.join(outDir, "water.json"), JSON.stringify(fixture.water) + "\n");
  writeFileSync(path.join(outDir, "landcover.json"), JSON.stringify(fixture.landcover) + "\n");
  writeFileSync(path.join(outDir, "terrain.json"), JSON.stringify(fixture.terrain) + "\n");

  log(`wrote fixtures/${name}/ (chunks=${chunks.length}, features=${JSON.stringify(fixture.manifest.featureCounts)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
