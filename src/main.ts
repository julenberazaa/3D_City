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
import { loadLiveFixture, cacheStats } from "./data/live";
import { createStreamer } from "./stream/streamer";
import { z15Grid } from "./data/fixtureBuilder";
import { buildGazetteerIndex, searchGazetteer, type GazetteerEntry } from "./search/gazetteer";
import { searchOpenMeteo } from "./search/openMeteo";
import { startBenchmark, type BenchmarkSession } from "./bench/benchmark";

export const DEMO_BBOX = "-122.425,37.767,-122.396,37.792";
const MAX_LIVE_CHUNKS = 64;

function parseBbox(raw: string): [number, number, number, number] | null {
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [w, s, e, n] = parts as [number, number, number, number];
  if (!(w >= -180 && e <= 180 && s >= -90 && n <= 90)) return null;
  if (w >= e || s >= n) return null;
  return [w, s, e, n];
}

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
  cache: () => { hits: number; misses: number; evicted: number } | null;
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
  statusEl.classList.toggle("loading", !isError && text.length > 0);
  statusEl.setAttribute("role", isError ? "alert" : "status");
  statusEl.setAttribute("aria-live", isError ? "assertive" : "polite");
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

async function showSearch(): Promise<void> {
  setStatus("");
  const container = document.createElement("div");
  container.className = "search-shell";
  container.innerHTML = `
    <h1>3D City</h1>
    <p class="search-sub">Search any settlement and explore it as a stylized miniature world.</p>
    <input id="place-input" type="search" placeholder="City, town or village…" autocomplete="off" aria-label="Search a place" aria-controls="place-results" aria-activedescendant="" role="combobox" aria-expanded="false" />
    <ul id="place-results" class="place-results" role="listbox" aria-label="Search results"></ul>
    <button id="demo-btn" class="demo-btn">Explore the demo (San Francisco)</button>
    <p class="search-hint">Type a place, use ↑/↓ to choose, Enter to explore. In-game: WASD/arrows drive, R recovers the car, C camera, H HUD.</p>
  `;
  root.appendChild(container);

  const input = container.querySelector<HTMLInputElement>("#place-input")!;
  const resultsEl = container.querySelector<HTMLUListElement>("#place-results")!;
  container.querySelector<HTMLButtonElement>("#demo-btn")!.addEventListener("click", () => {
    window.location.search = "?fixture=sf-downtown";
  });
  input.focus();

  let index: ReturnType<typeof buildGazetteerIndex> | null = null;
  let pendingQuery = "";
  let activeOption = -1;

  const selectOption = (i: number): void => {
    const lis = resultsEl.querySelectorAll("li");
    activeOption = Math.max(-1, Math.min(lis.length - 1, i));
    for (let k = 0; k < lis.length; k++) {
      const li = lis[k]!;
      li.setAttribute("aria-selected", String(k === activeOption));
      li.classList.toggle("selected", k === activeOption);
    }
    const active = lis[activeOption];
    input.setAttribute("aria-activedescendant", active ? active.id : "");
    input.setAttribute("aria-expanded", String(lis.length > 0));
    active?.scrollIntoView({ block: "nearest" });
  };

  const render = (items: { name: string; country: string; admin1: string; population: number; lat: number; lon: number }[]): void => {
    resultsEl.innerHTML = "";
    for (const item of items) {
      const li = document.createElement("li");
      li.id = `place-opt-${items.indexOf(item)}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.tabIndex = -1;
      const label = `${item.name}${item.country ? `, ${item.country}` : ""}${item.admin1 && item.admin1 !== item.country ? ` (${item.admin1})` : ""}`;
      li.textContent = label;
      li.addEventListener("click", () => {
        const d = 0.022;
        window.location.search = `?bbox=${(item.lon - d).toFixed(4)},${(item.lat - d).toFixed(4)},${(item.lon + d).toFixed(4)},${(item.lat + d).toFixed(4)}`;
      });
      resultsEl.appendChild(li);
    }
    activeOption = -1;
    selectOption(-1);
  };

  async function runSearch(q: string): Promise<void> {
    if (q.length < 2) {
      resultsEl.innerHTML = "";
      return;
    }
    if (!index) {
      pendingQuery = q;
      return;
    }
    let items = searchGazetteer(index, q, 6);
    if (items.length === 0) {
      items = await searchOpenMeteo(q, 6);
    }
    render(items);
  }

  void (async () => {
    try {
      const res = await fetch("/fixtures/gazetteer.json");
      if (res.ok) {
        const raw = (await res.json()) as { entries: GazetteerEntry[] };
        index = buildGazetteerIndex(raw.entries);
        if (pendingQuery) void runSearch(pendingQuery);
      }
    } catch {
      index = null;
    }
  })();

  let debounce = 0;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    debounce = window.setTimeout(() => {
      void runSearch(q);
    }, 180);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectOption(activeOption + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectOption(activeOption - 1);
    } else if (e.key === "Enter") {
      const li = resultsEl.querySelectorAll("li")[Math.max(0, activeOption)];
      li?.dispatchEvent(new MouseEvent("click"));
    } else if (e.key === "Escape") {
      selectOption(-1);
    }
  });
}

async function boot(): Promise<void> {
  try {
    const t0 = performance.now();
    await rapierInit();
    const params = new URLSearchParams(window.location.search);
    const bboxParam = params.get("bbox");
    if (!bboxParam && !params.get("fixture")) {
      void showSearch();
      return;
    }
    let fixture: WorldFixture;
    let sourceLabel = "fixture";
    if (params.get("fixture")) {
      fixture = prepareFixture(await loadFixture());
      sourceLabel = "fixture";
    } else if (bboxParam) {
      const bbox = parseBbox(bboxParam);
      if (!bbox) throw new Error("invalid ?bbox=w,s,e,n (expected w<s? e>w, s<n, within ±180/±90)");
      const grid = z15Grid(bbox);
      const chunkCount = (grid.xMax - grid.xMin + 1) * (grid.yMax - grid.yMin + 1);
      if (chunkCount > MAX_LIVE_CHUNKS) throw new Error(`bbox too large (${chunkCount} chunks > ${MAX_LIVE_CHUNKS})`);
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
      bench?.recordActivated(key);
    };
    streamer.onChunkBuilt = (key, ms) => {
      bench?.recordGen(key, ms);
    };

    let bench: BenchmarkSession | null = null;
    const benchParams = params.get("benchmark");
    if (benchParams) {
      const seconds = Number(params.get("bench_seconds") ?? 300);
      const dist = Number(params.get("bench_dist") ?? 5000);
      const roadSegs: Array<{ ax: number; az: number; bx: number; bz: number }> = [];
      for (const c of fixture.roads) {
        for (const f of c.features) {
          const line = f.line;
          if (!line || line.length < 2) continue;
          for (let i = 0; i < line.length - 1; i++) {
            roadSegs.push({ ax: line[i]![0], az: line[i]![1], bx: line[i + 1]![0], bz: line[i + 1]![1] });
          }
        }
      }
      bench = startBenchmark(
        { seconds: Number.isFinite(seconds) ? seconds : 300, dist: Number.isFinite(dist) ? dist : 5000 },
        {
          renderer: render,
          streamer,
          car: vehicle,
          controls,
          startPos: { x: spawn.x, z: spawn.z },
          worldLabel: `${fixture.manifest.name} (${sourceLabel})`,
          worldLoadMs: Math.round(performance.now() - t0),
          origin: fixture.manifest.origin,
          roadSegs,
          relocate: (pos, heading) => {
            const fx = Math.sin(heading);
            const fz = Math.cos(heading);
            const target = findSpawnPoint(fixture.roads, fixture.terrain, fixture, {
              x: pos.x + fx * 600,
              z: pos.z + fz * 600,
            });
            vehicle.reset(target);
            latestCarPos.set(target.x, target.y, target.z);
          },
        },
      );
    }
    window.addEventListener("error", (e) => {
      bench?.recordError(`window:${e.message}`);
    });
    window.addEventListener("unhandledrejection", (e) => {
      bench?.recordError(`unhandledrejection:${String(e.reason)}`);
    });

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
      if (e.key.toLowerCase() === "r") {
        const spawn2 = findSpawnPoint(fixture.roads, fixture.terrain, fixture, latestCarPos);
        vehicle.reset(spawn2);
        latestCarPos.set(spawn2.x, spawn2.y, spawn2.z);
        setStatus("Recovered");
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
      cache: () => {
        const s = cacheStats();
        return s ? { hits: s.hits, misses: s.misses, evicted: s.evicted } : null;
      },
      stream: () => {
        const s = streamer.counters();
        const p = streamer.physicsStats();
        return { active: s.active, queued: s.queued, fetching: s.fetching, generating: s.generating, cancelled: s.cancelled, physicsChunks: p.chunks };
      },
    };

    let accumulator = 0;
    let benchElapsed = 0;
    render.startRender(orbit.camera, (dt) => {
      benchElapsed += dt;
      accumulator = Math.min(accumulator + dt, FIXED_STEP * MAX_SUBSTEPS);
      vehicle.setThrottle(controls.throttle);
      vehicle.setSteer(controls.steer);
      vehicle.setBrake(controls.brake);
      if (bench) bench.tick(dt, benchElapsed);
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
          latestCarPos.x - fwd.x * 26,
          latestCarPos.y + 12,
          latestCarPos.z - fwd.z * 26,
        );
        orbit.camera.lookAt(
          latestCarPos.x + fwd.x * 16,
          latestCarPos.y + 2.5,
          latestCarPos.z + fwd.z * 16,
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
