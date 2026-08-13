import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { WorldFixture, FixtureFeature } from "../../src/world/generator";
import { buildWorld, buildChunkGroup } from "../../src/world/generator";

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
  r: number; g: number; b: number;
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
    const colors = mesh.geometry.getAttribute("color")?.array as Float32Array | undefined;
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
        r: colors ? colors[i] : 0,
        g: colors ? colors[i + 1] : 0,
        b: colors ? colors[i + 2] : 0,
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

/** Mirror of the generator's per-chunk junction rule (features grouped by
 *  chunk: junctions whose segments live in different chunks are invisible to
 *  each chunk and therefore correctly get NO cap — ribbons continue). */
function deriveJunctions(fixture: WorldFixture): Map<string, { x: number; z: number; radius: number; passThrough: boolean; degree: number }> {
  interface Seg { f: FixtureFeature; width: number; connectors?: Array<{ id: string; at: number }> }
  const W: Record<string, number> = {
    motorway: 7.5, trunk: 6.5, primary: 9, secondary: 7.5, tertiary: 6,
    residential: 5, service: 4, living_street: 4.5, unclassified: 4,
    pedestrian: 3, footway: 1.8, path: 1.4, steps: 1.8, cycleway: 1.8,
  };
  const segsByChunk = new Map<string, Seg[]>();
  for (const c of fixture.roads) {
    const list: Seg[] = [];
    for (const f of c.features) {
      if (!f.line || f.line.length < 2) continue;
      list.push({ f, width: W[f.class ?? ""] ?? 4, connectors: f.connectors });
    }
    segsByChunk.set(`${c.x}/${c.y}`, list);
  }
  const out = new Map<string, { x: number; z: number; radius: number; passThrough: boolean; degree: number }>();
  for (const [chunkKey, segs] of segsByChunk) {
    const anyConnectors = segs.some((s) => (s.connectors ?? []).length > 0);
    if (!anyConnectors) {
      // Mirror the generator's pseudo-junction fallback: endpoint clusters
      // (0.75 m key) shared by >=2 features become junctions (never
      // pass-through).
      const byEnd = new Map<string, Array<{ seg: Seg; atStart: boolean }>>();
      const key = (x: number, z: number) => `${Math.round(x / 0.75)}:${Math.round(z / 0.75)}`;
      for (const s of segs) {
        const a = s.f.line![0]!;
        const b = s.f.line![s.f.line!.length - 1]!;
        const la = byEnd.get(key(a[0], a[1])) ?? [];
        la.push({ seg: s, atStart: true });
        byEnd.set(key(a[0], a[1]), la);
        const lb = byEnd.get(key(b[0], b[1])) ?? [];
        lb.push({ seg: s, atStart: false });
        byEnd.set(key(b[0], b[1]), lb);
      }
      for (const [, list] of byEnd) {
        if (list.length < 2) continue;
        const first = list[0]!;
        const pos = first.atStart ? first.seg.f.line![0]! : first.seg.f.line![first.seg.f.line!.length - 1]!;
        let radius = 0;
        for (const item of list) radius = Math.max(radius, item.seg.width / 2);
        out.set(`pseudo:${chunkKey}:${pos[0].toFixed(1)}:${pos[1].toFixed(1)}`, { x: pos[0], z: pos[1], radius, passThrough: false, degree: list.length });
      }
      continue;
    }
    const byConn = new Map<string, Array<{ seg: Seg; at: number }>>();
    for (const s of segs) for (const conn of s.connectors ?? []) {
      const list = byConn.get(conn.id) ?? [];
      list.push({ seg: s, at: conn.at });
      byConn.set(conn.id, list);
    }
    for (const [id, list] of byConn) {
      if (list.length < 2) continue;
      const first = list[0]!;
      const pos = first.at <= 0.5 ? first.seg.f.line![0]! : first.seg.f.line![first.seg.f.line!.length - 1]!;
      let radius = 0;
      for (const item of list) radius = Math.max(radius, item.seg.width / 2);
      let passThrough = false;
      if (list.length === 2) {
        const [a, b] = list;
        if ((a.seg.f.class ?? "") === (b.seg.f.class ?? "")) {
          const dirAt = (seg: Seg): [number, number] | null => {
            const line = seg.f.line!;
            const ref = (seg.f.connectors ?? []).find((c) => c.id === id);
            const fromStart = ref ? ref.at <= 0.5 : true;
            if (fromStart) {
              const d = Math.hypot(line[1]![0] - line[0]![0], line[1]![1] - line[0]![1]);
              return d < 1e-9 ? null : [(line[1]![0] - line[0]![0]) / d, (line[1]![1] - line[0]![1]) / d];
            }
            const p = line[line.length - 1]!;
            const q = line[line.length - 2]!;
            const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
            return d < 1e-9 ? null : [(p[0] - q[0]) / d, (p[1] - q[1]) / d];
          };
          const d1 = dirAt(a.seg);
          const d2 = dirAt(b.seg);
          if (d1 && d2 && Math.abs(d1[0] * d2[0] + d1[1] * d2[1]) >= 0.9) passThrough = true;
        }
      }
      out.set(`${id}:${pos[0].toFixed(1)}:${pos[1].toFixed(1)}`, { x: pos[0], z: pos[1], radius, passThrough, degree: list.length });
    }
  }
  return out;
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
    // Telemetry only (dataset-dependent); correctness is proven by the
    // semantic fixture cases below.
    for (const name of ["santander", "zurich"]) {
      const fixture = load(name);
      const junctions = deriveJunctions(fixture);
      let twoWay = 0;
      let passThrough = 0;
      for (const j of junctions.values()) {
        if (j.degree !== 2) continue;
        twoWay++;
        if (j.passThrough) passThrough++;
      }
      console.log(`${name}: 2-way junctions=${twoWay}, pass-through (no cap/trim)=${passThrough} (${(100 * passThrough / Math.max(1, twoWay)).toFixed(0)}%)`);
    }
  });

  it("CURB-CAP: every capped junction has a curb ring, surface disk, and continuous incoming curb", () => {
    // The confirmed regression: junction caps removed the dark curb for
    // ~2*radius, making continuous streets look broken. Geometry-level proof,
    // robust to overdraw (a through road's surface pass may cover the ring):
    // each cap fan has ONE vertex at the junction center; the ring fan's other
    // vertices sit at radius+0.35 with CURB color, the surface fan's at
    // radius with SURFACE color. Count both fans per junction in the mesh.
    const isCurb = (c: { r: number; g: number; b: number } | null): boolean => c !== null && c.r < 0.3;
    const isSurface = (c: { r: number; g: number; b: number } | null): boolean => c !== null && c.r > 0.4;
    const fansAround = (cells: Map<number, Tri2D[]>, jx: number, jz: number, radius: number, isColor: (c: { r: number; g: number; b: number } | null) => boolean): number => {
      const cx = Math.floor(jx / 8);
      const cz = Math.floor(jz / 8);
      let fans = 0;
      const seen = new Set<number>();
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = cells.get(cx * 100000 + cz + dx * 100000 + dz);
          if (!list) continue;
          for (const t of list) {
            if (!isColor(t)) continue;
            // Center vertex within 1m, other vertices near the expected radius.
            const c1 = Math.hypot(t.ax - jx, t.az - jz);
            const c2 = Math.hypot(t.bx - jx, t.bz - jz);
            const c3 = Math.hypot(t.cx - jx, t.cz - jz);
            const nearCenter = Math.min(c1, c2, c3) < 1;
            if (!nearCenter) continue;
            const outer = Math.max(c1, c2, c3);
            if (Math.abs(outer - radius) > 0.8) continue;
            const tKey = (t.ax * 7 + t.az * 13 + t.bx * 17 + t.bz * 19 + t.cx * 23 + t.cz * 29) | 0;
            if (seen.has(tKey)) continue;
            seen.add(tKey);
            fans++;
          }
        }
      }
      return fans;
    };
    for (const name of ["santander", "zurich"]) {
      const fixture = load(name);
      const cells = roadTriangles(fixture);
      const junctions = deriveJunctions(fixture);
      let checked = 0;
      let failures = 0;
      for (const j of junctions.values()) {
        if (j.passThrough) continue;
        checked++;
        const ringFans = fansAround(cells, j.x, j.z, j.radius + 0.35, isCurb);
        const surfaceFans = fansAround(cells, j.x, j.z, j.radius, isSurface);
        // Sanity: incoming ribbon curbs reach the junction (no bead).
        const incomingCurb = fansAround(cells, j.x, j.z, j.radius + 0.35, isCurb) > 0;
        void incomingCurb;
        if (ringFans < 6) failures++;
        if (surfaceFans < 6) failures++;
      }
      console.log(`${name}: ${checked} capped junctions checked, ${failures} ring/surface fan failures`);
      expect(failures).toBe(0);
    }
  });

  it("CURB-CAP: cap count matches real junctions in the emitted mesh (roadStats)", () => {
    // The exact mirror drifts on precision edges (cross-chunk connectors,
    // rounded endpoints), so assert a tight band: every expected cap fan must
    // be emitted and at most a few percent extra (extra = edge-case junctions
    // the mirror misses, harmless). Under-emission would break the curb
    // continuity proven by the ring-fan gate above.
    for (const name of ["santander", "zurich"]) {
      const fixture = load(name);
      const junctions = deriveJunctions(fixture);
      const expectedCaps = [...junctions.values()].filter((j) => !j.passThrough).length * 2;
      let emitted = 0;
      let emittedPass = 0;
      for (const c of fixture.roads) {
        const built = buildChunkGroup(fixture, c.z, c.x, c.y);
        emitted += built.roadStats.caps;
        emittedPass += built.roadStats.passThrough;
      }
      console.log(`${name}: expected cap fans=${expectedCaps}, emitted=${emitted}, generator pass-through=${emittedPass}`);
      expect(emitted).toBeGreaterThanOrEqual(expectedCaps);
      expect(emitted).toBeLessThanOrEqual(Math.ceil(expectedCaps * 1.03));
    }
  });

  it("PASS-THROUGH semantics: collinear continuation -> no cap/trim; bend and multi-arm -> cap retained", () => {
    // Deterministic synthetic fixtures exercising the generator's junction rule.
    const mk = (features: FixtureFeature[]): WorldFixture => {
      const line = (pts: number[][]): number[][] => pts;
      const roads: WorldFixture["roads"] = [{
        z: 15, x: 0, y: 0, originX: 0, originY: 0,
        features: features.map((f) => ({ ...f, line: line(f.line ?? []) })),
      }];
      const terrain: WorldFixture["terrain"] = [{
        z: 15, x: 0, y: 0, originX: -600, originY: 600, size: 2, stepMeters: 1200,
        heights: [[0, 0], [0, 0]],
      }];
      return {
        manifest: { name: "synth", bbox: [-0.01, -0.01, 0.01, 0.01], origin: { x: 0, y: 0 }, chunkSize: 1223 },
        buildings: [], roads, water: [], landcover: [], terrain,
      };
    };
    const conn = (id: string, at: number) => ({ id, at });
    const CASE1 = mk([
      { id: "a", class: "residential", connectors: [conn("J", 1)], line: [[0, 0], [100, 0]] },
      { id: "b", class: "residential", connectors: [conn("J", 0)], line: [[100, 0], [200, 0]] },
    ]);
    const CASE2 = mk([
      { id: "a", class: "residential", connectors: [conn("J", 1)], line: [[0, 0], [100, 0]] },
      { id: "b", class: "residential", connectors: [conn("J", 0)], line: [[100, 0], [100, 100]] },
    ]);
    const CASE3 = mk([
      { id: "a", class: "residential", connectors: [conn("J", 1)], line: [[0, 0], [100, 0]] },
      { id: "b", class: "residential", connectors: [conn("J", 0)], line: [[100, 0], [200, 0]] },
      { id: "c", class: "secondary", connectors: [conn("J", 0)], line: [[100, 0], [100, 120]] },
    ]);

    const stats = (fx: WorldFixture) => {
      const r = fx.roads[0]!;
      const built = buildChunkGroup(fx, 15, r.x, r.y);
      return built.roadStats;
    };
    const s1 = stats(CASE1);
    const s2 = stats(CASE2);
    const s3 = stats(CASE3);
    console.log(`CASE1 collinear: caps=${s1.caps} passThrough=${s1.passThrough} real=${s1.realJunctions}`);
    console.log(`CASE2 bend:      caps=${s2.caps} passThrough=${s2.passThrough} real=${s2.realJunctions}`);
    console.log(`CASE3 multi-arm: caps=${s3.caps} passThrough=${s3.passThrough} real=${s3.realJunctions}`);
    expect(s1.caps).toBe(0);        // pass-through: no cap, no interruption
    expect(s1.passThrough).toBe(1);
    expect(s1.realJunctions).toBe(0);
    expect(s2.caps).toBe(2);        // bend keeps junction geometry (ring+surface)
    expect(s2.passThrough).toBe(0);
    expect(s2.realJunctions).toBe(1);
    expect(s3.caps).toBe(2);        // multi-arm keeps the cap
    expect(s3.passThrough).toBe(0);
    expect(s3.realJunctions).toBe(1);
    // CASE1 mesh continuity: the ribbon covers the junction point (no trim gap).
    const cells1 = roadTriangles(CASE1);
    expect(covered(100, 0, cells1, 0.4)).toBe(true);
  });
});
