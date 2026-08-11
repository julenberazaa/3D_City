# WORK PACKAGES — states

| ID | Scope | State | Exit criteria |
|---|---|---|---|
| WP-00 | Env + harness + docs + model lock + agents + baseline | PASS | harness smoke green |
| WP-01 | Upstream reuse audit + micro-spikes + architecture freeze | PASS | UPSTREAM_REUSE_AUDIT + ARCHITECTURE committed |
| WP-02 | Static vertical slice (pinned fixture, terrain/roads/buildings, render, camera) | PASS | recognizable real-area renders; fixture tests |
| WP-03 | Physics vertical slice (Rapier, collisions, controllable car) | PASS | drive around pinned world in e2e |
| WP-04 | Geo fusion (coords, elevations, seams, floating origin) | PASS | fusion tests; no seams; origin rebase safe |
| WP-05 | Live data pipeline (Overture PMTiles, terrain, workers, live input) | PASS | render a live real-world location |
| WP-06 | World chunk streamer (lifecycle, priority, cancellation, LOD rings) | PASS | continuous movement across chunks |
| WP-07 | Persistent cache (bounded, versioned, eviction) | PASS | second visit faster; bounded |
| WP-08 | Place search + safe spawn | PASS | worldwide search; safe spawn |
| WP-09 | World fidelity (parts, roofs, surfaces, water, land cover, paths, steps, bridges) | PASS | fixture fidelity tests incl. bridge rule |
| WP-10 | Walk mode | DEFERRED_NONCRITICAL | outside V1 core (car exploration is the product) |
| WP-11 | Performance hardening (batching, workers, LOD, physics radii, governor) | PASS | perf budget met on host |
| WP-12 | UX/visual polish (miniature composition, loading, settings) + Luna review | PASS | Luna findings resolved |
| WP-13 | Optional open imagery enrichment (Panoramax etc.) | DEFERRED_NONCRITICAL | P3, deferred |
| WP-14 | Release (CI, clean build, docs, deploy, final reviews, SHIP) | PASS | final harness + report bundle |

Priority rule: P3 must never block P0/P1. Low-value rabbit holes (C/D/E classification)
recorded and skipped.
