import "./style.css";
import type * as THREE from "three";
import { buildWorld, type ChunkRecord, type ChunkTerrain, type WorldFixture, type WorldModel } from "./world/generator";
import { createOrbitCamera } from "./render/camera";
import { createRenderer } from "./render/renderer";

const FIXTURE = "sf-downtown";
const BASE = `/fixtures/${FIXTURE}`;

interface ChunkTerrainFile {
  chunks: ChunkTerrain[];
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
    const fixture = await loadFixture();
    setStatus("Generating world");
    const world = buildWorld(fixture);
    setStatus("Ready");

    const render = createRenderer();
    render.renderer.domElement.id = "game-canvas";
    root.appendChild(render.renderer.domElement);
    const orbit = createOrbitCamera();
    orbit.attach(render.renderer.domElement);

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
        `provenance: OBSERVED ${fmt(world.provenance.observed)} / DERIVED ${fmt(world.provenance.derived)} / INFERRED ${fmt(world.provenance.inferred)}`,
      ].join("\n");
    };
    hudEl.hidden = false;
    updateHud();
    window.setInterval(updateHud, 500);

    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "h") hudEl.hidden = !hudEl.hidden;
    });

    render.startRender(orbit.camera);
  } catch (err) {
    setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
  }
}

void boot();
