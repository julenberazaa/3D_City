# TRACEABILITY — requirement → code → test → evidence

Updated 2026-08-11 (final release). Every state is backed by executable evidence
(harmony with harness run + clean-clone test).

| Req | Module(s) | Test(s) | Runtime evidence | State |
|---|---|---|---|---|
| R-001 | src/main.ts, src/render/renderer.ts, vite.config.ts | tests/e2e/smoke.spec.ts | e2e 1 passed; screenshot reports/visual/final/02-fixture-world.png | PASS |
| R-002 | src/search/gazetteer.ts, src/search/openMeteo.ts, src/main.ts (showSearch) | tests/unit/search.test.ts; tests/e2e/search.spec.ts (4 tests) | e2e live search + keyboard navigation | PASS |
| R-003 | src/main.ts (setStatus stages + spinner) | e2e status assertions (role=status, aria-live) | screenshots 03-loading | PASS |
| R-004 | src/geo/terrarium.ts, src/world/generator.ts (terrain) | terrarium.test.ts, fixture.test.ts | e2e smoke renders terrain | PASS |
| R-005 | src/world/generator.ts (roads), src/geo/fusion.ts | fixture.test.ts (bridge rule) | e2e screenshots | PASS |
| R-006 | src/world/generator.ts (buildings), src/geo/fusion.ts | fixture.test.ts (counts, rings) | e2e screenshots | PASS |
| R-007 | docs/agent/UPSTREAM_REUSE_AUDIT.md | harness gate 20 | audit doc present | PASS |
| R-008 | src/world/generator.ts (provenance tracking) | HUD provenance counters in smoke e2e | e2e HUD shows obs/der/inf | PASS |
| R-009 | src/data/chunkKey.ts (versioned keys), src/world/generator.ts (deterministic) | chunkKey.test.ts, generator.test.ts (determinism) | byte-identical fixture oracle (tools) | PASS |
| R-010 | src/world/generator.ts (buildWorld/buildChunkPieces) | fixture.test.ts, smoke e2e | reports/visual/final/02-fixture-world.png | PASS |
| R-011 | src/physics/world.ts, src/physics/vehicle.ts | physics.test.ts (12 tests), drive.spec.ts | drive e2e: causality + ground-truth y + R-recovery gates | PASS |
| R-012 | src/geo/fusion.ts | fusion.test.ts (stitch <0.01, idempotency) | — | PASS |
| R-013 | src/data/live.ts (PMTiles + terrarium) | live.spec.ts (skips as BLOCKED_EXTERNAL offline) | live e2e renders real location | PASS |
| R-014 | src/stream/chunkManager.ts, src/stream/streamer.ts | chunkManager.test.ts, streamer-race.test.ts (zombie leak + black hole) | benchmark runs (45+ chunks streamed, evictions) | PASS |
| R-015 | src/cache/store.ts, src/cache/indexedDb.ts | cache.test.ts (LRU, corruption, self-heal, mutex, re-put) | hardware-revisit.json: 100% hits, load 90s→64s | PASS |
| R-016 | src/physics/world.ts (findSpawnPoint + clear-run scoring) | physics.test.ts (spawn, near) | spawn probe: continuous drive, no wedge | PASS |
| R-017 | src/world/generator.ts (heights/roofs) | fixture.test.ts (≥40% height/levels) | — | PASS |
| R-018 | src/world/generator.ts (water/landcover) | fixture.test.ts (≥1 water/landcover) | screenshots | PASS |
| R-019 | src/world/generator.ts (bridge rule) | fixture.test.ts (road verts over water ≥ surface) | SF motorway-over-water verified in data | PASS (minimal set; tunnels documented) |
| R-020 | — | — | — | DEFERRED (documented in STATUS/NEXT_ACTION) |
| R-021 | src/render/camera.ts, src/input/controls.ts, src/main.ts | drive e2e (R recovery, camera) | screenshots | PASS |
| R-022 | src/render/renderer.ts (governor), src/bench/benchmark.ts | render-quality.test.ts; scripts/perf/hardware-benchmark.mjs | hardware-*.json: FPS p50 161-164, p95 ≤8.4 ms, stalls 1 (startup), heap bounded | PASS |
| R-023 | whole | Luna final review (2 cycles) | reports/visual/final/*.png; ledger | PASS |
| R-024 | .github/workflows/ci.yml, vite.config.ts (base "./") | clean-clone test (temp worktree), CI, Pages deploy | https://julenberazaa.github.io/3D_City/ | PASS |
| R-025 | src/data/live.ts (network classification), src/cache/store.ts (corruption), src/stream/streamer.ts (failure slot release) | cache.test.ts, live.spec.ts, streamer-race.test.ts | — | PASS |
| R-026 | src/main.ts (search a11y), src/style.css | search.spec.ts (arrows/aria/live-region/status) | — | PASS |
| R-027 | global (parseBbox validation, no eval) | harness gate 19 (audit/secret scan) | npm audit clean | PASS |
| R-028 | src/world/generator.ts, src/render/labels.ts, src/main.ts, src/render/car.ts | fidelity.test.ts, label unit tests, before/after screenshots, Luna review | reports/visual/style-recovery/ + STYLE_ACCEPTANCE | ACTIVE |
| R-029 | src/data/fixtureBuilder.ts, src/world/generator.ts, src/physics/world.ts | fidelity.test.ts (ROAD-01/02, spawn), tree determinism test | code audit; determinism tests | ACTIVE |
| R-030 | global (release process) | fidelity gates + e2e + harness + real-GPU sanity + Luna | reports/visual/style-recovery/after/, hardware sanity json | ACTIVE |
