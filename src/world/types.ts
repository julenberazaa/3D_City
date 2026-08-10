export type Provenance = "OBSERVED" | "DERIVED" | "INFERRED";

export interface Attr<T> {
  value: T;
  provenance: Provenance;
  description?: string;
}

export interface GeoFeature {
  id: string;
  kind: string;
  /** rings in tile-local or local meters depending on stage */
  geometry: number[][][];
  attrs: Record<string, Attr<unknown>>;
}

export interface ChunkId {
  z: number;
  x: number;
  y: number;
}
