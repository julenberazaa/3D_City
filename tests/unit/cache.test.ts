import { describe, expect, it } from "vitest";
import { ChunkCache, type CacheBackend, type CacheRecord } from "../../src/cache/store";

class MemoryBackend implements CacheBackend {
  map = new Map<string, CacheRecord>();
  failOnGet = new Set<string>();
  async get(key: string): Promise<CacheRecord | undefined> {
    if (this.failOnGet.has(key)) throw new Error("corrupt");
    return this.map.get(key);
  }
  async put(key: string, rec: CacheRecord): Promise<void> {
    this.map.set(key, rec);
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }
}

/** Backend that returns keys in REVERSE insertion order (LRU must not depend on order). */
class ReverseOrderBackend extends MemoryBackend {
  async keys(): Promise<string[]> {
    return [...this.map.keys()].reverse();
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

  it("bounded budget evicts oldest entries (true LRU, order-independent backend)", async () => {
    const b = new ReverseOrderBackend();
    const c = new ChunkCache(b, 10 * KB);
    for (let i = 0; i < 10; i++) {
      await c.put(`old-${i}`, new ArrayBuffer(2 * KB));
      await new Promise((r) => setTimeout(r, 2));
    }
    expect((await b.keys()).length).toBeLessThanOrEqual(5);
    expect(await c.get("old-0")).toBeUndefined();
    expect(await c.get("old-9")).not.toBeUndefined();
    expect(c.statsSnapshot().evicted).toBeGreaterThanOrEqual(5);
  });

  it("re-put does not double-count entries or size", async () => {
    const b = new MemoryBackend();
    const c = new ChunkCache(b, 1024 * 1024);
    await c.put("k", new ArrayBuffer(100));
    await c.put("k", new ArrayBuffer(50));
    const s = c.statsSnapshot();
    expect(s.entries).toBe(1);
    expect(s.sizeBytes).toBe(50);
  });

  it("corrupted entry is dropped and counted as miss, not fatal", async () => {
    const b = new MemoryBackend();
    await b.put("bad", { bytes: new ArrayBuffer(10), size: 10, storedAt: Date.now() });
    b.failOnGet.add("bad");
    const c = new ChunkCache(b, 1024 * 1024);
    expect(await c.get("bad")).toBeUndefined();
    expect(await b.keys()).toEqual([]);
    expect(c.statsSnapshot().misses).toBe(1);
  });

  it("byte accounting self-heals after a corrupted read drop (no premature eviction)", async () => {
    const b = new MemoryBackend();
    const c = new ChunkCache(b, 8 * KB);
    await c.put("good", new ArrayBuffer(4 * KB));
    await c.put("bad", new ArrayBuffer(2 * KB));
    b.failOnGet.add("bad");
    await c.get("bad"); // drop + miss; stats.sizeBytes still counts 2KB phantom
    expect(c.statsSnapshot().sizeBytes).toBe(6 * KB); // phantom bytes present
    // Exceed the budget: enforceBudget recomputes from backend ground truth
    // (good 4KB + trigger 4KB = 8KB ≤ budget) so no entry is evicted and the
    // phantom 2KB is gone instead of evicting a live entry.
    await c.put("trigger", new ArrayBuffer(4 * KB));
    const s = c.statsSnapshot();
    expect(s.sizeBytes).toBe(8 * KB);
    expect(s.entries).toBe(2);
    expect(await c.get("good")).not.toBeUndefined();
    expect(await c.get("trigger")).not.toBeUndefined();
  });

  it("concurrent puts never corrupt budget accounting (mutex)", async () => {
    const b = new MemoryBackend();
    const c = new ChunkCache(b, 8 * KB);
    await Promise.all([
      c.put("a", new ArrayBuffer(3 * KB)),
      c.put("b", new ArrayBuffer(3 * KB)),
      c.put("c", new ArrayBuffer(3 * KB)),
      c.put("d", new ArrayBuffer(3 * KB)),
    ]);
    const s = c.statsSnapshot();
    expect(s.sizeBytes).toBeLessThanOrEqual(8 * KB);
    expect(s.entries).toBeLessThanOrEqual(2);
  });

  it("put failure does not throw (bounded resilience)", async () => {
    const b = new MemoryBackend();
    const orig = b.put.bind(b);
    const fail = true;
    b.put = async (k: string, by: CacheRecord) => {
      if (fail) throw new Error("quota");
      await orig(k, by);
    };
    const c = new ChunkCache(b, 1024 * 1024);
    await c.put("x", new ArrayBuffer(10));
    expect(c.statsSnapshot().evicted).toBe(1);
  });
});
