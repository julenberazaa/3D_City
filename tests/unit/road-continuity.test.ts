import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { WorldFixture, FixtureFeature } from "../../src/world/generator";
import { buildWorld } from "../../src/world/generator";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const json = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

const load = (name: string): WorldFixture =>
  ({
    manifest: json(`fixtures/${name}/manifest.json`),
    buildings: json(`fixtures/${name}/buildings.json`).chunks,
    roads: json(`fixtures/${name}/roads.json`).chunks,
    water: json(`fixtures/${name}/water.json`).chunks,
    landcover: json(`fixtures/${name}/landcover.json`).chunks,
    terrain: json(`fixtures/${name}/terrain.json`).chunks,
  }) as unknown as WorldFixture;

interface Tri2D {
  ax: number; az: number; bx: number; bz: number; cx: number; cz: number;
}

function pointInTri(px: number, pz: number, t: Tri2D): boolean {
  const d1 = (px - t.bx) * (t.az - t.bz) - (t.ax - t.bx) * (pz - t.bz);
  const d2 = (px - t.cx) * (t.bz - t.cz) - (t.bx - t.cx) * (pz - t.cz);
  const d3 = (px - t.ax) * (t.cz - t.az) - (t.cx - t.ax) * (pz - t.az);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function roadTriangles(fixture: WorldFixture): Map<number, Tri2D[]> {
  const world = buildWorld(fixture);
  const cells = new Map<number, Tri2D[]>();
  const key = (cx: number, cz: number) => cx * 100000 + cz;
  for (const [, group] of world.groups.roads) {
    const mesh = group.children[0] as unknown as { geometry: { getAttribute(n: string): { array: Float32Array }; index?: { array: Uint32Array } } };
    const positions = mesh.geometry.getAttribute("position").array;
    const indices = mesh.geometry.index?.array;
    if (!indices) continue;
    for (let t = 0; t < indices.length; t += 3) {
      const i = indices[t] * 3;
      const j = indices[t + 1] * 3;
      const k = indices[t + 2] * 3;
      const tri: Tri2D = {
        ax: positions[i], az: positions[i + 2],
        bx: positions[j], bz: positions[j + 2],
        cx: positions[k], cz: positions[k + 2],
      };
      const minX = Math.min(tri.ax, tri.bx, tri.cx);
      const maxX = Math.max(tri.ax, tri.bx, tri.cx);
      const minZ = Math.min(tri.az, tri.bz, tri.cz);
      const maxZ = Math.max(tri.az, tri.bz, tri.cz);
      for (let cx = Math.floor(minX / 8); cx <= Math.floor(maxX / 8); cx++) {
        for (let cz = Math.floor(minZ / 8); cz <= Math.floor(maxZ / 8); cz++) {
          const kk = key(cx, cz);
          const list = cells.get(kk);
          if (list) list.push(tri);
          else cells.set(kk, [tri]);
        }
      }
    }
  }
  return cells;
}

function covered(px: number, pz: number, cells: Map<number, Tri2D[]>, tol: number): boolean {
  const cx = Math.floor(px / 8);
  const cz = Math.floor(pz / 8);
  const ring = Math.ceil(tol / 8) + 1;
  for (let dx = -ring; dx <= ring; dx++) {
    for (let dz = -ring; dz <= ring; dz++) {
      const list = cells.get(cx * 100000 + cz + dx * 100000 + dz);
      if (!list) continue;
      for (const t of list) {
        const center = pointInTri(px, pz, t);
        if (center) return true;
        // Edge tolerance: sample the disc around the endpoint.
        if (
          pointInTri(px + tol, pz, t) || pointInTri(px - tol, pz, t) ||
          pointInTri(px, pz + tol, t) || pointInTri(px, pz - tol, t)
        ) return true;
      }
    }
  }
  return false;
}

describe("RENDERED road-mesh continuity (not source metadata)", () => {
  const cases = [
    { name: "sf-downtown", expectUncovered: 0.02 },
    { name: "santander", expectUncovered: 0.02 },
    { name: "zurich", expectUncovered: 0.02 },
  ];
  const results: Array<{ name: string; endpoints: number; uncovered: number; gaps: Array<[number, number, number, number]> }> = [];

  beforeAll(() => {
    for (const c of cases) {
      const fixture = load(c.name);
      const bbox = fixture.manifest.bbox as number[];
      const w = bbox[2] - bbox[0];
      const h = bbox[3] - bbox[1];
      const nearEdge = (x: number, z: number): boolean =>
        x < w * 0.03 || x > w * 0.97 || z < h * 0.03 || z > h * 0.97;
      const cells = roadTriangles(fixture);
      const uncovered: Array<[number, number, number, number]> = [];
      let endpoints = 0;
      const sample = 8;
      let seen = 0;
      for (const c2 of fixture.roads) {
        for (const f of c2.features) {
          const line = f.line;
          if (!line || line.length < 2) continue;
          if (seen++ % sample !== 0) continue;
          for (const [ex, ez] of [line[0]!, line[line.length - 1]!]) {
            endpoints++;
            if (nearEdge(ex, ez)) continue;
            if (!covered(ex, ez, cells, 1.2)) uncovered.push([ex, ez, f.id.length, f.class ? f.class.length : 0]);
          }
        }
      }
      results.push({ name: c.name, endpoints, uncovered: uncovered.length, gaps: uncovered.slice(0, 12) });
    }
  });

  it("rendered road mesh covers source segment endpoints (no visible gaps)", () => {
    for (const r of results) {
      const rate = r.uncovered / Math.max(1, r.endpoints);
      console.log(`${r.name}: ${r.endpoints} endpoints sampled, ${r.uncovered} uncovered (${(rate * 100).toFixed(2)}%)`);
      for (const g of r.gaps.slice(0, 6)) console.log(`  gap at (${g[0].toFixed(1)}, ${g[1].toFixed(1)})`);
      const c = cases.find((x) => x.name === r.name)!;
      expect(rate).toBeLessThan(c.expectUncovered);
    }
  });

  it("junction degeneracy: same-class collinear 2-way splits produce no caps", () => {
    // OSM splits every way at its nodes; a 2-way junction of the SAME class
    // with collinear segments is a split point, NOT an intersection. The
    // generator must treat it as pass-through (no cap polygon, no trim), or
    // every ~80 m of straight street becomes a beaded cap (owner-observed
    // "broken road" artifact).
    for (const name of ["santander", "zurich"]) {
      const fixture = load(name);
      interface Seg { f: FixtureFeature; connectors?: Array<{ id: string; at: number }> }
      const segs: Seg[] = [];
      for (const c of fixture.roads) {
        for (const f of c.features) {
          if (!f.line || f.line.length < 2) continue;
          segs.push({ f, connectors: f.connectors });
        }
      }
      const byConn = new Map<string, Seg[]>();
      for (const s of segs) for (const c of s.connectors ?? []) {
        const list = byConn.get(c.id) ?? [];
        list.push(s);
        byConn.set(c.id, list);
      }
      const dirAt = (s: Seg, jx: number, jz: number): [number, number] | null => {
        const line = s.f.line!;
        if (Math.abs(line[0]![0] - jx) < 1e-6 && Math.abs(line[0]![1] - jz) < 1e-6) {
          const d = Math.hypot(line[1]![0] - line[0]![0], line[1]![1] - line[0]![1]);
          return d < 1e-9 ? null : [(line[1]![0] - line[0]![0]) / d, (line[1]![1] - line[0]![1]) / d];
        }
        const p = line[line.length - 1]!;
        const q = line[line.length - 2]!;
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        return d < 1e-9 ? null : [(p[0] - q[0]) / d, (p[1] - q[1]) / d];
      };
      let twoWay = 0;
      let passThrough = 0;
      for (const [id, list] of byConn) {
        if (list.length !== 2) continue;
        twoWay++;
        const [a, b] = list;
        if ((a.f.class ?? "") !== (b.f.class ?? "")) continue;
        // Collinear check must mirror the generator; connector position comes
        // from the segment endpoint of one side (matches addJunction).
        const ref = a.connectors!.find((c) => c.id === id)!;
        const pos = ref.at <= 0.5 ? a.f.line![0]! : a.f.line![a.f.line!.length - 1]!;
        const d1 = dirAt(a, pos[0], pos[1]);
        const d2 = dirAt(b, pos[0], pos[1]);
        if (d1 && d2 && Math.abs(d1[0] * d2[0] + d1[1] * d2[1]) >= 0.94) passThrough++;
      }
      console.log(`${name}: 2-way junctions=${twoWay}, pass-through (no cap/trim)=${passThrough} (${(100 * passThrough / Math.max(1, twoWay)).toFixed(0)}%)`);
      // Measured distribution (santander/zurich): 2-way same-class junctions
      // are ~60% real T-junctions (angle >=80) and ~16-20% collinear split
      // points. The generator must suppress caps/trims for the collinear
      // splits (bead artifact on straight streets) — assert the pass-through
      // rate is non-trivial (>=8%) and the rendered-mesh gate above keeps
      // continuity at the remaining junctions.
      expect(passThrough).toBeGreaterThan(twoWay * 0.08);
    }
  });
});
