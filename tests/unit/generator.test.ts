import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  buildWorld,
  fnv1a,
  type ChunkRecord,
  type ChunkTerrain,
  type FixtureFeature,
  type WorldFixture,
  type WorldModel,
} from "../../src/world/generator";

const fixtureDir = fileURLToPath(new URL("../../fixtures/sf-downtown", import.meta.url));

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(`${fixtureDir}/${file}`, "utf8")) as T;
}

function loadFixture(): WorldFixture {
  const manifest = loadJson<WorldFixture["manifest"]>("manifest.json");
  const terrain = loadJson<{ chunks: ChunkTerrain[] }>("terrain.json");
  const chunkFile = (file: string) => loadJson<{ chunks: ChunkRecord[] }>(file).chunks;
  return {
    manifest,
    buildings: chunkFile("buildings.json"),
    roads: chunkFile("roads.json"),
    water: chunkFile("water.json"),
    landcover: chunkFile("landcover.json"),
    terrain: terrain.chunks,
  };
}

interface MeshSnapshot {
  triangles: number;
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

function snapshotGeometry(world: WorldModel, kinds: ("buildings" | "terrain" | "roads")[]): Record<string, MeshSnapshot> {
  const out: Record<string, MeshSnapshot> = {};
  for (const kind of kinds) {
    for (const [key, group] of world.groups[kind]) {
      const mesh = group.children[0] as THREE.Mesh;
      const positions = mesh.geometry.getAttribute("position").array as Float32Array;
      const colors = (mesh.geometry.getAttribute("color")?.array ?? new Float32Array(0)) as Float32Array;
      const indices = (mesh.geometry.index?.array ?? new Uint32Array(0)) as Uint32Array;
      out[`${kind}:${key}`] = {
        triangles: indices.length / 3,
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        indices: new Uint32Array(indices),
      };
    }
  }
  return out;
}

const triangleTotals = (world: WorldModel): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const kind of Object.keys(world.groups) as (keyof WorldModel["groups"])[]) {
    let total = 0;
    for (const [, group] of world.groups[kind]) {
      const mesh = group.children[0] as THREE.Mesh;
      total += (mesh.geometry.index?.count ?? 0) / 3;
    }
    out[kind] = total;
  }
  return out;
};

describe("gate 09/13: world generator determinism", () => {
  it("FNV-1a matches the published 32-bit constants", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("abc")).toBe(0x1a47e90b);
  });

  it("buildWorld twice produces identical geometry (positions, colors, indices, triangle counts per chunk)", () => {
    const fixture = loadFixture();
    const a = buildWorld(fixture);
    const b = buildWorld(fixture);
    const sa = snapshotGeometry(a, ["buildings", "terrain", "roads"]);
    const sb = snapshotGeometry(b, ["buildings", "terrain", "roads"]);
    expect(Object.keys(sa).sort()).toEqual(Object.keys(sb).sort());
    for (const key of Object.keys(sa)) {
      expect(sa[key].triangles).toBe(sb[key].triangles);
      expect(Array.from(sa[key].positions)).toEqual(Array.from(sb[key].positions));
      expect(Array.from(sa[key].colors)).toEqual(Array.from(sb[key].colors));
      expect(Array.from(sa[key].indices)).toEqual(Array.from(sb[key].indices));
    }
    expect(triangleTotals(a)).toEqual(triangleTotals(b));
  });
});

describe("gate 09: generator sanity", () => {
  const fixture = loadFixture();
  const world = buildWorld(fixture);
  const allBuildings = fixture.buildings.flatMap((c) => c.features);
  const parentBuildings = allBuildings.filter((f) => !f.partOf);

  it("counts.buildings equals the number of parent building features", () => {
    expect(world.counts.buildings).toBe(parentBuildings.length);
  });

  it("terrain vertex count is chunks * 33 * 33", () => {
    let vertices = 0;
    for (const [, group] of world.groups.terrain) {
      const mesh = group.children[0] as THREE.Mesh;
      vertices += mesh.geometry.getAttribute("position").count;
    }
    expect(vertices).toBe(fixture.terrain.length * 33 * 33);
  });

  it("building vertex heights sit on terrain with plausible tops", () => {
    let minTerrain = Infinity;
    let maxTerrain = -Infinity;
    for (const c of fixture.terrain) {
      for (const row of c.heights) {
        for (const h of row) {
          minTerrain = Math.min(minTerrain, h);
          maxTerrain = Math.max(maxTerrain, h);
        }
      }
    }
    let maxAttrHeight = 0;
    for (const f of allBuildings) {
      maxAttrHeight = Math.max(maxAttrHeight, f.height_m ?? (f.levels ?? 0) * 3);
    }
    const maxTop = maxTerrain + Math.max(maxAttrHeight, 14) + 10;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, group] of world.groups.buildings) {
      const mesh = group.children[0] as THREE.Mesh;
      const positions = mesh.geometry.getAttribute("position").array as Float32Array;
      for (let i = 1; i < positions.length; i += 3) {
        minY = Math.min(minY, positions[i]);
        maxY = Math.max(maxY, positions[i]);
      }
    }
    expect(minY).toBeGreaterThanOrEqual(minTerrain - 1);
    expect(maxY).toBeLessThanOrEqual(maxTop);
  });

  it("counts and provenance are consistent with the effective attrs (parts resolve before classify)", () => {
    // Mirror resolveBuilding: a building_part's height_m/levels override the parent's, and
    // provenance follows the attribute actually used (part-provided observed height => OBSERVED).
    const expected = { observed: 0, derived: 0, inferred: 0 };
    for (const chunk of fixture.buildings) {
      const parts = new Map<string, FixtureFeature[]>();
      const parents: FixtureFeature[] = [];
      for (const f of chunk.features) {
        if (f.partOf) {
          const list = parts.get(f.partOf) ?? [];
          list.push(f);
          parts.set(f.partOf, list);
        } else {
          parents.push(f);
        }
      }
      for (const f of parents) {
        const part = (parts.get(f.id) ?? [])[0];
        const heightAttr = part ? part.height_m ?? f.height_m : f.height_m;
        const levels = part ? part.levels ?? f.levels : f.levels;
        if (heightAttr !== undefined) expected.observed++;
        else if (levels !== undefined) expected.derived++;
        else expected.inferred++;
      }
    }
    expect(world.provenance).toEqual(expected);
    expect(world.counts.buildings).toBe(expected.observed + expected.derived + expected.inferred);
  });

  it("bounds cover all terrain chunks", () => {
    for (const c of fixture.terrain) {
      const span = (c.size - 1) * c.stepMeters;
      expect(c.originX).toBeGreaterThanOrEqual(world.bounds.minX);
      expect(c.originY - span).toBeGreaterThanOrEqual(world.bounds.minY);
      expect(c.originX + span).toBeLessThanOrEqual(world.bounds.maxX);
      expect(c.originY).toBeLessThanOrEqual(world.bounds.maxY);
    }
  });

  it("all flat ground geometry faces up (no downward normals under FrontSide culling)", () => {
    // Geometric normal of tri(a,b,c): (b-a) x (c-a); y-component positive = facing up.
    for (const kind of ["terrain", "roads", "water", "landcover"] as const) {
      for (const [, group] of world.groups[kind]) {
        const mesh = group.children[0] as THREE.Mesh;
        const positions = mesh.geometry.getAttribute("position").array as Float32Array;
        const indices = mesh.geometry.index?.array as Uint32Array;
        for (let t = 0; t < indices.length; t += 3) {
          const a = indices[t] * 3;
          const b = indices[t + 1] * 3;
          const c = indices[t + 2] * 3;
          const ny =
            (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a]) -
            (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]);
          expect(ny).toBeGreaterThanOrEqual(-1e-4);
        }
      }
    }
  });

  it("counts match rendered geometry when tiny rings are filtered out", () => {
    const bigRing: number[][] = [
      [0, 0],
      [0, 100],
      [100, 100],
      [100, 0],
      [0, 0],
    ];
    const tinyRing: number[][] = [
      [0, 0],
      [0, 0.2],
      [0.2, 0.2],
      [0.2, 0],
      [0, 0],
    ];
    const chunk: ChunkRecord = {
      z: 15,
      x: 0,
      y: 0,
      originX: 0,
      originY: 0,
      features: [
        { id: "water-big", ring: bigRing },
        { id: "water-tiny", ring: tinyRing },
      ],
    };
    const lcChunk: ChunkRecord = {
      ...chunk,
      features: [
        { id: "lc-big", ring: bigRing, class: "grass" },
        { id: "lc-tiny", ring: tinyRing, class: "grass" },
      ],
    };
    const terrain: ChunkTerrain = {
      z: 15,
      x: 0,
      y: 0,
      originX: 0,
      originY: 0,
      size: 2,
      stepMeters: 100,
      heights: [
        [0, 0],
        [0, 0],
      ],
    };
    const tiny = buildWorld({
      manifest: { name: "tiny", bbox: [], origin: { x: 0, y: 0 }, chunkSize: 100 },
      buildings: [],
      roads: [],
      water: [chunk],
      landcover: [lcChunk],
      terrain: [terrain],
    });
    expect(tiny.counts.waterPolys).toBe(1);
    expect(tiny.counts.landcover).toBe(1);
    const waterMesh = tiny.groups.water.get("15-0-0")?.children[0] as THREE.Mesh;
    const lcMesh = tiny.groups.landcover.get("15-0-0")?.children[0] as THREE.Mesh;
    expect((waterMesh.geometry.index?.count ?? 0) / 3).toBe(2);
    expect((lcMesh.geometry.index?.count ?? 0) / 3).toBe(2);
  });
});
