import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixtureDir = fileURLToPath(new URL("../../fixtures/sf-downtown", import.meta.url));

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(`${fixtureDir}/${file}`, "utf8")) as T;
}

interface RingFeature {
  id: string;
  ring: number[][];
  height_m?: number;
  levels?: number;
  partOf?: string;
}

interface ChunkFile {
  chunks: Array<{ z: number; x: number; y: number; features: RingFeature[] }>;
}

interface TerrainChunk {
  z: number;
  x: number;
  y: number;
  size: number;
  stepMeters: number;
  heights: number[][];
  provenance: string;
}

interface TerrainFile {
  chunks: TerrainChunk[];
}

const manifest = loadJson("manifest.json") as {
  name: string;
  bbox: number[];
  origin: { x: number; y: number };
  center: { lat: number; lon: number };
  release: string;
  sources: string[];
  chunkSize: number;
  pinnedAt: string;
  featureCounts: Record<string, number>;
};

const buildings = loadJson("buildings.json") as ChunkFile;
const roads = loadJson("roads.json") as ChunkFile;
const water = loadJson("water.json") as ChunkFile;
const landcover = loadJson("landcover.json") as ChunkFile;
const terrain = loadJson("terrain.json") as TerrainFile;

const countFeatures = (file: ChunkFile): number => file.chunks.reduce((sum, c) => sum + c.features.length, 0);

describe("gate 08: sf-downtown fixture (pinned data)", () => {
  it("is pinned to the Overture release 2026-07-22.0", () => {
    expect(manifest.name).toBe("sf-downtown");
    expect(manifest.release).toBe("2026-07-22.0");
    expect(manifest.pinnedAt).toBe("2026-07-22.0");
    expect(manifest.bbox).toEqual([-122.425, 37.767, -122.396, 37.792]);
    expect(manifest.sources.length).toBe(4);
  });

  it("has enough buildings (>= 400) and roads (>= 150)", () => {
    expect(countFeatures(buildings)).toBeGreaterThanOrEqual(400);
    expect(countFeatures(roads)).toBeGreaterThanOrEqual(150);
  });

  it("has terrain chunks with finite, plausible heights", () => {
    expect(terrain.chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of terrain.chunks) {
      expect(chunk.heights.length).toBe(33);
      for (const row of chunk.heights) {
        expect(row.length).toBe(33);
        for (const h of row) {
          expect(Number.isFinite(h)).toBe(true);
          // min: -30 allows the real San Francisco Bay floor (-21.04 m observed in the
          // eastern bay-edge chunks); max: 400 well above Nob Hill (~100 m).
          expect(h).toBeGreaterThanOrEqual(-30);
          expect(h).toBeLessThanOrEqual(400);
        }
      }
      expect(chunk.provenance === "z15" || chunk.provenance === "z14-fallback" || chunk.provenance === "missing").toBe(true);
    }
  });

  it("has buildings with ids and closed rings of at least 4 points", () => {
    const all = buildings.chunks.flatMap((c) => c.features);
    expect(all.length).toBeGreaterThanOrEqual(400);
    for (const f of all) {
      expect(typeof f.id).toBe("string");
      expect(f.id.length).toBeGreaterThan(0);
      expect(f.ring.length).toBeGreaterThanOrEqual(4);
      const first = f.ring[0];
      const last = f.ring[f.ring.length - 1];
      expect(first).toEqual(last);
    }
  });

  it("has height or levels on at least 40% of buildings", () => {
    const all = buildings.chunks.flatMap((c) => c.features);
    const withHeight = all.filter((f) => f.height_m !== undefined || f.levels !== undefined);
    expect(withHeight.length / all.length).toBeGreaterThanOrEqual(0.4);
  });

  it("has at least one water or landcover polygon", () => {
    const total = countFeatures(water) + countFeatures(landcover);
    expect(total).toBeGreaterThanOrEqual(1);
  });
});
