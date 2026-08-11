# OPTIMIZATION LOG — every material change with BEFORE/AFTER evidence

Rule: no optimization survives without a measured improvement. All AFTER numbers
from `reports/performance/hardware-*.json` (real GPU: ANGLE D3D11, Intel UHD Graphics,
Chrome 151 headless) unless noted. SwiftShader numbers are marked (SW).

## O-01 Vehicle recovery (R key) + findSpawnPoint(near) + vehicle.reset
- CHANGE: `findSpawnPoint(..., near)` sorts candidates by distance to a given point;
  `vehicle.reset()` teleports + zeroes velocity + recreates the raycast controller
  (clears stale wheel/suspension state after teleport); R key wired in main.ts.
- BEFORE: player wedged against a building (nose-up, front wheels off ground) could
  not recover except by manual reverse steering; no guaranteed escape.
- AFTER: R teleports to nearest safe road point (clear of buildings/water/slope).
  Drive e2e now asserts recovery (wheels>=2, on ground, speed bounded).
- REGRESSIONS: none (69 unit + 6 e2e green).
- DECISION: KEEP.

## O-02 Building collider friction 1.0 -> 0.35
- CHANGE: building box colliders friction lowered so the car slides along walls
  instead of wedging nose-up on head-on impact.
- BEFORE: car permanently wedged against building faces after frontal impacts
  (probe: speed 31 km/h -> stuck 60+ s at first wall).
- AFTER: head-on impacts deflect; combined with R-recovery the car keeps moving.
  Benchmark autopilot now completes multi-km traversals.
- REGRESSIONS: none measured (physics tests unchanged, all green).
- DECISION: KEEP.

## O-03 Benchmark mode + real-hardware driver
- CHANGE: `?benchmark=1` mode (renderer detection via WEBGL_debug_renderer_info,
  per-frame frame-time sampling, p50/p95/p99, stalls, stream/physics/cache/heap
  counters, autopilot with stall-recovery + relocation, road-following cruise) +
  `scripts/perf/hardware-benchmark.mjs` (real installed Chrome, no swiftshader flag).
- BEFORE: all perf evidence came from Playwright Chromium with
  `--use-angle=swiftshader` (software): FPS p50 18.9, p95 frame 68.7 ms.
- AFTER: real GPU evidence: FPS p50 ~160, p95 frame ~7 ms on Intel UHD (D3D11).
- DECISION: KEEP (deterministic tooling; hardware run rejects software renderers).

## O-04 Chunk generation: constant normals (flat-shaded meshes)
- CHANGE: VertexBuilder.toMesh() no longer calls computeVertexNormals(); constant
  (0,1,0) normals are assigned. All materials are flatShading (three.js computes
  face normals in the shader), so the attribute is never sampled.
- BEFORE: ~10% of chunk generation CPU in computeVertexNormals over 100k+ verts.
- AFTER: 0 ms for normals; total generation ~10% faster.
- REGRESSIONS: visual identical (flat shading unaffected); e2e smoke/drive green.
- DECISION: KEEP.

## O-05 Chunk generation: async batched (rAF-interleaved) generation
- CHANGE: buildChunkGroup refactored to a generator (`buildChunkPieces`) with
  control points; the streamer steps it with a ~14 ms frame budget and yields via
  rAF; cancellation discards partial work; geometry disposal on eviction.
- BEFORE: one dense chunk (Manhattan) blocked the main thread ~500 ms synchronously:
  26 severe stalls (>250 ms) in a 288 s stress run, FPS p50 30.
- AFTER (with O-06): 1 severe stall (333 ms, initial load burst) in 248 s run,
  FPS p50 164, p95 frame 7 ms. Chunk generation latency is amortized across frames
  (gen p95 695 ms wall time, zero blocking).
- REGRESSIONS: chunk activation now takes a few extra frames; physics attaches on
  activation (unchanged); all e2e green.
- DECISION: KEEP.

## O-06 Chunk generation: deterministic ring decimation (render path only)
- CHANGE: rings with >64 vertices are deterministically decimated before
  triangulation (buildings/water/landcover). Ear-clipping is O(n^2) and real
  footprints/river polygons carry hundreds-thousands of vertices; a single polygon
  could block the main thread for ~400 ms, defeating the frame budget.
- BEFORE: 12 severe stalls/run, mostly ~500 ms (single-polygon triangulation).
- AFTER: 1 stall/run (startup burst). Physics keeps FULL rings (boxes from bbox).
- REGRESSIONS: stylized silhouettes only (miniature scale); fixture tests green.
- DECISION: KEEP.

## O-07 VertexBuilder dedup scoping (per building)
- CHANGE: the dedup Map is cleared per building instead of growing to every vertex
  of the chunk (cross-building vertex sharing is vanishingly rare in real data).
- BEFORE: ~100k+ string-key Map entries per dense chunk.
- AFTER: map stays tiny; small but real generation CPU reduction.
- REGRESSIONS: none.
- DECISION: KEEP (minor, included in O-05/06 runs).

## REJECTED / NOT ATTEMPTED
- Web Worker offload: NOT ATTEMPTED. Async batched generation achieved the same
  acceptance (no repeated >250 ms stalls) with single-threaded determinism, no
  serialization, no race surface. Workers remain the documented next step if
  generation grows beyond the frame budget.
- WebGPU: NOT ATTEMPTED (WebGL2 renders 200k tris at ~160 FPS; not a bottleneck).
- Chunk size z16: NOT ATTEMPTED (no evidence of a size problem; z15 + decimation
  meets all targets).
- Stricter friction tuning beyond 0.35: REJECTED (0.35 meets arcade targets).
