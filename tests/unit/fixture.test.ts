import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readFixture } from "./fixture-helper";
import { buildChunkGroup, WATER_LEVEL } from "../../src/world/generator";

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

  it("bridge rule: no road vertex over water is below the water surface", () => {
    const fixture = readFixture("sf-downtown");
    const waterRings: number[][][] = [];
    for (const c of fixture.water) {
      for (const f of c.features) {
        if (!f.ring || f.ring.length < 3) continue;
        waterRings.push(f.ring);
      }
    }
    const pointInRing = (px: number, pz: number, ring: number[][]): boolean => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i]![0];
        const zi = ring[i]![1];
        const xj = ring[j]![0];
        const zj = ring[j]![1];
        if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    };
    let roadVertsOverWater = 0;
    let belowSurface = 0;
    for (const c of fixture.buildings) {
      const group = buildChunkGroup(fixture, 15, c.x, c.y).group;
      group.traverse((o) => {
        const m = o as { isMesh?: boolean; geometry?: { attributes?: Record<string, { array?: Float32Array }> } };
        if (!m.isMesh || !m.geometry?.attributes?.position) return;
        const pos = m.geometry.attributes.position!.array!;
        const col = m.geometry.attributes.color?.array;
        if (!col) return;
        for (let i = 0; i < pos.length; i += 3) {
          const r = col[i];
          if (Math.abs(r - 0.32) > 0.05) continue;
          const x = pos[i];
          const z = pos[i + 2];
          if (waterRings.some((ring) => pointInRing(x, z, ring))) {
            roadVertsOverWater++;
            if (pos[i + 1] < WATER_LEVEL - 0.01) belowSurface++;
          }
        }
      });
    }
    expect(roadVertsOverWater).toBeGreaterThan(0);
    expect(belowSurface).toBe(0);
  });
});
