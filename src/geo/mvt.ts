import { PbfReader } from "pbf";

export interface MvtFeature {
  id?: number;
  type: "Point" | "LineString" | "Polygon";
  /** Point: [x,y] pairs; LineString: array of lines (each [x,y] pairs); Polygon: array of closed rings (each ring [x,y] pairs, last == first). */
  geometry: number[][] | number[][][];
  properties: Record<string, unknown>;
}

interface RawFeature {
  id?: number;
  type: "Point" | "LineString" | "Polygon";
  geometry: number[][] | number[][][];
  tags: number[];
}

export interface MvtLayer {
  name: string;
  version: number;
  extent: number;
  features: MvtFeature[];
}

export interface MvtTile {
  layers: Map<string, MvtLayer>;
}

const GEOM_POLYGON = 3;
const GEOM_LINESTRING = 2;

function geometryType(raw: number): MvtFeature["type"] {
  if (raw === GEOM_POLYGON) return "Polygon";
  if (raw === GEOM_LINESTRING) return "LineString";
  return "Point";
}

const CMD_MOVE_TO = 1;
const CMD_LINE_TO = 2;
const CMD_CLOSE_PATH = 7;

const ZIGZAG = (n: number): number => (n >> 1) ^ -(n & 1);

function readValue(pbf: PbfReader): unknown {
  let value: unknown = null;
  pbf.readMessage((tag, _result, p) => {
    if (tag === 1) value = p.readString();
    else if (tag === 2) value = p.readFloat();
    else if (tag === 3) value = p.readDouble();
    else if (tag === 4) value = p.readVarint();
    else if (tag === 5) value = p.readVarint();
    else if (tag === 6) value = p.readSVarint();
    else if (tag === 7) value = p.readBoolean();
    else p.skip(p.type);
  }, {});
  return value;
}

function readFeature(pbf: PbfReader): RawFeature {
  const feature: RawFeature = { type: "Point", geometry: [], tags: [] };
  let rawType = 1;
  let geometryCommands: number[] = [];
  pbf.readMessage((tag, _result, p) => {
    if (tag === 1) feature.id = p.readVarint();
    else if (tag === 2) feature.tags.push(...p.readPackedVarint());
    else if (tag === 3) rawType = p.readVarint();
    else if (tag === 4) geometryCommands = p.readPackedVarint();
    else p.skip(p.type);
  }, {});
  const type = geometryType(rawType);
  feature.type = type;
  feature.geometry = decodeGeometry(geometryCommands, type);
  return feature;
}

function readLayer(pbf: PbfReader, end: number): MvtLayer {
  const layer: MvtLayer = { name: "", version: 1, extent: 4096, features: [] };
  const keys: string[] = [];
  const values: unknown[] = [];
  const rawFeatures: RawFeature[] = [];
  pbf.readFields((tag, _result, p) => {
    if (tag === 15) layer.version = p.readVarint();
    else if (tag === 1) layer.name = p.readString();
    else if (tag === 2) rawFeatures.push(readFeature(p));
    else if (tag === 3) keys.push(p.readString());
    else if (tag === 4) values.push(readValue(p));
    else if (tag === 5) layer.extent = p.readVarint();
    else p.skip(p.type);
  }, {}, end);
  for (const raw of rawFeatures) {
    const properties: Record<string, unknown> = {};
    for (let i = 0; i + 1 < raw.tags.length; i += 2) {
      const key = keys[raw.tags[i]];
      const value = values[raw.tags[i + 1]];
      if (key !== undefined) properties[key] = value;
    }
    layer.features.push({
      id: raw.id,
      type: raw.type,
      geometry: raw.geometry,
      properties,
    });
  }
  return layer;
}

function decodeGeometry(commands: number[], type: MvtFeature["type"]): MvtFeature["geometry"] {
  const rings: number[][][] = [];
  let current: number[][] = [];
  let x = 0;
  let y = 0;
  let i = 0;
  while (i < commands.length) {
    const command = commands[i++];
    const count = command >> 3;
    const id = command & 0x7;
    if (id === CMD_MOVE_TO) {
      if (current.length > 0) rings.push(current);
      current = [];
      for (let j = 0; j < count; j++) {
        x += ZIGZAG(commands[i++]);
        y += ZIGZAG(commands[i++]);
        current.push([x, y]);
      }
    } else if (id === CMD_LINE_TO) {
      for (let j = 0; j < count; j++) {
        x += ZIGZAG(commands[i++]);
        y += ZIGZAG(commands[i++]);
        current.push([x, y]);
      }
    } else if (id === CMD_CLOSE_PATH) {
      const first = current[0];
      const last = current[current.length - 1];
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
        current.push([first[0], first[1]]);
      }
    }
  }
  if (current.length > 0) rings.push(current);
  if (type === "Point") return rings.map((r) => r[0]);
  return rings;
}

export function decodeTile(pbfBytes: Uint8Array): MvtTile {
  const pbf = new PbfReader(pbfBytes);
  const layers = new Map<string, MvtLayer>();
  pbf.readFields((tag, _result, p) => {
    if (tag === 3) {
      const end = p.readVarint() + p.pos;
      const layer = readLayer(p, end);
      layers.set(layer.name, layer);
    } else p.skip(p.type);
  }, {});
  return { layers };
}
