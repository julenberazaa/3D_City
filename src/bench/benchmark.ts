import type { RendererHandle } from "../render/renderer";
import type { StreamerHandle } from "../stream/streamer";
import { chunkCenter } from "../stream/chunkManager";
import { tileSizeMeters } from "../geo/projection";
import { cacheStats } from "../data/live";
import type { Car } from "../physics/vehicle";
import type { ControlsState } from "../input/controls";
import type { WebGLRenderer } from "three";

export interface BenchmarkParams {
  seconds: number;
  dist: number;
}

export interface BenchmarkResult {
  startedAt: string;
  durationSec: number;
  stoppedBy: "time" | "distance";
  renderer: string;
  vendor: string;
  webglVersion: string;
  userAgent: string;
  platform: string;
  hardwareConcurrency: number;
  devicePixelRatio: number;
  finalPixelRatio: number;
  viewport: { width: number; height: number };
  worldLabel: string;
  worldLoadMs: number;
  frames: {
    count: number;
    fpsMedian: number;
    fpsMin: number;
    frameMs: { p50: number; p95: number; p99: number; max: number };
    longFrames50ms: number;
    severeStalls250ms: number;
    stallTimesMs: number[];
  };
  distance: { totalM: number; drivenM: number; teleportedM: number; maxSpeedKmh: number; avgSpeedKmh: number };
  render: { drawCalls: { p50: number; p95: number }; triangles: { p50: number; p95: number }; geometries: number; textures: number };
  stream: {
    activeMax: number;
    queuedMax: number;
    fetchingMax: number;
    generatingMax: number;
    cancelled: number;
    activated: number;
    evicted: number;
    lateChunks: number;
    genMs: { p50: number; p95: number; max: number; count: number };
  };
  autopilot: { recoveries: number; maxStallSec: number; relocations: number };
  physics: { chunksMax: number; buildingsMax: number };
  cache: { hits: number; misses: number; evicted: number; hitRate: number | null };
  heap: { usedMBMax: number; usedMBFinal: number; samples: number };
  errors: { count: number; messages: string[] };
}

export interface BenchmarkDeps {
  renderer: RendererHandle;
  streamer: StreamerHandle;
  car: Car;
  controls: ControlsState;
  startPos: { x: number; z: number };
  worldLabel: string;
  worldLoadMs: number;
  origin: { x: number; y: number };
  /** Local-coordinate road segments (ax,az)->(bx,bz) for the road-following cruise phase. */
  roadSegs: Array<{ ax: number; az: number; bx: number; bz: number }>;
  /** Teleport the car to a safe road point near (pos + heading*300m). Player-equivalent of pressing R after getting wedged. */
  relocate: (pos: { x: number; z: number }, heading: number) => void;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface BenchmarkSession {
  result(): BenchmarkResult | null;
  tick(dt: number, elapsedSec: number): void;
  recordGen(key: string, ms: number): void;
  recordActivated(key: string): void;
  recordError(msg: string): void;
  finish(stoppedBy: "time" | "distance"): void;
  get done(): boolean;
}

function rendererInfo(renderer: WebGLRenderer): { renderer: string; vendor: string; webgl: string } {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "unavailable",
      vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : "unavailable",
      webgl: String(gl.getParameter(gl.VERSION)),
    };
  } catch {
    return { renderer: "unavailable", vendor: "unavailable", webgl: "unavailable" };
  }
}

export function startBenchmark(params: BenchmarkParams, deps: BenchmarkDeps): BenchmarkSession {
  const frameMs: number[] = [];
  const drawCalls: number[] = [];
  const triangles: number[] = [];
  const activeMax = { v: 0 };
  const queuedMax = { v: 0 };
  const fetchingMax = { v: 0 };
  const generatingMax = { v: 0 };
  const physicsChunksMax = { v: 0 };
  const physicsBuildingsMax = { v: 0 };
  const heapMax = { v: 0 };
  const stallTimes: number[] = [];
  let longFrames50 = 0;
  let severeStalls250 = 0;
  let lastT = performance.now();
  let lastPos = { x: deps.startPos.x, z: deps.startPos.z };
  let dist = 0;
  let drivenDist = 0;
  let teleportDist = 0;
  let maxSpeed = 0;
  let speedSum = 0;
  let speedCount = 0;
  let lastGenSample = 0;
  let lastRenderSample = 0;
  const genSamples: number[] = [];

  const followRoad = (): void => {
    const p = deps.car.position();
    const h = deps.car.headingRad();
    let best: { ax: number; az: number; bx: number; bz: number; px: number; pz: number; d: number } | null = null;
    for (const seg of deps.roadSegs) {
      const dx = seg.bx - seg.ax;
      const dz = seg.bz - seg.az;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1) continue;
      const t = Math.max(0, Math.min(1, ((p.x - seg.ax) * dx + (p.z - seg.az) * dz) / len2));
      const px = seg.ax + t * dx;
      const pz = seg.az + t * dz;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < 80 && (!best || d < best.d)) best = { ...seg, px, pz, d };
    }
    if (!best) {
      deps.controls.throttle = 0.8;
      deps.controls.steer = Math.sin(performance.now() * 0.001) * 0.5;
      deps.controls.brake = 0;
      return;
    }
    const segLen = Math.hypot(best.bx - best.ax, best.bz - best.az);
    const aheadX = best.px + ((best.bx - best.ax) / segLen) * 45;
    const aheadZ = best.pz + ((best.bz - best.az) / segLen) * 45;
    const want = Math.atan2(aheadX - p.x, aheadZ - p.z);
    let diff = want - h;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const steerAmt = Math.max(-1, Math.min(1, diff * 1.4));
    const sharp = Math.abs(diff) > 0.8;
    deps.controls.throttle = sharp ? 0.35 : 0.85;
    deps.controls.steer = steerAmt;
    deps.controls.brake = 0;
  };
  let activated = 0;
  let evictedSeen = 0;
  let lateChunks = 0;
  const errors: string[] = [];
  let heapSamples = 0;
  let finalHeap = 0;
  let finished = false;
  let result: BenchmarkResult | null = null;
  let recoveryUntil = -1;
  let stallTimer = 0;
  let lastThrottleCmd = 0;
  let maxStallSec = 0;
  let recoveries = 0;
  let relocations = 0;
  let consecutiveRecoveries = 0;
  let lastRecoveryAt = -100;
  let flipTimer = 0;
  let lastProgressAt = 0;
  let lastProgressPos = { x: deps.startPos.x, z: deps.startPos.z };
  let lowProgressCycles = 0;
  const info = rendererInfo(deps.renderer.renderer);
  const startedAt = new Date().toISOString();
  const startedAtMs = performance.now();

  const finish = (stoppedBy: "time" | "distance"): void => {
    if (finished) return;
    finished = true;
    const sorted = [...frameMs].sort((a, b) => a - b);
    const fpsMedian = sorted.length ? 1000 / median(sorted) : 0;
    const dcSorted = [...drawCalls].sort((a, b) => a - b);
    const triSorted = [...triangles].sort((a, b) => a - b);
    const genSorted = [...genSamples].sort((a, b) => a - b);
    const heapInfo = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    finalHeap = heapInfo ? heapInfo.usedJSHeapSize / 1048576 : 0;
    const streamLast = deps.streamer.counters();
    evictedSeen = streamLast.evictedTotal;
    const cache = cacheStats();
    result = {
      startedAt,
      durationSec: Math.round((performance.now() - startedAtMs) / 1000),
      stoppedBy,
      renderer: info.renderer,
      vendor: info.vendor,
      webglVersion: info.webgl,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      devicePixelRatio: window.devicePixelRatio,
      finalPixelRatio: deps.renderer.renderer.getPixelRatio(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      worldLabel: deps.worldLabel,
      worldLoadMs: deps.worldLoadMs,
      frames: {
        count: frameMs.length,
        fpsMedian: Math.round(fpsMedian * 100) / 100,
        fpsMin: sorted.length ? Math.round((1000 / sorted[sorted.length - 1]) * 100) / 100 : 0,
        frameMs: {
          p50: Math.round(percentile(sorted, 50) * 100) / 100,
          p95: Math.round(percentile(sorted, 95) * 100) / 100,
          p99: Math.round(percentile(sorted, 99) * 100) / 100,
          max: sorted.length ? Math.round(sorted[sorted.length - 1] * 100) / 100 : 0,
        },
        longFrames50ms: longFrames50,
        severeStalls250ms: severeStalls250,
        stallTimesMs: stallTimes,
      },
      distance: {
        totalM: Math.round(dist),
        drivenM: Math.round(drivenDist),
        teleportedM: Math.round(teleportDist),
        maxSpeedKmh: Math.round(maxSpeed * 10) / 10,
        avgSpeedKmh: speedCount ? Math.round((speedSum / speedCount) * 10) / 10 : 0,
      },
      render: {
        drawCalls: { p50: percentile(dcSorted, 50), p95: percentile(dcSorted, 95) },
        triangles: { p50: percentile(triSorted, 50), p95: percentile(triSorted, 95) },
        geometries: deps.renderer.renderer.info.memory.geometries,
        textures: deps.renderer.renderer.info.memory.textures,
      },
      stream: {
        activeMax: activeMax.v,
        queuedMax: queuedMax.v,
        fetchingMax: fetchingMax.v,
        generatingMax: generatingMax.v,
        cancelled: streamLast.cancelled,
        activated,
        evicted: evictedSeen,
        lateChunks,
        genMs: {
          p50: Math.round(percentile(genSorted, 50) * 100) / 100,
          p95: Math.round(percentile(genSorted, 95) * 100) / 100,
          max: genSorted.length ? Math.round(genSorted[genSorted.length - 1] * 100) / 100 : 0,
          count: genSorted.length,
        },
      },
      autopilot: { recoveries, maxStallSec: Math.round(maxStallSec * 10) / 10, relocations },
      physics: { chunksMax: physicsChunksMax.v, buildingsMax: physicsBuildingsMax.v },
      cache: {
        hits: cache ? cache.hits : 0,
        misses: cache ? cache.misses : 0,
        evicted: cache ? cache.evicted : 0,
        hitRate: cache && cache.hits + cache.misses > 0 ? Math.round((cache.hits / (cache.hits + cache.misses)) * 1000) / 10 : null,
      },
      heap: { usedMBMax: Math.round(heapMax.v * 100) / 100, usedMBFinal: Math.round(finalHeap * 100) / 100, samples: heapSamples },
      errors: { count: errors.length, messages: errors.slice(0, 10) },
    };
    (window as unknown as Record<string, unknown>).__benchmarkResult = result;
    (window as unknown as Record<string, unknown>).__benchmarkDone = true;
    console.log("BENCHMARK_RESULT", JSON.stringify(result));
  };

  const relocateCar = (elapsedSec: number): void => {
    void elapsedSec;
    relocations++;
    const h = deps.car.headingRad() + (Math.random() - 0.5) * 1.5;
    deps.relocate(deps.car.position(), h);
    lastProgressAt = 0;
  };

  const tick = (dt: number, elapsedSec: number): void => {
    if (finished) return;
    const now = performance.now();
    const ms = now - lastT;
    lastT = now;
    frameMs.push(ms);
    if (ms > 50) longFrames50++;
    if (ms > 250) {
      severeStalls250++;
      if (stallTimes.length < 20) stallTimes.push(Math.round(ms));
    }

    const speed = deps.car.speedKmh();
    const recT = elapsedSec - recoveryUntil;
    if (recT < 0) {
      if (recT > -1.2) {
        deps.controls.throttle = -0.75;
        deps.controls.steer = 0.8;
        deps.controls.brake = 0;
      } else {
        deps.controls.throttle = 0.6;
        deps.controls.steer = 1;
        deps.controls.brake = 0;
      }
    } else {
      const autoProfile = (t: number): void => {
        if (t < 25) {
          deps.controls.throttle = 1;
          deps.controls.steer = 0;
          deps.controls.brake = 0;
        } else if (t < 50) {
          deps.controls.throttle = 0.8;
          deps.controls.steer = Math.sin(t * 2.2) * 0.55;
          deps.controls.brake = 0;
        } else if (t < 65) {
          deps.controls.throttle = 0;
          deps.controls.steer = 0.8;
          deps.controls.brake = 0;
        } else if (t < 85) {
          deps.controls.throttle = 0.8;
          deps.controls.steer = Math.sin(t * 2.2) * 0.55;
          deps.controls.brake = 0;
        } else if (t < 105) {
          deps.controls.throttle = 0.55;
          deps.controls.steer = 0.95;
          deps.controls.brake = 0;
        } else {
          followRoad();
        }
      };
      if (speed < 2 && lastThrottleCmd > 0.5) {
        stallTimer += dt;
        if (stallTimer > maxStallSec) maxStallSec = stallTimer;
        if (stallTimer > 3) {
          recoveries++;
          stallTimer = 0;
          recoveryUntil = elapsedSec + 3;
          if (elapsedSec - lastRecoveryAt < 15) {
            consecutiveRecoveries++;
            if (consecutiveRecoveries >= 2) {
              consecutiveRecoveries = 0;
              relocateCar(elapsedSec);
            }
          } else {
            consecutiveRecoveries = 1;
          }
          lastRecoveryAt = elapsedSec;
        }
      } else {
        stallTimer = 0;
      }
      autoProfile(elapsedSec);
    }
    lastThrottleCmd = deps.controls.throttle;
    if (lastThrottleCmd > 0.5 && deps.car.wheelsInContact() < 2 && speed < 2) {
      flipTimer += dt;
      if (flipTimer > 2.5) {
        flipTimer = 0;
        relocateCar(elapsedSec);
      }
    } else {
      flipTimer = 0;
    }
    if (elapsedSec - lastProgressAt > 8) {
      const pos = deps.car.position();
      const moved8 = Math.hypot(pos.x - lastProgressPos.x, pos.z - lastProgressPos.z);
      lastProgressAt = elapsedSec;
      lastProgressPos = { x: pos.x, z: pos.z };
      if (moved8 < 3) {
        lowProgressCycles++;
        if (lowProgressCycles >= 2) {
          lowProgressCycles = 0;
          relocateCar(elapsedSec);
        }
      } else {
        lowProgressCycles = 0;
      }
    }
    const pos = deps.car.position();
    const d = Math.hypot(pos.x - lastPos.x, pos.z - lastPos.z);
    dist += d;
    if (d > 50) teleportDist += d;
    else drivenDist += d;
    lastPos = { x: pos.x, z: pos.z };
    if (speed > maxSpeed) maxSpeed = speed;
    speedSum += speed;
    speedCount++;

    const cs = deps.streamer.counters();
    if (cs.active > activeMax.v) activeMax.v = cs.active;
    if (cs.queued > queuedMax.v) queuedMax.v = cs.queued;
    if (cs.fetching > fetchingMax.v) fetchingMax.v = cs.fetching;
    if (cs.generating > generatingMax.v) generatingMax.v = cs.generating;
    const ps = deps.streamer.physicsStats();
    if (ps.chunks > physicsChunksMax.v) physicsChunksMax.v = ps.chunks;
    if (ps.buildings > physicsBuildingsMax.v) physicsBuildingsMax.v = ps.buildings;

    lastRenderSample += ms;
    if (lastRenderSample > 500) {
      lastRenderSample = 0;
      const st = deps.renderer.getStats();
      drawCalls.push(st.drawCalls);
      triangles.push(st.triangles);
    }
    lastGenSample += ms;
    if (lastGenSample > 1000) {
      lastGenSample = 0;
      const heapInfo = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      if (heapInfo) {
        const mb = heapInfo.usedJSHeapSize / 1048576;
        heapSamples++;
        if (mb > heapMax.v) heapMax.v = mb;
      }
    }

    if (elapsedSec >= params.seconds || drivenDist >= params.dist) {
      finish(elapsedSec >= params.seconds ? "time" : "distance");
    }
  };

  return {
    result: () => result,
    get done() {
      return finished;
    },
    tick,
    recordGen: (key, ms) => {
      void key;
      genSamples.push(ms);
    },
    recordActivated: (key) => {
      activated++;
      const c = chunkCenter(deps.origin, key);
      const pos = deps.car.position();
      const size = tileSizeMeters(15) / 2;
      if (Math.abs(c.x - pos.x) <= size && Math.abs(c.z - pos.z) <= size) lateChunks++;
    },
    recordError: (msg) => {
      if (errors.length < 10) errors.push(msg);
    },
    finish,
  };
}
