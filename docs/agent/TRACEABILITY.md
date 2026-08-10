# TRACEABILITY — requirement → code → test → evidence

| Req | Module(s) | Test(s) | Runtime evidence | State |
|---|---|---|---|---|
| R-001 | src/main.ts | browser smoke e2e | screenshot boot | NOT_STARTED |
| R-002 | src/search/ | search unit tests | e2e | NOT_STARTED |
| R-003 | src/loading/ | DOM e2e | video/screens | NOT_STARTED |
| R-004 | src/terrain/ | fixture height test | screenshot | NOT_STARTED |
| R-005 | src/roads/ | fixture geometry test | screenshot | NOT_STARTED |
| R-006 | src/buildings/ | fixture footprint test | screenshot | NOT_STARTED |
| R-007 | docs/agent/UPSTREAM_REUSE_AUDIT.md | gate 19 | audit doc | NOT_STARTED |
| R-008 | src/geo/provenance.ts | provenance unit test | debug overlay | NOT_STARTED |
| R-009 | src/geo/chunkKey.ts | determinism unit test | harness gate 13 | NOT_STARTED |
| R-010 | WP-02 slice | fixture tests | screenshot | NOT_STARTED |
| R-011 | src/physics/, src/vehicle/ | physics unit + e2e | e2e drive | NOT_STARTED |
| R-012 | src/geo/fusion.ts | fusion unit tests | e2e seams check | NOT_STARTED |
| R-013 | src/data/ | live e2e | live render screenshot | NOT_STARTED |
| R-014 | src/stream/ | streaming unit tests | e2e traversal | NOT_STARTED |
| R-015 | src/cache/ | cache unit tests | e2e revisit timing | NOT_STARTED |
| R-016 | src/spawn/ | spawn unit tests | e2e spawn check | NOT_STARTED |
| R-017 | src/buildings/roofs.ts | fixture tests | screenshot | NOT_STARTED |
| R-018 | src/water/, src/vegetation/ | fixture tests | screenshot | NOT_STARTED |
| R-019 | src/geo/bridgeTunnel.ts | fixture tests | screenshot | NOT_STARTED |
| R-020 | src/character/ | e2e | walk e2e | NOT_STARTED |
| R-021 | src/ui/, src/camera/ | e2e | screenshots | NOT_STARTED |
| R-022 | src/perf/ | perf harness | reports/performance | NOT_STARTED |
| R-023 | whole | Luna review cycles | reports/visual | NOT_STARTED |
| R-024 | CI + docs | final harness | run report | NOT_STARTED |
| R-025 | src/errors/ | fault-injection tests | gate 16 | NOT_STARTED |
| R-026 | src/ui/ | a11y e2e | gate 17 | NOT_STARTED |
| R-027 | global | gate 18 | audit | NOT_STARTED |

Update this table every time a requirement changes state.
