# DECISIONS — evidence-backed log

| # | Date | Decision | Rationale / evidence | Reversed? |
|---|---|---|---|---|
| D-001 | 2026-08-10 | Engineering model locked to `opencode-go/deepseek-v4-flash`; visual model `opencode-go/gpt-5.6-luna` only | OpenCode catalogue 1.17.9; no max variant exists for the flash model | no |
| D-002 | 2026-08-10 | Subagent depth hard-limited to 1 via `permission.task: deny` on every subagent | Policy §13; enforced mechanically, not by prompt alone | no |
| D-003 | 2026-08-10 | Repository docs are durable memory (STATUS/NEXT_ACTION/CONTINUATION updated at milestones) | Policy §18 | no |
| D-004 | 2026-08-10 | WebGL2 is the primary renderer; WebGPU deferred until evidence shows benefit | WebGL2 is mature/universal; WebGPU renderer churn risk; see ARCHITECTURE §render | no |
| D-005 | 2026-08-10 | Data: Overture release 2026-07-22.0 PMTiles (buildings/transportation/base/places) + Mapzen terrarium terrain, both range+CORS verified today | live probes: HTTP 206 + Access-Control-Allow-Origin:* | no |
| D-006 | 2026-08-10 | Search: bundled GeoNames cities15000 gazetteer (CC-BY 4.0) + Open-Meteo fallback | recon Q2/Q3; offline determinism + documented policy | no |
| D-007 | 2026-08-10 | Physics: Rapier raycast vehicle controller (raw API) + heightfield terrain + box building colliders | rapier3d-compat 0.20 ships DynamicRayCastVehicleController; typings incomplete → local d.ts | no |
| D-008 | 2026-08-10 | No full upstream engine (Streets GL/OSM2World/VoxCity = reference only) | each would couple its rendering architecture; lighter game pipeline | no |
| D-009 | 2026-08-10 | Chunk = z15 tile ≈ 306 m; 3 radii (physics 120 m / detail 300 m / prefetch 900 m) as hypotheses to profile | PMTiles+terrain z15 granularity; budget doc | no |

(More entries will be appended as decisions are made with evidence.)

| D-010 | 2026-08-11 | Chunk generation is ASYNC BATCHED on the main thread (generator + rAF yields, ~14 ms budget), NOT Web Workers | Worker migration needs serialization/race handling; async batching achieved the acceptance (stalls 26?1, FPS 30?164 on real GPU) with single-threaded determinism; workers remain the documented next step | no |
| D-011 | 2026-08-11 | Ring decimation (=64 verts, render path only) for buildings/water/landcover | Ear-clipping is O(n^2); single Manhattan footprints/river polygons blocked the main thread ~500 ms; physics keeps full rings (box from bbox) | no |
| D-012 | 2026-08-11 | Bridge rule: roads over water become decks at WATER_LEVEL+0.3 (point-in-polygon vs water rings) | Evidence: SF road vertices over water verified in data; no road may render below the water surface (fixture test). Tunnels out of scope | no |
| D-013 | 2026-08-11 | Vehicle recovery: R teleports to nearest safe road (findSpawnPoint(near)); controller recreated on teleport | A wedged car (nose-up against a building face) could not recover; e2e R gate added | no |
| D-014 | 2026-08-11 | Spawn prefers long clear-run roads; spawn chunk physics pre-created before the car exists | Dead-end footway spawn wedged the car in seconds (probe); async streaming could let the car fall through terrain at spawn | no |
| D-015 | 2026-08-11 | Building collider friction 0.35 | Head-on impacts at 30+ km/h wedged the car nose-up (friction 1.0); 0.35 slides along walls (arcade feel, �26) | no |
| D-016 | 2026-08-11 | Benchmark/hardware evidence on REAL GPU mandatory; SwiftShader only for deterministic CI | Chrome 151 headless (no swiftshader flags) exposes ANGLE D3D11 Intel UHD; driver rejects software renderers | no |
| D-017 | 2026-08-11 | IndexedDB cache accounting self-heals from backend ground truth (enforceBudget recomputes) | Corrupted-read drops left phantom bytes ? premature evictions (final review B-6); mutex serializes concurrent enforcement | no |