import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import type { ChunkTerrain, WorldFixture } from "../../src/world/generator";
import { createFusion, geoToLocal, localToGeo, rebasePoint, stitchTerrainEdges } from "../../src/geo/fusion";
import { readFixture } from "./fixture-helper";

let fixture: WorldFixture;
let rawTerrain: ChunkTerrain[];

beforeAll(() => {
  fixture = readFixture("sf-downtown");
  const dir = fileURLToPath(new URL("../../fixtures/sf-downtown", import.meta.url));
  rawTerrain = (JSON.parse(readFileSync(`${dir}/terrain.json`, "utf8")) as { chunks: ChunkTerrain[] }).chunks;
});

function maxEdgeDelta(terrain: ChunkTerrain[]): { ns: number; ew: number } {
  const byKey = new Map(terrain.map((c) => [`${c.z}-${c.x}-${c.y}`, c]));
  let ns = 0;
  let ew = 0;
  for (const c of terrain) {
    const north = byKey.get(`${c.z}-${c.x}-${c.y - 1}`);
    if (north) {
      for (let i = 0; i < c.size; i++) {
        ns = Math.max(ns, Math.abs(c.heights[0]![i]! - north.heights[c.size - 1]![i]!));
      }
    }
    const east = byKey.get(`${c.z}-${c.x + 1}-${c.y}`);
    if (east) {
      for (let j = 0; j < c.size; j++) {
        ew = Math.max(ew, Math.abs(c.heights[j]![c.size - 1]! - east.heights[j]![0]!));
      }
    }
  }
  return { ns, ew };
}

describe("geo fusion pipeline", () => {
  it("localToGeo / geoToLocal roundtrip via the fixture origin", () => {
    const origin = fixture.manifest.origin;
    const lon = -122.4053;
    const lat = 37.7909;
    const p = geoToLocal(origin, lon, lat);
    const g = localToGeo(origin, p.x, p.z);
    expect(g.lon).toBeCloseTo(lon, 6);
    expect(g.lat).toBeCloseTo(lat, 6);
  });

  it("stitching: shared chunk edges agree after stitchTerrainEdges", () => {
    const raw = maxEdgeDelta(rawTerrain);
    expect(raw.ns).toBeGreaterThan(0);
    expect(raw.ew).toBeGreaterThan(0);
    const stitched = stitchTerrainEdges(rawTerrain);
    const { ns, ew } = maxEdgeDelta(stitched);
    expect(ns).toBeLessThan(0.01);
    expect(ew).toBeLessThan(0.01);
  });

  it("stitching is idempotent", () => {
    const once = stitchTerrainEdges(rawTerrain);
    const twice = stitchTerrainEdges(once);
    for (let k = 0; k < once.length; k++) {
      expect(twice[k]!.heights).toEqual(once[k]!.heights);
    }
  });

  it("stitching preserves interior values away from the seams", () => {
    const stitched = stitchTerrainEdges(rawTerrain);
    for (const c of stitched) {
      for (let j = 3; j <= c.size - 4; j++) {
        for (let i = 3; i <= c.size - 4; i++) {
          const orig = rawTerrain.find((o) => o.x === c.x && o.y === c.y)!;
          expect(c.heights[j]![i]!).toBe(orig.heights[j]![i]!);
        }
      }
    }
  });

  it("createFusion exposes a coherent pipeline with elevation policy", () => {
    const fusion = createFusion(fixture);
    const p = fusion.toLocal(-122.4053, 37.7909);
    expect(Number.isFinite(fusion.elevation(p.x, p.z))).toBe(true);
    const g = fusion.toGeo(p.x, p.z);
    expect(g.lon).toBeCloseTo(-122.4053, 6);
  });

  it("rebase: relative geometry is preserved under origin changes", () => {
    const origin = fixture.manifest.origin;
    const newOrigin = { x: origin.x + 5000, y: origin.y - 5000 };
    const a = { x: 123.4, z: -567.8 };
    const b = { x: 999.1, z: 12.3 };
    const ra = rebasePoint(origin, newOrigin, a.x, a.z);
    const rb = rebasePoint(origin, newOrigin, b.x, b.z);
    expect(Math.hypot(ra.x - rb.x, ra.z - rb.z)).toBeCloseTo(Math.hypot(a.x - b.x, a.z - b.z), 9);
    const geoA = localToGeo(origin, a.x, a.z);
    const backA = localToGeo(newOrigin, ra.x, ra.z);
    expect(backA.lon).toBeCloseTo(geoA.lon, 9);
    expect(backA.lat).toBeCloseTo(geoA.lat, 9);
  });
});
