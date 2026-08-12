import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { WorldFixture, FixtureFeature } from "../../src/world/generator";
import { resolveBuilding, sampleTerrain } from "../../src/world/generator";
import { prepareFixture } from "../../src/geo/fusion";
import { findSpawnPoint } from "../../src/physics/world";

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

function minDistToRoads(x: number, z: number): number {
  let best = Infinity;
  for (const line of allRoadLines) {
    for (let i = 0; i < line.length - 1; i++) {
      const d = distToSeg(x, z, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

function aabbOf(ring: number[][]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
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

const ringAreaOf = (f: FixtureFeature): number => ringArea((f.ring ?? []).slice(0, -1).length >= 3 ? (f.ring ?? []).slice(0, -1) : (f.ring ?? []));

describe("FIDELITY: objective geometry/quality metrics (sf-downtown fixture)", () => {
  let buildings: Array<{ f: FixtureFeature; ring: number[][]; height: number; provenance: string; roof?: string; aabb: { minX: number; maxX: number; minZ: number; maxZ: number } }>;

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
  });

  it("ROAD-01 road class distribution is predominantly drivable (not footpaths)", () => {
    const cls = new Map<string, number>();
    for (const f of allRoads) cls.set(f.class ?? "?", (cls.get(f.class ?? "?") ?? 0) + 1);
    const total = allRoads.length;
    const nonDrivable = ["footway", "path", "steps", "pedestrian", "cycleway", "track"];
    const share = [...cls.entries()].filter(([k]) => nonDrivable.includes(k)).reduce((s, [, v]) => s + v, 0) / total;
    console.log("ROAD classes:", [...cls.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", "));
    console.log(`non-drivable share: ${(share * 100).toFixed(1)}% (${Math.round(share * total)}/${total})`);
    expect(share).toBeLessThan(0.35);
  });

  it("ROAD-02 road network is continuous: low dangling-endpoint rate", () => {
    const ends = new Map<string, number>();
    for (const line of allRoadLines) {
      const a = `${Math.round(line[0][0])},${Math.round(line[0][1])}`;
      const b = `${Math.round(line[line.length - 1][0])},${Math.round(line[line.length - 1][1])}`;
      ends.set(a, (ends.get(a) ?? 0) + 1);
      ends.set(b, (ends.get(b) ?? 0) + 1);
    }
    let dangling = 0;
    for (const [k, v] of ends) if (v === 1) dangling++;
    console.log(`endpoint degree-1 nodes: ${dangling} of ${ends.size}`);
    expect(dangling / Math.max(1, ends.size)).toBeLessThan(0.4);
  });

  it("B-01 building base elevation tracks terrain coherently (no deep burial)", () => {
    let buried = 0;
    let floating = 0;
    for (const b of buildings) {
      const terrainY = sampleTerrain(fixture.terrain, b.aabb.minX, b.aabb.minZ);
      const baseY = terrainY - 0.15;
      const t = b.aabb;
      const maxTerrain = Math.max(
        sampleTerrain(fixture.terrain, t.minX, t.minZ),
        sampleTerrain(fixture.terrain, t.maxX, t.minZ),
        sampleTerrain(fixture.terrain, t.minX, t.maxZ),
        sampleTerrain(fixture.terrain, t.maxX, t.maxZ),
      );
      if (baseY < maxTerrain - 1.5) buried++;
      if (baseY > maxTerrain + 1.5) floating++;
    }
    console.log(`buildings buried >1.5m into terrain: ${buried}/${buildings.length}; floating >1.5m: ${floating}/${buildings.length}`);
    expect(buried + floating).toBeLessThan(buildings.length * 0.1);
  });

  it("B-02 physics box vs visual footprint: bounded invisible-collision area", () => {
    let badRatio = 0;
    const ratios: number[] = [];
    for (const b of buildings) {
      const ringArea = ringAreaOf(b.f);
      const boxArea = (b.aabb.maxX - b.aabb.minX) * (b.aabb.maxZ - b.aabb.minZ);
      const ratio = boxArea > 0 ? ringArea / boxArea : 1;
      ratios.push(ratio);
      if (ratio < 0.7) badRatio++;
    }
    ratios.sort((a, b) => a - b);
    console.log(`box/ring area ratio p10=${ratios[Math.floor(ratios.length * 0.1)]!.toFixed(2)} median=${ratios[Math.floor(ratios.length * 0.5)]!.toFixed(2)}; boxes with <0.7 coverage: ${badRatio}/${buildings.length}`);
    expect(badRatio / buildings.length).toBeLessThan(0.15);
  });

  it("B-03 buildings sit close to a real road (adjacent, not isolated)", () => {
    let far = 0;
    for (const b of buildings) {
      const d = minDistToRoads(b.aabb.minX, b.aabb.minZ);
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
        if ((f as Record<string, unknown>).facadeColor || (f as Record<string, unknown>).roofColor || (f as Record<string, unknown>).subtype) anyAttr++;
      }
    }
    console.log(`buildings with ANY color/material/subtype attribute in fixture: ${anyAttr}`);
    expect(anyAttr).toBe(0);
  });

  it("SPAWN-01 spawn picks a genuinely drivable, connected road", () => {
    const spawn = findSpawnPoint(fixture.roads, fixture.terrain, fixture);
    const d = minDistToRoads(spawn.x, spawn.z);
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
