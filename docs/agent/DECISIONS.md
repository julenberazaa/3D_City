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
