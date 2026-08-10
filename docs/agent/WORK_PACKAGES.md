# WORK PACKAGES — states

| ID | Scope | State | Exit criteria |
|---|---|---|---|
| WP-00 | Env + harness + docs + model lock + agents + baseline | ACTIVE | harness smoke green |
| WP-01 | Upstream reuse audit + micro-spikes + architecture freeze | NOT_STARTED | UPSTREAM_REUSE_AUDIT + ARCHITECTURE committed |
| WP-02 | Static vertical slice (pinned fixture, terrain/roads/buildings, render, camera) | NOT_STARTED | recognizable real-area renders; fixture tests |
| WP-03 | Physics vertical slice (Rapier, collisions, controllable car) | NOT_STARTED | drive around pinned world in e2e |
| WP-04 | Geo fusion (coords, elevations, seams, floating origin) | NOT_STARTED | fusion tests; no seams; origin rebase safe |
| WP-05 | Live data pipeline (Overture PMTiles, terrain, workers, live input) | NOT_STARTED | render a live real-world location |
| WP-06 | World chunk streamer (lifecycle, priority, cancellation, LOD rings) | NOT_STARTED | continuous movement across chunks |
| WP-07 | Persistent cache (bounded, versioned, eviction) | NOT_STARTED | second visit faster; bounded |
| WP-08 | Place search + safe spawn | NOT_STARTED | worldwide search; safe spawn |
| WP-09 | World fidelity (parts, roofs, surfaces, water, land cover, paths, steps, bridges) | NOT_STARTED | fixture fidelity tests |
| WP-10 | Walk/drive experience (camera, controls, mode switch) | NOT_STARTED | walk e2e green |
| WP-11 | Performance hardening (batching, workers, LOD, physics radii, governor) | NOT_STARTED | perf budget met on host |
| WP-12 | UX/visual polish (miniature composition, loading, settings) + Luna review | NOT_STARTED | Luna findings resolved |
| WP-13 | Optional open imagery enrichment (Panoramax etc.) | NOT_STARTED | only if P0/P1 green; may defer |
| WP-14 | Release (CI, clean build, docs, deploy, final reviews, SHIP) | NOT_STARTED | final harness + report bundle |

Priority rule: P3 must never block P0/P1. Low-value rabbit holes (C/D/E classification)
recorded and skipped.
