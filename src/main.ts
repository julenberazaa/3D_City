import "./style.css";
import * as THREE from "three";
import { init as rapierInit } from "@dimforge/rapier3d-compat";
import { buildWorld, type ChunkRecord, type ChunkTerrain, type WorldFixture, type WorldModel } from "./world/generator";
import { createOrbitCamera } from "./render/camera";
import { createRenderer } from "./render/renderer";
import { createPhysicsWorld, findSpawnPoint } from "./physics/world";
import { createCar } from "./physics/vehicle";
import { createCarVisual } from "./render/car";
import { createControls } from "./input/controls";

const FIXTURE = "sf-downtown";
const BASE = `/fixtures/${FIXTURE}`;

const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 12;

interface ChunkTerrainFile {
  chunks: ChunkTerrain[];
}

interface GameDebugHandle {
  carPos: () => { x: number; y: number; z: number };
  speedKmh: () => number;
  status: () => string;
  colliders: () => { terrain: number; buildings: number };
  wheels: () => number;
}

declare global {
  interface Window {
    __game?: GameDebugHandle;
  }
}

const root = document.getElementById("app")!;
const statusEl = document.getElementById("status")!;
const hudEl = document.getElementById("hud")!;

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

async function loadJson<T>(path: string, stage: string): Promise<T> {
  setStatus(stage);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`fetch ${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function loadFixture(): Promise<WorldFixture> {
  const manifest = await loadJson<WorldFixture["manifest"]>(`${BASE}/manifest.json`, "Resolving fixture");
  const terrain = await loadJson<ChunkTerrainFile>(`${BASE}/terrain.json`, "Loading terrain");
  const chunkFile = (path: string) =>
    loadJson<{ chunks: ChunkRecord[] }>(path, "Loading buildings/roads").then((f) => f.chunks);
  const [buildings, roads, water, landcover] = await Promise.all([
    chunkFile(`${BASE}/buildings.json`),
    chunkFile(`${BASE}/roads.json`),
    chunkFile(`${BASE}/water.json`),
    chunkFile(`${BASE}/landcover.json`),
  ]);
  return { manifest, terrain: terrain.chunks, buildings, roads, water, landcover };
}

function attachWorld(scene: THREE.Scene, world: WorldModel): void {
  for (const group of world.groups.terrain.values()) scene.add(group);
  for (const group of world.groups.roads.values()) scene.add(group);
  for (const group of world.groups.water.values()) scene.add(group);
  for (const group of world.groups.landcover.values()) scene.add(group);
  for (const group of world.groups.buildings.values()) scene.add(group);
}

async function boot(): Promise<void> {
  try {
    await rapierInit();
    const fixture = await loadFixture();
    setStatus("Generating world");
    const world = buildWorld(fixture);
    setStatus("Preparing physics");
    const physics = createPhysicsWorld(fixture);
    const spawn = findSpawnPoint(fixture.roads, fixture.terrain, fixture);
    const vehicle = createCar(physics.world, spawn);
    setStatus("Ready");

    const render = createRenderer();
    render.renderer.domElement.id = "game-canvas";
    root.appendChild(render.renderer.domElement);
    const orbit = createOrbitCamera(new THREE.Vector3(spawn.x, spawn.y, spawn.z));

    const car = createCarVisual();
    render.scene.add(car.group);
    const controls = createControls(root);

    let followMode = true;
    const latestCarPos = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    let latestSpeedKmh = 0;
    let latestWheels = 0;
    const status = "Ready";

    const resize = () => {
      render.resize(window.innerWidth, window.innerHeight);
      orbit.camera.aspect = window.innerWidth / window.innerHeight;
      orbit.camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    attachWorld(render.scene, world);

    const fmt = (n: number) => n.toLocaleString("en-US");
    const updateHud = () => {
      const stats = render.getStats();
      hudEl.textContent = [
        `${fixture.manifest.name} fixture`,
        `buildings: ${fmt(world.counts.buildings)}   roads: ${fmt(world.counts.roads)}   water: ${fmt(world.counts.waterPolys)}`,
        `triangles: ${fmt(stats.triangles)}   draw calls: ${fmt(stats.drawCalls)}`,
        `physics: terrain ${physics.stats.terrainChunks} / buildings ${physics.stats.buildings}   wheels ${latestWheels}/4   ${latestSpeedKmh.toFixed(0)} km/h`,
        `camera: ${followMode ? "follow (c)" : "orbit (c)"}   HUD: h`,
      ].join("\n");
    };
    hudEl.hidden = false;
    updateHud();
    window.setInterval(updateHud, 500);

    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "h") hudEl.hidden = !hudEl.hidden;
      if (e.key.toLowerCase() === "c") {
        followMode = !followMode;
        if (followMode) orbit.detach();
        else orbit.attach(render.renderer.domElement);
      }
    });

    window.__game = {
      carPos: () => ({ x: latestCarPos.x, y: latestCarPos.y, z: latestCarPos.z }),
      speedKmh: () => latestSpeedKmh,
      status: () => status,
      colliders: () => ({ terrain: physics.stats.terrainChunks, buildings: physics.stats.buildings }),
      wheels: () => latestWheels,
    };

    let accumulator = 0;
    render.startRender(orbit.camera, (dt) => {
      accumulator = Math.min(accumulator + dt, FIXED_STEP * MAX_SUBSTEPS);
      vehicle.setThrottle(controls.throttle);
      vehicle.setSteer(controls.steer);
      vehicle.setBrake(controls.brake);
      while (accumulator >= FIXED_STEP) {
        vehicle.update(FIXED_STEP);
        physics.world.step();
        accumulator -= FIXED_STEP;
      }
      const t = vehicle.transform();
      car.sync(t);
      latestCarPos.set(t.position.x, t.position.y, t.position.z);
      latestSpeedKmh = vehicle.speedKmh();
      latestWheels = vehicle.wheelsInContact();
      if (followMode) {
        const fwd = vehicle.forward();
        orbit.camera.position.set(
          latestCarPos.x - fwd.x * 40,
          latestCarPos.y + 30,
          latestCarPos.z - fwd.z * 40,
        );
        orbit.camera.lookAt(
          latestCarPos.x + fwd.x * 12,
          latestCarPos.y + 2,
          latestCarPos.z + fwd.z * 12,
        );
      }
    });
  } catch (err) {
    setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
  }
}

void boot();
