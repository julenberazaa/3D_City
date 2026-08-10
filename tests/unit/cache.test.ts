import { describe, expect, it } from "vitest";
import { ChunkCache, type CacheBackend } from "../../src/cache/store";

class MemoryBackend implements CacheBackend {
  map = new Map<string, ArrayBuffer>();
  failOnGet = new Set<string>();
  async get(key: string): Promise<ArrayBuffer | undefined> {
    if (this.failOnGet.has(key)) throw new Error("corrupt");
    return this.map.get(key);
  }
  async put(key: string, bytes: ArrayBuffer): Promise<void> {
    this.map.set(key, bytes);
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }
}

const KB = 1024;

describe("chunk cache (R-015)", () => {
  it("hit/miss accounting", async () => {
    const b = new MemoryBackend();
    const c = new ChunkCache(b, 1 * 1024 * 1024);
    expect(await c.get("k1")).toBeUndefined();
    await c.put("k1", new ArrayBuffer(100));
    const got = await c.get("k1");
    expect(got).not.toBeUndefined();
    expect(got!.byteLength).toBe(100);
    const s = c.statsSnapshot();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
  });

  it("bounded budget evicts oldest entries (LRU by storedAt)", async () => {
    const b = new MemoryBackend();
    const c = new ChunkCache(b, 10 * KB);
    for (let i = 0; i < 10; i++) {
      await c.put(`old-${i}`, new ArrayBuffer(2 * KB));
    }
    expect((await b.keys()).length).toBeLessThanOrEqual(5);
    expect(await c.get("old-0")).toBeUndefined();
    expect(await c.get("old-9")).not.toBeUndefined();
    expect(c.statsSnapshot().evicted).toBeGreaterThanOrEqual(5);
  });

  it("corrupted entry is dropped and counted as miss, not fatal", async () => {
    const b = new MemoryBackend();
    await b.put("bad", new ArrayBuffer(10));
    b.failOnGet.add("bad");
    const c = new ChunkCache(b, 1024 * 1024);
    expect(await c.get("bad")).toBeUndefined();
    expect(await b.keys()).toEqual([]);
    expect(c.statsSnapshot().misses).toBe(1);
  });

  it("put failure does not throw (bounded resilience)", async () => {
    const b = new MemoryBackend();
    const orig = b.put.bind(b);
    const fail = true;
    b.put = async (k: string, by: ArrayBuffer) => {
      if (fail) throw new Error("quota");
      await orig(k, by);
    };
    const c = new ChunkCache(b, 1024 * 1024);
    await c.put("x", new ArrayBuffer(10));
    expect(c.statsSnapshot().evicted).toBe(1);
  });
});
