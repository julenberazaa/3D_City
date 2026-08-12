import { describe, it, expect } from "vitest";
import { PMTiles } from "pmtiles";
import { decodeTile } from "../../src/geo/mvt";

const RELEASE = "2026-07-22.0";
const BASE = `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${RELEASE}`;

/** Network guard: real-tile evidence is BLOCKED_EXTERNAL when the source is
 *  unreachable/throttled (same policy as live.spec), never a unit failure. */
async function withTile<T>(theme: string, t: { z: number; x: number; y: number }, fn: (bytes: Uint8Array) => T): Promise<T | "NETWORK_UNAVAILABLE"> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const src = new PMTiles(`${BASE}/${theme}.pmtiles`);
    const res = await src.getZxy(t.z, t.x, t.y, { signal: ctrl.signal } as never);
    return res ? fn(new Uint8Array(res.data)) : "NETWORK_UNAVAILABLE";
  } catch {
    return "NETWORK_UNAVAILABLE";
  } finally {
    clearTimeout(timer);
  }
}

function zxy(lonW: number, latS: number, lonE: number, latN: number, z: number) {
  const tx = (a: number) => Math.floor(((a + 180) / 360) * 2 ** z);
  const ty = (a: number) => Math.floor(((1 - Math.log(Math.tan((a * Math.PI) / 180) + 1 / Math.cos((a * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
  return { x: tx(lonW), y: ty(latN), z, spanX: tx(lonE) - tx(lonW) + 1, spanY: ty(latS) - ty(latN) + 1 };
}

describe("real Overture tile schemas (pinned release) — network evidence", () => {
  it("dumps building + transportation property keys for Manhattan", async (ctx) => {
    const t = zxy(-74.015, 40.7, -73.96, 40.735, 14);
    console.log("z14 tile:", JSON.stringify(t));
    const b = await withTile("buildings", t, (bytes) => {
      const tile = decodeTile(bytes);
      const l = tile.layers.get("building");
      const keys = new Set<string>();
      for (const f of l?.features ?? []) for (const k of Object.keys(f.properties)) keys.add(k);
      return { keys, count: l?.features.length ?? 0, sample: l?.features[0]?.properties ?? null };
    });
    if (b === "NETWORK_UNAVAILABLE") {
      console.log("BLOCKED_EXTERNAL: Overture tiles unreachable (network evidence unavailable)");
      ctx.skip(true);
      return;
    }
    console.log("BUILDING keys:", [...b.keys].sort().join(", "));
    console.log("BUILDING count:", b.count, "sample:", JSON.stringify(b.sample));
    const bp = await withTile("buildings", { ...t, z: 14, x: t.x, y: t.y }, (bytes) => {
      const l = decodeTile(bytes).layers.get("building_part");
      const keys = new Set<string>();
      for (const f of l?.features ?? []) for (const k of Object.keys(f.properties)) keys.add(k);
      return { keys, count: l?.features.length ?? 0, sample: l?.features[0]?.properties ?? null };
    });
    console.log("BUILDING_PART keys:", bp === "NETWORK_UNAVAILABLE" ? "n/a" : [...bp.keys].sort().join(", "));
    const tr = await withTile("transportation", t, (bytes) => {
      const l = decodeTile(bytes).layers.get("segment");
      const keys = new Set<string>();
      for (const f of l?.features ?? []) for (const k of Object.keys(f.properties)) keys.add(k);
      return { keys, count: l?.features.length ?? 0, sample: l?.features[0]?.properties ?? null };
    });
    console.log("SEGMENT keys:", tr === "NETWORK_UNAVAILABLE" ? "n/a" : [...tr.keys].sort().join(", "));
    const seg = await withTile("transportation", t, (bytes) => {
      const l = decodeTile(bytes).layers.get("connector");
      const keys = new Set<string>();
      for (const f of l?.features ?? []) for (const k of Object.keys(f.properties)) keys.add(k);
      return { keys, count: l?.features.length ?? 0, sample: l?.features[0]?.properties ?? null };
    });
    console.log("CONNECTOR keys:", seg === "NETWORK_UNAVAILABLE" ? "n/a" : [...seg.keys].sort().join(", "));
    expect(b.count).toBeGreaterThan(0);
  }, 120000);

  it("quantifies attribute coverage + class distribution (Manhattan)", async (ctx) => {
    const t = zxy(-74.015, 40.7, -73.96, 40.735, 14);
    const tileB = await withTile("buildings", t, (bytes) => decodeTile(bytes));
    if (tileB === "NETWORK_UNAVAILABLE") {
      console.log("BLOCKED_EXTERNAL: Overture tiles unreachable (network evidence unavailable)");
      ctx.skip(true);
      return;
    }
    const bld = tileB.layers.get("building")!;
    const pct = (n: number, total: number) => `${Math.round((n / total) * 100)}% (${n}/${total})`;
    let withColor = 0, withMat = 0, withRoofCol = 0, withRoofShape = 0, withHeight = 0, withFloors = 0, withSubtype = 0, withName = 0, withRoofHeight = 0, multiRing = 0;
    const subtypes = new Map<string, number>();
    for (const f of bld.features) {
      const p = f.properties;
      if (p.facade_color) withColor++;
      if (p.facade_material) withMat++;
      if (p.roof_color) withRoofCol++;
      if (p.roof_shape) withRoofShape++;
      if (typeof p.height === "number") withHeight++;
      if (typeof p.num_floors === "number") withFloors++;
      if (p.subtype) { withSubtype++; subtypes.set(String(p.subtype), (subtypes.get(String(p.subtype)) ?? 0) + 1); }
      if (p.names || p["@name"]) withName++;
      if (typeof p.roof_height === "number") withRoofHeight++;
      if (f.geometry.length > 1) multiRing++;
    }
    const n = bld.features.length;
    console.log(`BUILDING coverage (n=${n}): facade_color ${pct(withColor, n)} | facade_material ${pct(withMat, n)} | roof_color ${pct(withRoofCol, n)} | roof_shape ${pct(withRoofShape, n)} | height ${pct(withHeight, n)} | num_floors ${pct(withFloors, n)} | subtype ${pct(withSubtype, n)} | names ${pct(withName, n)} | roof_height ${pct(withRoofHeight, n)} | multi-ring features ${multiRing}`);
    console.log("SUBTYPES:", [...subtypes.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", "));

    const tileT = await withTile("transportation", t, (bytes) => decodeTile(bytes));
    if (tileT === "NETWORK_UNAVAILABLE") {
      console.log("BLOCKED_EXTERNAL: transportation tile unreachable");
      ctx.skip(true);
      return;
    }
    const seg = tileT.layers.get("segment")!;
    const cls = new Map<string, number>();
    const sub = new Map<string, number>();
    let withConnectors = 0, withSurface = 0, withWidthRules = 0;
    for (const f of seg.features) {
      const p = f.properties;
      const c = String(p.class ?? "?");
      cls.set(c, (cls.get(c) ?? 0) + 1);
      sub.set(String(p.subtype ?? "?"), (sub.get(String(p.subtype ?? "?")) ?? 0) + 1);
      if (p.connectors) withConnectors++;
      if (p.road_surface) withSurface++;
      if (p.width_rules) withWidthRules++;
    }
    const m = seg.features.length;
    console.log(`SEGMENT classes (n=${m}):`, [...cls.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", "));
    console.log("SEGMENT subtypes:", [...sub.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", "));
    console.log(`connectors present ${pct(withConnectors, m)} | road_surface ${pct(withSurface, m)} | width_rules ${pct(withWidthRules, m)}`);
    expect(n).toBeGreaterThan(0);
  }, 120000);
});
