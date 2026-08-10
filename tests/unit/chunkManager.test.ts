import { describe, expect, it } from "vitest";
import { ChunkManager, chunkKeyOf, chunkPriority, chunkCenter, DEFAULT_STREAM_CONFIG } from "../../src/stream/chunkManager";

const ORIGIN = { x: -13626674.53, y: 4548323.37 };
const player = { x: 0, z: 0, heading: 0, speed: 0 };
const cfg = { ...DEFAULT_STREAM_CONFIG, origin: ORIGIN };

function drive(m: ChunkManager, p = player): string[] {
  return m.update(p).filter((a) => a.action === "load").map((a) => a.key);
}

describe("chunk manager", () => {
  it("activates the chunk containing the player first", () => {
    const m = new ChunkManager({ ...cfg, prefetchRadius: 600 });
    const keys = drive(m);
    expect(keys).toContain(chunkKeyOf(ORIGIN, 0, 0));
    expect(keys.length).toBeGreaterThan(0);
  });

  it("bounded queue: maxQueued respected", () => {
    const m = new ChunkManager({ ...cfg, prefetchRadius: 4000, maxQueued: 5 });
    const keys = drive(m);
    expect(keys.length).toBeLessThanOrEqual(5);
    expect(m.countersSnapshot().queued).toBeLessThanOrEqual(5);
  });

  it("priority: forward chunks load before rear chunks at equal distance", () => {
    // Player at the CENTER of tile 5241/12665 (local x/z from chunkCenter), so
    // the north and south neighbor tiles are exactly one tile away.
    const selfKey = chunkKeyOf(ORIGIN, 0, 0);
    const c = chunkCenter(ORIGIN, selfKey);
    const p = { x: c.x, z: c.z, heading: 0, speed: 20 };
    const [tx, ty] = selfKey.split("/").map(Number);
    const north = chunkPriority(ORIGIN, `${tx}/${ty - 1}`, p);
    const south = chunkPriority(ORIGIN, `${tx}/${ty + 1}`, p);
    expect(north).toBeGreaterThan(south);
  });

  it("lifecycle: queued → fetching → generating → active", () => {
    const m = new ChunkManager({ ...cfg, prefetchRadius: 600, maxConcurrentFetch: 1, maxConcurrentGenerate: 1 });
    const keys = drive(m);
    expect(keys.length).toBeGreaterThan(0);
    const key = keys[0]!;
    expect(m.state(key)).toBe("fetching");
    m.setState(key, "fetching", "generating");
    expect(m.state(key)).toBe("generating");
    m.setState(key, "generating", "active");
    expect(m.state(key)).toBe("active");
    expect(m.countersSnapshot().active).toBeGreaterThan(0);
  });

  it("eviction: chunks beyond prefetch radius unload", () => {
    const m = new ChunkManager({ ...cfg, prefetchRadius: 1000, maxQueued: 100 });
    const keys = drive(m);
    const key = keys.find((k) => k !== chunkKeyOf(ORIGIN, 0, 0))!;
    m.setState(key, "fetching", "generating");
    m.setState(key, "generating", "active");
    // Teleport far away: everything should evict.
    const far = { x: 50000, z: 50000, heading: 0, speed: 0 };
    const actions = m.update(far);
    expect(actions.some((a) => a.action === "unload")).toBe(true);
    expect(m.countersSnapshot().active).toBe(0);
  });

  it("cancellation: in-flight job discarded when chunk leaves the desired set", () => {
    const m = new ChunkManager({ ...cfg, prefetchRadius: 1000, maxQueued: 100 });
    drive(m);
    m.update({ x: 50000, z: 50000, heading: 0, speed: 0 });
    expect(m.countersSnapshot().cancelled).toBeGreaterThan(0);
    expect(m.countersSnapshot().active).toBe(0);
  });

  it("boundary crossing: driving across a tile edge changes the active set", () => {
    const m = new ChunkManager({ ...cfg, prefetchRadius: 500, maxQueued: 100 });
    const near = new Set(drive(m));
    const p2 = { x: 1500, z: 1500, heading: 0, speed: 0 };
    const actions2 = m.update(p2);
    const farSet = new Set(actions2.filter((a) => a.action === "load").map((a) => a.key));
    expect([...farSet].some((k) => !near.has(k))).toBe(true);
    expect(actions2.some((a) => a.action === "unload")).toBe(true);
  });

  it("chunkCenter is consistent with chunkKeyOf", () => {
    const key = chunkKeyOf(ORIGIN, 0, 0);
    const c = chunkCenter(ORIGIN, key);
    // The point (0,0) must lie INSIDE its own tile (one tile spans ±611 m).
    expect(Math.abs(c.x)).toBeLessThan(1223);
    expect(Math.abs(c.z)).toBeLessThan(1223);
  });

  it("counter bookkeeping stays consistent across a full cycle", () => {
    const m = new ChunkManager({ ...cfg, prefetchRadius: 800, maxQueued: 50 });
    const keys = drive(m);
    for (const k of keys) {
      m.setState(k, "fetching", "generating");
      m.setState(k, "generating", "active");
    }
    const c = m.countersSnapshot();
    expect(c.fetching).toBe(0);
    expect(c.generating).toBe(0);
    expect(c.active).toBe(keys.length);
  });
});
