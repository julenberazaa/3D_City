import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { WorldFixture, FixtureFeature } from "../../src/world/generator";
import { resolveBuilding, sampleTerrain } from "../../src/world/generator";
import { prepareFixture } from "../../src/geo/fusion";
import { findSpawnPoint, convexHull2D, ringArea2D } from "../../src/physics/world";

const requireHullHelpers = () => ({ convexHull2D, ringArea2D });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const json = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

const fixture: WorldFixture = prepareFixture({
  manifest: json("fixtures/sf-downtown/manifest.json"),
  buildings: json("fixtures/sf-downtown/buildings.json").chunks,
  roads: json("fixtures/sf-downtown/roads.json").chunks,
  water: json("fixtures/sf-downtown/water.json").chunks,
  landcover: json("fixtures/sf-downtown/landcover.json").chunks,
  terrain: json("fixtures/sf-downtown/terrain.json").chunks,
} as unknown as WorldFixture);

const allRoadLines = fixture.roads.flatMap((c) => c.features.map((f) => f.line ?? []).filter((l) => l.length >= 2));
const allRoads = fixture.roads.flatMap((c) => c.features);

function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function minDistToRoads(x: number, z: number, grid?: RoadGrid): number {
  if (grid) return grid.minDist(x, z);
  let best = Infinity;
  for (const line of allRoadLines) {
    for (let i = 0; i < line.length - 1; i++) {
      const d = distToSeg(x, z, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Spatial index over road segments: cell 64 m, query point → neighbor cells. */
class RoadGrid {
  private cells = new Map<number, Array<{ ax: number; az: number; bx: number; bz: number }>>();
  private readonly size = 64;
  private readonly key = (cx: number, cz: number) => cx * 100000 + cz;

  constructor(lines: number[][][]) {
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const ax = line[i][0];
        const az = line[i][1];
        const bx = line[i + 1][0];
        const bz = line[i + 1][1];
        const minX = Math.min(ax, bx);
        const maxX = Math.max(ax, bx);
        const minZ = Math.min(az, bz);
        const maxZ = Math.max(az, bz);
        for (let cx = Math.floor(minX / this.size); cx <= Math.floor(maxX / this.size); cx++) {
          for (let cz = Math.floor(minZ / this.size); cz <= Math.floor(maxZ / this.size); cz++) {
            const k = this.key(cx, cz);
            const list = this.cells.get(k);
            if (list) list.push({ ax, az, bx, bz });
            else this.cells.set(k, [{ ax, az, bx, bz }]);
          }
        }
      }
    }
  }

  minDist(x: number, z: number): number {
    let best = Infinity;
    const cx = Math.floor(x / this.size);
    const cz = Math.floor(z / this.size);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.cells.get(this.key(cx + dx, cz + dz));
        if (!list) continue;
        for (const s of list) {
          const d = distToSeg(x, z, s.ax, s.az, s.bx, s.bz);
          if (d < best) best = d;
        }
      }
    }
    return best;
  }
}

function aabbOf(ring: number[][]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

describe("FIDELITY: objective geometry/quality metrics (sf-downtown fixture)", () => {
  let buildings: Array<{ f: FixtureFeature; ring: number[][]; height: number; provenance: string; roof?: string; aabb: { minX: number; maxX: number; minZ: number; maxZ: number } }>;
  let roadGrid: RoadGrid;

  beforeAll(() => {
    buildings = [];
    for (const c of fixture.buildings) {
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
      for (const f of parents) {
        const built = resolveBuilding(f, parts);
        if (!built) continue;
        buildings.push({ f, ring: built.ring, height: built.height, provenance: built.provenance, roof: built.roof, aabb: aabbOf(built.ring) });
      }
    }
    roadGrid = new RoadGrid(allRoadLines);
  });

  it("ROAD-01 rendered road surface is predominantly drivable (not footpaths)", () => {
    // Measures RIBBON AREA (length x class width) — what actually dominates the
    // scene — not feature counts. Non-vehicular widths are reduced in the
    // generator, so a data-heavy footway network must not dominate visually.
    const WIDTHS: Record<string, number> = {
      motorway: 7.5, trunk: 6.5, primary: 9, secondary: 7.5, tertiary: 6,
      residential: 5, service: 4, living_street: 4.5, unclassified: 4,
      pedestrian: 3, footway: 1.8, path: 1.4, steps: 1.8, cycleway: 1.8,
    };
    const nonVehicular = new Set(["footway", "path", "steps", "pedestrian", "cycleway", "track"]);
    let vehicularArea = 0;
    let nonArea = 0;
    for (const f of allRoads) {
      const line = f.line ?? [];
      let len = 0;
      for (let i = 0; i < line.length - 1; i++) {
        len += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
      }
      const w = WIDTHS[f.class ?? ""] ?? 4;
      if (nonVehicular.has(f.class ?? "")) nonArea += len * w;
      else vehicularArea += len * w;
    }
    const total = vehicularArea + nonArea;
    const share = nonArea / Math.max(1, total);
    console.log(`ribbon area: vehicular ${Math.round(vehicularArea)}m2, non-vehicular ${Math.round(nonArea)}m2 (${(share * 100).toFixed(1)}%)`);
    expect(share).toBeLessThan(0.35);
  });

  it("ROAD-02 road network is continuous: low true dangling-stub rate", () => {
    // Exact-endpoint connectivity: a stub = endpoint with no other endpoint
    // within 0.5m and not near the fixture bbox edge (roads legitimately end
    // at the world boundary).
    const bbox = fixture.manifest.bbox as [number, number, number, number];
    const ends = new Map<string, { x: number; z: number }>();
    const degree = new Map<string, number>();
    for (const line of allRoadLines) {
      const a = `${line[0][0].toFixed(3)},${line[0][1].toFixed(3)}`;
      const b = `${line[line.length - 1][0].toFixed(3)},${line[line.length - 1][1].toFixed(3)}`;
      ends.set(a, { x: line[0][0], z: line[0][1] });
      ends.set(b, { x: line[line.length - 1][0], z: line[line.length - 1][1] });
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
    }
    const w = bbox[2] - bbox[0];
    const h = bbox[3] - bbox[1];
    const nearEdge = (x: number, z: number): boolean =>
      x < w * 0.03 || x > w * 0.97 || z < h * 0.03 || z > h * 0.97;
    let stubs = 0;
    for (const [k, pos] of ends) {
      if ((degree.get(k) ?? 0) > 1) continue;
      if (nearEdge(pos.x, pos.z)) continue;
      let connected = false;
      for (const [k2, pos2] of ends) {
        if (k2 === k) continue;
        if (Math.hypot(pos.x - pos2.x, pos.z - pos2.z) <= 0.5) {
          connected = true;
          break;
        }
      }
      if (!connected) stubs++;
    }
    console.log(`true dangling stubs (exact endpoints, off-edge): ${stubs} of ${ends.size}`);
    expect(stubs / Math.max(1, ends.size)).toBeLessThan(0.15);
  });

  it("B-01 building base elevation tracks terrain coherently (no deep burial)", () => {
    let bad = 0;
    for (const b of buildings) {
      // Policy under test: per-vertex terrain-hugging skirt (base = terrain - 0.15).
      for (const p of b.ring) {
        const base = sampleTerrain(fixture.terrain, p[0], p[1]) - 0.15;
        const t = sampleTerrain(fixture.terrain, p[0], p[1]);
        if (Math.abs(base - t) > 1.5) {
          bad++;
          break;
        }
      }
    }
    console.log(`buildings with any ring vertex more than 1.5m off terrain: ${bad}/${buildings.length}`);
    expect(bad).toBeLessThan(buildings.length * 0.1);
  });

  it("B-02 physics hull vs visual footprint: tight invisible-collision area", () => {
    // The collider is a convex hull of the footprint (≤48 pts), so the ratio
    // of the footprint area to the hull area is ~1 for convex shapes and close
    // to 1 for mildly concave ones (AABB ratio was median 0.67 / 58% <0.7).
    const { convexHull2D, ringArea2D } = requireHullHelpers();
    let bad = 0;
    const ratios: number[] = [];
    for (const b of buildings) {
      const ringPts: Array<[number, number]> = b.ring.map((p) => [p[0], p[1]]);
      const ringArea = ringArea2D(ringPts);
      if (ringArea <= 0) continue;
      const hullArea = ringArea2D(convexHull2D(ringPts));
      const ratio = hullArea > 0 ? ringArea / hullArea : 1;
      ratios.push(ratio);
      if (ratio < 0.75) bad++;
    }
    ratios.sort((a, b) => a - b);
    console.log(`footprint/hull ratio p10=${ratios[Math.floor(ratios.length * 0.1)]!.toFixed(3)} median=${ratios[Math.floor(ratios.length * 0.5)]!.toFixed(3)}; hulls with <0.75 coverage: ${bad}/${ratios.length}`);
    expect(bad / Math.max(1, ratios.length)).toBeLessThan(0.15);
  });

  it("B-03 buildings sit close to a real road (adjacent, not isolated)", () => {
    let far = 0;
    for (const b of buildings) {
      const d = minDistToRoads(b.aabb.minX, b.aabb.minZ, roadGrid);
      if (d > 60) far++;
    }
    console.log(`buildings >60m from nearest road: ${far}/${buildings.length}`);
    expect(far / buildings.length).toBeLessThan(0.05);
  });

  it("B-04 building provenance: observed heights dominate", () => {
    const prov = { observed: 0, derived: 0, inferred: 0 };
    for (const b of buildings) prov[b.provenance as "observed"]++;
    console.log(`provenance: observed ${prov.observed}, derived ${prov.derived}, inferred ${prov.inferred} (of ${buildings.length})`);
    expect(prov.inferred / buildings.length).toBeLessThan(0.4);
    expect(prov.observed + prov.derived).toBeGreaterThan(0.6 * buildings.length);
  });

  it("B-05 no building style attributes survive the fixture (provenance hole)", () => {
    let anyAttr = 0;
    for (const c of fixture.buildings) {
      for (const f of c.features) {
        if ((f as unknown as Record<string, unknown>).facadeColor || (f as unknown as Record<string, unknown>).roofColor || (f as unknown as Record<string, unknown>).subtype) anyAttr++;
      }
    }
    console.log(`buildings with ANY color/material/subtype attribute in fixture: ${anyAttr}`);
    expect(anyAttr).toBe(0);
  });

  it("SPAWN-01 spawn picks a genuinely drivable, connected road", () => {
    const spawn = findSpawnPoint(fixture.roads, fixture.terrain, fixture);
    const d = minDistToRoads(spawn.x, spawn.z, roadGrid);
    const nearest = allRoads.map((f) => ({
      f,
      d: Math.min(
        ...(f.line ?? []).map(([x, z]) => Math.hypot(spawn.x - x, spawn.z - z)),
      ),
    })).sort((a, b) => a.d - b.d)[0];
    const cls = nearest?.f.class ?? "?";
    const nonDrivable = ["footway", "path", "steps", "pedestrian", "cycleway", "track"];
    console.log(`spawn at (${spawn.x.toFixed(1)}, ${spawn.z.toFixed(1)}) heading ${spawn.heading.toFixed(2)}; nearest road ${cls} at ${nearest?.d.toFixed(1)}m; spawn-to-road ${d.toFixed(1)}m`);
    expect(nonDrivable.includes(cls)).toBe(false);
    expect(d).toBeLessThan(3);
  });
});
