import { describe, expect, it } from "vitest";
import { chunkKey, GEN_VERSION, ART_VERSION, hashChunkKey, RELEASE } from "../../src/data/chunkKey";

describe("deterministic chunk keys (R-009)", () => {
  it("same inputs → same key and hash", () => {
    const k1 = chunkKey(15, 5241, 12663);
    const k2 = chunkKey(15, 5241, 12663);
    expect(k1).toBe(k2);
    expect(hashChunkKey(k1)).toBe(hashChunkKey(k2));
  });

  it("different chunk → different key", () => {
    expect(chunkKey(15, 5241, 12663)).not.toBe(chunkKey(15, 5242, 12663));
    expect(hashChunkKey(chunkKey(15, 5241, 12663))).not.toBe(hashChunkKey(chunkKey(15, 5242, 12663)));
  });

  it("release/version bumps change the key (cache invalidation)", () => {
    expect(chunkKey(15, 5241, 12663, RELEASE, GEN_VERSION, ART_VERSION)).not.toBe(
      chunkKey(15, 5241, 12663, "2026-08-22.0", GEN_VERSION, ART_VERSION),
    );
    expect(chunkKey(15, 5241, 12663, RELEASE, GEN_VERSION, ART_VERSION)).not.toBe(
      chunkKey(15, 5241, 12663, RELEASE, "g3", ART_VERSION),
    );
  });

  it("key format is stable and documented", () => {
    expect(chunkKey(15, 1, 2)).toBe(`${RELEASE}|${GEN_VERSION}|${ART_VERSION}|15/1/2`);
  });
});
