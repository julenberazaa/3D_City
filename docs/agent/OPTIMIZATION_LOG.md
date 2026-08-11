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

## Final-review fixes (Reviewer B findings, all evidence-backed)

## F-01 Streamer build-race identity guard (HIGH, Reviewer B-1)
- BUG: a cancelled build's completion callback unconditionally deleted the
  pending-build record; if the chunk had been evicted and re-queued, the NEW
  build lost its record → not cancellable → completed into the scene as a
  permanent untracked zombie group (scene leak + counter inflation).
- FIX: each pending record is identity-checked (`pendingBuilds.get(key) !==
  pending`) before any bookkeeping in both the success and failure paths.
- EVIDENCE: new regression test tests/unit/streamer-race.test.ts (evict →
  re-activate → evict burst). Mutation check: removing the guard makes the test
  fail (23 scene groups vs 11 expected — 12 zombie groups).
- REGRESSIONS: none (77 unit + 8 e2e green).

## F-02 Build-failure black hole (MEDIUM, Reviewer B-2)
- BUG: a throwing build promise left the chunk stuck in "generating" forever;
  every future activation no-oped → dead chunk slot.
- FIX: rejection handler releases the pending record, logs, and moves the
  manager state to "evicted" so the chunk can be re-queued.
- EVIDENCE: streamer-race.test.ts "build failure releases the chunk slot"
  (nulls terrain heights to force a TypeError; asserts state leaves
  "generating" and the chunk reloads after restore).

## F-03 Adaptive-DPR governor dead code (MEDIUM, Reviewer B-3)
- BUG: `last = now` was updated BEFORE the EMA computation, so the EMA always
  added 0 and decayed to ~0; the governor never lowered the pixel ratio on slow
  renderers (the "adaptive DPR" claim was false).
- FIX: EMA computed from the frame delta before advancing `last`; logic
  extracted to pure functions `nextEma`/`chooseDpr` (src/render/renderer.ts).
- EVIDENCE: tests/unit/render-quality.test.ts pins EMA rise/fall, DPR
  lowering/restore, and hysteresis.

## F-04 Cache byte-accounting self-heal (MEDIUM, Reviewer B-6)
- BUG: a corrupted-read drop deleted the backend entry without decrementing
  stats → phantom bytes → premature evictions; concurrent puts could
  double-decrement.
- FIX: enforceBudget recomputes sizeBytes/entries from backend ground truth
  before evicting (self-heals drift) and is serialized with a mutex flag.
- EVIDENCE: cache.test.ts "byte accounting self-heals" (corrupt-drop then
  exceed-budget → no premature eviction, stats match reality) + "concurrent
  puts never corrupt budget accounting".

## F-05 Spawn quality + physics determinism (found during e2e regression)
- BUG: the fixture spawn was a footway dead-ending in a building 40 m ahead
  (car wedged seconds after spawn) and the car could spawn before its terrain
  collider existed (async streaming) → nondeterministic falling/expulsion.
- FIX: findSpawnPoint scores candidates by clear-run ahead (12/30/60/90 m)
  preferring long clear roads; main.ts pre-creates the spawn chunk's physics
  colliders before the car exists.
- EVIDENCE: drive e2e 3/3 consecutive green (was failing nondeterministically);
  spawn probe shows continuous driving 0→30 km/h with no wedge.
- REGRESSIONS: none (physics tests unchanged, all green).
