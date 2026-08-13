# RELEASE ISSUE — cold-load latency (measured, not optimized)

Status: OPEN · Priority: P1 (UX) · Owner: TBD · Affects: live-world first loads

Measured on the DEPLOYED public site (https://julenberazaa.github.io/3D_City/),
Chrome 151 headless, real hardware renderer, Zürich bbox `8.49,47.34,8.55,47.39`,
cold IndexedDB cache, 2026-08-13. Evidence: scripts/perf/async-load-probe.mjs,
reports/harness/20260813-091047.

| Stage | Measured time | Notes |
|---|---|---|
| Tiles fetch+parse (z14 transportation+buildings, z13 base) | ~0–16 s | PMTiles over S3; throttling intermittently stalls ("Loading tiles") |
| Terrain fetch+decode (49 z15 terrarium PNGs) | ~16–31 s | Sequential per chunk; PNG decode via OffscreenCanvas |
| Ready | **30.9 s** | Car spawns, first chunk group being built |
| World generation to queue idle | 33.5 s | Async-batched chunks; ~2.6 s after Ready |

Constraints/observations:
- This is NOT the cause of the visual road/label defects (geometry is stable by
  the time any screenshot is taken).
- Stages are truthful in the UI (Loading tiles / Loading terrain n/total).
- Revisits are fast (IndexedDB LRU cache, 100% hits, ~64 s load measured in
  earlier evidence runs).

Planned improvements (do NOT do during the visual-recovery micro-pass):
- Parallelize terrain fetches (bounded concurrency ~6).
- Batch tile fetches and cache decoded fixtures.
- Generate the spawn chunk while terrain still downloads.
- Optional: Web Worker offload (only if profiling justifies it).
