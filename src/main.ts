import "./style.css";
import * as THREE from "three";
import { init as rapierInit } from "@dimforge/rapier3d-compat";
import { type ChunkRecord, type ChunkTerrain, type WorldFixture } from "./world/generator";
import { createOrbitCamera } from "./render/camera";
import { createRenderer } from "./render/renderer";
import { createStreamingPhysicsWorld, findSpawnPoint } from "./physics/world";
import { createCar } from "./physics/vehicle";
import { createCarVisual } from "./render/car";
import { createControls } from "./input/controls";
import { prepareFixture, sampleTerrain } from "./geo/fusion";
import { loadLiveFixture } from "./data/live";
import { createStreamer } from "./stream/streamer";

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
  headingRad: () => number;
  groundHeight: () => number;
  stream: () => { active: number; queued: number; fetching: number; generating: number; cancelled: number; physicsChunks: number };
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

async function boot(): Promise<void> {
  try {
    await rapierInit();
    const params = new URLSearchParams(window.location.search);
    const bboxParam = params.get("bbox");
    let fixture: WorldFixture;
    let sourceLabel = "fixture";
    if (bboxParam) {
      const bbox = bboxParam.split(",").map(Number) as [number, number, number, number];
      if (bbox.length !== 4 || !bbox.every(Number.isFinite)) throw new Error("invalid ?bbox=w,s,e,n");
      setStatus("Loading live geography");
      fixture = await loadLiveFixture(bbox, (p) => {
        if (p.stage === "terrain") setStatus(`Loading terrain ${Math.min(p.done + 1, p.total)}/${p.total}`);
        else setStatus("Loading tiles");
      });
      sourceLabel = "live";
    } else {
      fixture = prepareFixture(await loadFixture());
    }
    setStatus("Generating world");

    const physics = createStreamingPhysicsWorld(fixture);
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
    const streamer = createStreamer(render.scene, physics, fixture);
    streamer.onChunkActivated = (key) => {
      // first activation: snap HUD data
      void key;
    };

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

    const fmt = (n: number) => n.toLocaleString("en-US");
    const updateHud = () => {
      const stats = render.getStats();
      const stream = streamer.counters();
      const active = streamer.activeCounts();
      const prov = streamer.activeProvenance();
      const pstat = streamer.physicsStats();
      hudEl.textContent = [
        `${fixture.manifest.name} (${sourceLabel})`,
        `chunks: ${stream.active} active | q ${stream.queued} / f ${stream.fetching} / g ${stream.generating} | cancelled ${stream.cancelled}`,
        `buildings: ${fmt(active.buildings)}   roads: ${fmt(active.roads)}   water: ${fmt(active.waterPolys)}`,
        `triangles: ${fmt(stats.triangles)}   draw calls: ${fmt(stats.drawCalls)}   physics: ${pstat.chunks} chunks / ${fmt(pstat.buildings)} buildings`,
        `provenance: obs ${fmt(prov.observed)} / der ${fmt(prov.derived)} / inf ${fmt(prov.inferred)}`,
        `wheels ${latestWheels}/4   ${latestSpeedKmh.toFixed(0)} km/h   camera: ${followMode ? "follow (c)" : "orbit (c)"}   HUD: h`,
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
      colliders: () => {
        const p = streamer.physicsStats();
        return { terrain: p.chunks, buildings: p.buildings };
      },
      wheels: () => latestWheels,
      headingRad: () => vehicle.headingRad(),
      groundHeight: () => sampleTerrain(fixture.terrain, latestCarPos.x, latestCarPos.z),
      stream: () => {
        const s = streamer.counters();
        const p = streamer.physicsStats();
        return { active: s.active, queued: s.queued, fetching: s.fetching, generating: s.generating, cancelled: s.cancelled, physicsChunks: p.chunks };
      },
    };

    let accumulator = 0;
    render.startRender(orbit.camera, (dt) => {
      accumulator = Math.min(accumulator + dt, FIXED_STEP * MAX_SUBSTEPS);
      vehicle.setThrottle(controls.throttle);
      vehicle.setSteer(controls.steer);
      vehicle.setBrake(controls.brake);
      const fwd = vehicle.forward();
      streamer.update({
        x: latestCarPos.x,
        z: latestCarPos.z,
        heading: vehicle.headingRad(),
        speed: vehicle.speedKmh() / 3.6,
      });
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
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("network:")) {
      setStatus("Network unavailable - live sources unreachable. Check connection or use the demo world.", true);
    } else {
      setStatus(`Error: ${msg}`, true);
    }
  }
}

void boot();
