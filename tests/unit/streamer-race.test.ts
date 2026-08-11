import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { init as rapierInit } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { createStreamer } from "../../src/stream/streamer";
import { createStreamingPhysicsWorld } from "../../src/physics/world";
import { chunkKeyOf } from "../../src/stream/chunkManager";
import { readFixture } from "./fixture-helper";
import type { WorldFixture } from "../../src/world/generator";

const realRaf = globalThis.requestAnimationFrame;
let fixture: WorldFixture;

beforeAll(async () => {
  await rapierInit();
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0)) as unknown as typeof requestAnimationFrame;
  fixture = readFixture("sf-downtown");
});

afterAll(() => {
  globalThis.requestAnimationFrame = realRaf;
});

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 300));

describe("streamer async build race safety", () => {
  it("evict→re-activate→evict race never leaks a zombie scene group", async () => {
    const pw = createStreamingPhysicsWorld(fixture);
    const scene = new THREE.Scene();
    const streamer = createStreamer(scene, pw, fixture);
    const origin = fixture.manifest.origin;
    void origin;
    const player = { x: 0, z: 0, heading: 0, speed: 0 };
    const far = { x: 40000, z: 40000, heading: 0, speed: 0 };

    // Baseline: settle at the far area; count scene groups.
    for (let i = 0; i < 8; i++) {
      streamer.update(far);
      await flush();
    }
    const farClean = scene.children.length;
    expect(farClean).toBeGreaterThan(0);

    // Race: queue build for the player chunk, evict it, re-queue it (a NEW
    // build starts) — all in one synchronous burst, so the FIRST build's
    // completion callback fires while the SECOND build still owns the slot.
    streamer.update(player); // build #1 starts
    streamer.update(far); // evict: cancel #1, pending record deleted
    streamer.update(player); // re-queue: build #2 starts, new record created
    // Let only ONE macrotask run: build #1's cancelled callback fires now
    // (under the bug it deletes build #2's pending record); build #2 is still
    // mid-flight (it needs many more turns to finish).
    await new Promise((r) => setTimeout(r, 0));
    // Leave again while build #2 is in flight: with the fix it is cancelled
    // here; without the fix its pending record is gone, so it keeps running
    // and completes into the scene as an untracked zombie group.
    streamer.update(far);
    await flush();
    // Settle at far WITHOUT ever returning to the origin chunk.
    for (let i = 0; i < 8; i++) {
      streamer.update(far);
      await flush();
    }
    expect(scene.children.length).toBe(farClean);
    // Sanity: re-entering the origin chunk still works after the race.
    for (let i = 0; i < 8; i++) {
      streamer.update(player);
      await flush();
    }
    expect(scene.children.length).toBeGreaterThan(farClean);
  });

  it("build failure releases the chunk slot (no black hole)", async () => {
    const pw = createStreamingPhysicsWorld(fixture);
    const scene = new THREE.Scene();
    const streamer = createStreamer(scene, pw, fixture);
    const player = { x: 0, z: 0, heading: 0, speed: 0 };
    streamer.update(player);
    // Force a genuine build failure: null the terrain heights of the contained
    // chunk (the mesh builder then throws a TypeError).
    const origin = fixture.manifest.origin;
    const key = chunkKeyOf(origin, 0, 0);
    const [tx, ty] = key.split("/").map(Number);
    const terr = fixture.terrain.find((c) => c.x === tx && c.y === ty);
    const saved = terr?.heights;
    if (terr) terr.heights = null as unknown as number[][];
    await flush();
    await flush();
    // The chunk must not be stuck in "generating": the failure handler moved
    // it to "evicted" so the manager can re-queue it later.
    expect(streamer.state(key)).not.toBe("generating");
    // Restore and re-enter: the chunk must load again (slot was released).
    if (terr && saved) terr.heights = saved;
    for (let i = 0; i < 8; i++) {
      streamer.update(player);
      await flush();
    }
    expect(streamer.state(key)).toBe("active");
  });
});
