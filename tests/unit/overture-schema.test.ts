import { describe, it, expect } from "vitest";
import { PMTiles } from "pmtiles";
import { decodeTile } from "../../src/geo/mvt";
import { webMercatorX, webMercatorY } from "../../src/geo/projection";

const RELEASE = "2026-07-22.0";
const BASE = `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${RELEASE}`;

function zxy(lonW: number, latS: number, lonE: number, latN: number, z: number) {
  const tx = (a: number) => Math.floor(((a + 180) / 360) * 2 ** z);
  const ty = (a: number) => Math.floor(((1 - Math.log(Math.tan((a * Math.PI) / 180) + 1 / Math.cos((a * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
  return { x: tx(lonW), y: ty(latN), z, spanX: tx(lonE) - tx(lonW) + 1, spanY: ty(latS) - ty(latN) + 1 };
}

async function tileProps(theme: string, layer: string, t: { z: number; x: number; y: number }) {
  const src = new PMTiles(`${BASE}/${theme}.pmtiles`);
  const res = await src.getZxy(t.z, t.x, t.y);
  if (!res) return { keys: new Set<string>(), count: 0, sample: null };
  const tile = decodeTile(new Uint8Array(res.data));
  const l = tile.layers.get(layer);
  if (!l) return { keys: new Set<string>(), count: 0, sample: null };
  const keys = new Set<string>();
  for (const f of l.features) for (const k of Object.keys(f.properties)) keys.add(k);
  return { keys, count: l.features.length, sample: l.features[0]?.properties ?? null };
}

describe("scratch: real Overture tile schemas (pinned release)", () => {
  it("dumps building + transportation property keys for Manhattan", async () => {
    const t = zxy(-74.015, 40.7, -73.96, 40.735, 14);
    console.log("z14 tile:", JSON.stringify(t));
    const b = await tileProps("buildings", "building", t);
    console.log("BUILDING keys:", [...b.keys].sort().join(", "));
    console.log("BUILDING count:", b.count, "sample:", JSON.stringify(b.sample));
    const bp = await tileProps("buildings", "building_part", t);
    console.log("BUILDING_PART keys:", [...bp.keys].sort().join(", "));
    console.log("BUILDING_PART count:", bp.count, "sample:", JSON.stringify(bp.sample));
    const tr = await tileProps("transportation", "segment", t);
    console.log("SEGMENT keys:", [...tr.keys].sort().join(", "));
    console.log("SEGMENT count:", tr.count, "sample:", JSON.stringify(tr.sample));
    const seg = await tileProps("transportation", "connector", t);
    console.log("CONNECTOR keys:", [...seg.keys].sort().join(", "));
    console.log("CONNECTOR count:", seg.count, "sample:", JSON.stringify(seg.sample));
    expect(b.count).toBeGreaterThan(0);
  }, 180000);

  it("quantifies attribute coverage + class distribution (Manhattan)", async () => {
    const t = zxy(-74.015, 40.7, -73.96, 40.735, 14);
    const srcB = new PMTiles(`${BASE}/buildings.pmtiles`);
    const resB = await srcB.getZxy(t.z, t.x, t.y);
    const tileB = decodeTile(new Uint8Array(resB.data));
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

    const srcT = new PMTiles(`${BASE}/transportation.pmtiles`);
    const resT = await srcT.getZxy(t.z, t.x, t.y);
    const tileT = decodeTile(new Uint8Array(resT.data));
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
  }, 240000);
});
