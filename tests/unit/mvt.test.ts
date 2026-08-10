import { describe, expect, it } from "vitest";
import { PbfWriter } from "pbf";
import { decodeTile, type MvtFeature } from "../../src/geo/mvt";

const zigzag = (n: number): number => (n << 1) ^ (n >> 31);
const cmd = (id: number, count: number): number => (id & 0x7) | (count << 3);

type Point = [number, number];

function writeGeometry(
  p: PbfWriter,
  type: "Point" | "LineString" | "Polygon",
  rings: Point[][],
): void {
  const cmds: number[] = [];
  if (type === "Point") {
    let px = 0;
    let py = 0;
    for (const [x, y] of rings.map((r) => r[0])) {
      cmds.push(cmd(1, 1), zigzag(x - px), zigzag(y - py));
      px = x;
      py = y;
    }
  } else {
    let px = 0;
    let py = 0;
    for (const pts of rings) {
      cmds.push(cmd(1, 1), zigzag(pts[0][0] - px), zigzag(pts[0][1] - py));
      px = pts[0][0];
      py = pts[0][1];
      cmds.push(cmd(2, pts.length - 1));
      for (let i = 1; i < pts.length; i++) {
        cmds.push(zigzag(pts[i][0] - px), zigzag(pts[i][1] - py));
        px = pts[i][0];
        py = pts[i][1];
      }
      if (type === "Polygon") cmds.push(cmd(7, 1));
    }
  }
  p.writePackedVarint(4, cmds);
}

function writeFeature(p: PbfWriter, id: number, type: "Point" | "LineString" | "Polygon", tags: number[], rings: Point[][]): void {
  p.writeMessage(2, (_o, f) => {
    f.writeVarintField(1, id);
    f.writePackedVarint(2, tags);
    const typeId = type === "Point" ? 1 : type === "LineString" ? 2 : 3;
    f.writeVarintField(3, typeId);
    writeGeometry(f, type, rings);
  }, null);
}

function writeLayer(
  p: PbfWriter,
  name: string,
  keys: string[],
  values: unknown[],
  features: Array<{ id: number; type: "Point" | "LineString" | "Polygon"; tags: number[]; rings: Point[][] }>,
): void {
  p.writeMessage(3, (_o, layer) => {
    layer.writeVarintField(15, 2);
    layer.writeStringField(1, name);
    for (const f of features) writeFeature(layer, f.id, f.type, f.tags, f.rings);
    for (const k of keys) layer.writeStringField(3, k);
    for (const v of values) {
      layer.writeMessage(4, (_ov, value) => {
        if (typeof v === "string") value.writeStringField(1, v);
        else if (typeof v === "number") value.writeDoubleField(3, v);
        else if (typeof v === "boolean") value.writeBooleanField(7, v);
        else value.writeVarintField(4, v as number);
      }, null);
    }
    layer.writeVarintField(5, 4096);
  }, null);
}

function buildSyntheticTile(): Uint8Array {
  const pbf = new PbfWriter();
  writeLayer(
    pbf,
    "places",
    ["name", "height", "bool", "int"],
    ["test", 12.5, true, 7],
    [
      { id: 1, type: "Point", tags: [0, 0, 1, 1, 2, 2, 3, 3], rings: [[[100, 200]]] },
      { id: 2, type: "LineString", tags: [], rings: [[[0, 0], [50, 100], [200, 150]]] },
    ],
  );
  writeLayer(
    pbf,
    "roads",
    ["name"],
    ["poly"],
    [{ id: 3, type: "Polygon", tags: [0, 0], rings: [[[0, 0], [100, 0], [100, 100], [0, 100]]] }],
  );
  return pbf.finish();
}

describe("decodeTile", () => {
  it("decodes 2 layers with point, line and polygon", () => {
    const tile = decodeTile(buildSyntheticTile());
    expect(tile.layers.size).toBe(2);
    expect([...tile.layers.keys()]).toEqual(["places", "roads"]);

    const places = tile.layers.get("places");
    expect(places?.extent).toBe(4096);
    expect(places?.features).toHaveLength(2);

    const point = places?.features[0] as MvtFeature;
    expect(point.type).toBe("Point");
    expect(point.geometry).toEqual([[100, 200]]);
    expect(point.properties).toEqual({ name: "test", height: 12.5, bool: true, int: 7 });

    const line = places?.features[1] as MvtFeature;
    expect(line.type).toBe("LineString");
    expect(line.geometry).toEqual([[[0, 0], [50, 100], [200, 150]]]);

    const roads = tile.layers.get("roads");
    const polygon = roads?.features[0] as MvtFeature;
    expect(polygon.type).toBe("Polygon");
    expect(polygon.geometry).toEqual([[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]);
    expect(polygon.properties).toEqual({ name: "poly" });
  });

  it("keeps rings closed for polygons and preserves ids", () => {
    const tile = decodeTile(buildSyntheticTile());
    const roads = tile.layers.get("roads");
    const polygon = roads?.features[0] as MvtFeature;
    const ring = polygon.geometry as number[][];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect((roads?.features[0] as MvtFeature).id).toBe(3);
    expect((tile.layers.get("places")?.features[1] as MvtFeature).id).toBe(2);
  });

  it("decodes an empty tile to zero layers", () => {
    const tile = decodeTile(new Uint8Array(0));
    expect(tile.layers.size).toBe(0);
  });

  it("preserves every line of a MultiLineString", () => {
    const pbf = new PbfWriter();
    writeLayer(
      pbf,
      "roads",
      [],
      [],
      [{ id: 4, type: "LineString", tags: [], rings: [[[0, 0], [10, 10]], [[20, 0], [30, 5], [40, 5]]] }],
    );
    const tile = decodeTile(pbf.finish());
    const line = tile.layers.get("roads")?.features[0] as MvtFeature;
    expect(line.geometry).toEqual([
      [[0, 0], [10, 10]],
      [[20, 0], [30, 5], [40, 5]],
    ]);
  });

  it("preserves every point of a MultiPoint", () => {
    const pbf = new PbfWriter();
    writeLayer(
      pbf,
      "places",
      [],
      [],
      [{ id: 5, type: "Point", tags: [], rings: [[[5, 5]], [[8, 8]]] }],
    );
    const tile = decodeTile(pbf.finish());
    const point = tile.layers.get("places")?.features[0] as MvtFeature;
    expect(point.geometry).toEqual([[5, 5], [8, 8]]);
  });
});
