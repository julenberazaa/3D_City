import { describe, expect, it, beforeAll } from "vitest";
import {
  Ray,
  RigidBodyDesc,
  World,
} from "@dimforge/rapier3d-compat";
import { createPhysicsWorld, findSpawnPoint, terrainColliderFor } from "../../src/physics/world";
import { createCar } from "../../src/physics/vehicle";
import type { ChunkTerrain, WorldFixture } from "../../src/world/generator";
import { readFixture } from "./fixture-helper";

let fixture: WorldFixture;

beforeAll(() => {
  fixture = readFixture("sf-downtown");
});

function raycastHeight(world: World, x: number, z: number): number | null {
  const ray = new Ray({ x, y: 1000, z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, 2000, true, undefined);
  if (hit === null) return null;
  return 1000 - hit.timeOfImpact;
}

describe("physics world (rapier)", () => {
  it("initializes rapier WASM", async () => {
    const RAPIER = await import("@dimforge/rapier3d-compat");
    await RAPIER.init();
    expect(RAPIER.version()).toBeTruthy();
  });

  it("heightfield collider convention: synthetic 3x3 peak is hit where expected", () => {
    const world = new World({ x: 0, y: -9.81, z: 0 });
    const c: ChunkTerrain = {
      z: 15,
      x: 1,
      y: 1,
      originX: 0,
      originY: 0,
      size: 3,
      stepMeters: 10,
      heights: [
        [0, 0, 0],
        [0, 10, 0],
        [0, 0, 0],
      ],
    };
    terrainColliderFor(world, c);
    world.step();
    const o = 0.2;
    expect(raycastHeight(world, 10, -10)).toBeCloseTo(10, 1);
    for (const [x, z] of [
      [o, -o],
      [20 - o, -o],
      [o, -20 + o],
      [20 - o, -20 + o],
    ] as Array<[number, number]>) {
      const v = raycastHeight(world, x, z);
      expect(v).not.toBeNull();
      expect(v!).toBeLessThan(2.5);
    }
    expect(raycastHeight(world, -10, -10)).toBeNull();
    expect(raycastHeight(world, 10, 5)).toBeNull();
  });

  it("heightfield ramp: surface matches bilinear model of the mesh grid", () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    const n = 5;
    const step = 10;
    const heights: number[][] = [];
    for (let j = 0; j < n; j++) {
      heights.push([]);
      for (let i = 0; i < n; i++) {
        heights[j]!.push(j * 100 + i);
      }
    }
    const c: ChunkTerrain = { z: 15, x: 1, y: 1, originX: 0, originY: 0, size: n, stepMeters: step, heights };
    terrainColliderFor(world, c);
    world.step();

    // post (j,i) sits at world (i*step, -j*step); expected surface = bilinear blend.
    const expected = (px: number, pz: number): number => {
      const fx = px / step;
      const fz = -pz / step;
      const i0 = Math.min(n - 2, Math.floor(fx));
      const j0 = Math.min(n - 2, Math.floor(fz));
      const tx = fx - i0;
      const tz = fz - j0;
      const h00 = heights[j0]![i0]!;
      const h10 = heights[j0 + 1]![i0]!;
      const h01 = heights[j0]![i0 + 1]!;
      const h11 = heights[j0 + 1]![i0 + 1]!;
      return (
        h00 * (1 - tx) * (1 - tz) +
        h10 * (1 - tx) * tz +
        h01 * tx * (1 - tz) +
        h11 * tx * tz
      );
    };
    const probe = (px: number, pz: number): number | null => {
      const ray = new Ray({ x: px, y: 2000, z: pz }, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(ray, 4000, false);
      return hit ? 2000 - hit.timeOfImpact : null;
    };
    for (const [px, pz] of [
      [0.2, -0.2],
      [2.5, -2.5],
      [10.2, -10.2],
      [17.3, -29.9],
      [25, -15],
      [39.5, -0.5],
      [0.5, -39.5],
    ] as Array<[number, number]>) {
      const got = probe(px, pz);
      expect(got, `surface at (${px},${pz})`).not.toBeNull();
      expect(got!, `surface at (${px},${pz})`).toBeCloseTo(expected(px, pz), 0);
    }
    expect(probe(-0.5, -10)).toBeNull();
    expect(probe(10, 5)).toBeNull();
    expect(probe(45, -10)).toBeNull();
    expect(probe(10, -45)).toBeNull();
  });

  it("real fixture: 16 terrain colliders, building colliders stable count", () => {
    const pw = createPhysicsWorld(fixture);
    expect(pw.stats.terrainChunks).toBe(16);
    expect(pw.stats.buildings).toBeGreaterThan(3000);
    expect(pw.stats.buildings).toBeLessThan(14005);
    expect(pw.buildingColliders.length).toBe(pw.stats.buildings);
  });

  it("real fixture: raycast matches bilinear terrain inside the chunk", () => {
    const pw = createPhysicsWorld(fixture);
    pw.world.step();
    const c = fixture.terrain[0];
    const step = c.stepMeters;
    const px = c.originX + 0.25 * step;
    const pz = c.originY - 0.75 * step;
    const fx = 0.25;
    const fz = 0.75;
    const h00 = c.heights[0]![0]!;
    const h10 = c.heights[1]![0]!;
    const h01 = c.heights[0]![1]!;
    const h11 = c.heights[1]![1]!;
    const expected =
      h00 * (1 - fx) * (1 - fz) + h10 * (1 - fx) * fz + h01 * fx * (1 - fz) + h11 * fx * fz;
    const h = raycastHeight(pw.world, px, pz);
    expect(h).not.toBeNull();
    expect(h!).toBeCloseTo(expected, 0);
    expect(Math.abs(h! - expected)).toBeLessThan(0.75);
  });

  it("raycast from above downtown buildings hits building roofs, not the ground", () => {
    const pw = createPhysicsWorld(fixture);
    pw.world.step();
    let hitRoof = 0;
    for (const b of pw.buildingColliders.slice(0, 200)) {
      const t = b.translation();
      const h = raycastHeight(pw.world, t.x, t.z);
      const he = b.halfExtents();
      if (he !== null && h !== null && h > t.y + he.y - 1) hitRoof++;
    }
    expect(hitRoof).toBeGreaterThan(150);
  });
});

describe("vehicle", () => {
  function spawnPoint(): { x: number; y: number; z: number; heading: number } {
    return findSpawnPoint(fixture.roads, fixture.terrain, fixture);
  }

  it("calibration: throttle forward drives along heading, wheels stay in contact, no NaN", () => {
    const pw = createPhysicsWorld(fixture);
    pw.world.step();
    const s = spawnPoint();
    const car = createCar(pw.world, s);

    car.setThrottle(1);
    for (let i = 0; i < 120; i++) {
      car.update(1 / 60);
      pw.world.step();
    }
    const pos = car.position();
    expect(car.wheelsInContact()).toBeGreaterThanOrEqual(2);
    const fwd = car.forward();
    const moved = (pos.x - s.x) * fwd.x + (pos.z - s.z) * fwd.z;
    expect(moved).toBeGreaterThan(1);
    expect(car.speedKmh()).toBeGreaterThan(1);

    for (let i = 0; i < 600; i++) {
      car.update(1 / 60);
      pw.world.step();
    }
    const p2 = car.position();
    const q = car.body.rotation();
    for (const v of [p2.x, p2.y, p2.z, q.x, q.y, q.z, q.w]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("steering changes heading", () => {
    const pw = createPhysicsWorld(fixture);
    pw.world.step();
    const s = spawnPoint();
    const car = createCar(pw.world, s);
    const h0 = car.headingRad();
    car.setThrottle(1);
    car.setSteer(1);
    for (let i = 0; i < 240; i++) {
      car.update(1 / 60);
      pw.world.step();
    }
    const h1 = car.headingRad();
    expect(Math.abs(h1 - h0)).toBeGreaterThan(0.02);
  });

  it("vehicle controller API works at runtime", () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    const body = world.createRigidBody(RigidBodyDesc.dynamic().setTranslation(0, 0, 0));
    const v = world.createVehicleController(body);
    expect(v.numWheels()).toBe(0);
    v.addWheel(
      { x: 0, y: 0, z: 1 } as never,
      { x: 0, y: -1, z: 0 } as never,
      { x: 1, y: 0, z: 0 } as never,
      0.4,
      0.3,
    );
    expect(v.numWheels()).toBe(1);
    expect(v.wheelIsInContact(0)).toBe(false);
    world.removeVehicleController(v);
  });
});
