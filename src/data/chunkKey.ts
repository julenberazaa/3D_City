import { RELEASE as SOURCE_RELEASE } from "./fixtureBuilder.ts";

/**
 * Versioned deterministic chunk key (R-009): same source release + chunk +
 * generator/art versions always produce the same world.
 */
export function chunkKey(
  z: number,
  x: number,
  y: number,
  release: string = SOURCE_RELEASE,
  genVersion: string = GEN_VERSION,
  artVersion: string = ART_VERSION,
): string {
  return `${release}|${genVersion}|${artVersion}|${z}/${x}/${y}`;
}

/** FNV-1a 32-bit hex hash of a chunk key (stable across platforms). */
export function hashChunkKey(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const RELEASE = SOURCE_RELEASE;
export const GEN_VERSION = "g1";
export const ART_VERSION = "a1";
