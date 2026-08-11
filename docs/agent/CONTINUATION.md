# CONTINUATION — recovery after interruption

- **Branch**: main. **HEAD**: `git log -1` (final release commit, pushed to origin).
- **Remote**: https://github.com/julenberazaa/3D_City.git (push OK, no force-push).
- **Public deployment**: https://julenberazaa.github.io/3D_City/ (GitHub Pages,
  build_type=workflow, enabled via API 2026-08-11; deployment artifacts from CI).
- **Model lock**: engineering = `opencode-go/deepseek-v4-flash`; visual = `opencode-go/gpt-5.6-luna` (docs/agent/MODEL_LOCK.md).
- **Architecture**: Vite+TS, three.js WebGL2 (adaptive DPR governor), Rapier raycast
  vehicle + per-chunk heightfield/box colliders, Overture 2026-07-22.0 PMTiles +
  Mapzen terrarium, deterministic fixture builder, z15 chunk streamer with ASYNC
  BATCHED generation (rAF-interleaved, cancellable), IndexedDB LRU cache (200 MB,
  self-healing accounting), GeoNames gazetteer search + Open-Meteo fallback.
- **What works**: search → live world → drive → streaming → cache → recovery (R);
  77 unit tests (13 files), 8 e2e (smoke, drive incl. R gate, perf, search×4, live);
  real-GPU benchmarks: FPS p50 161-164, p95 frame ≤8.4 ms, 1 startup stall, bounded
  heap, 100% cache-hit revisits; clean-clone build verified; Luna final review
  (no CRITICAL); Pages deployed and verified.
- **What does not / deferred**: walk mode (WP-10), tunnels (R-019 minimal set done),
  water-terrain flattening (visual), Panoramax (P3), full axe audit (P2).
- **Benchmark tooling**: `?benchmark=1` in-app mode + `scripts/perf/hardware-benchmark.mjs`
  (real installed Chrome, rejects software renderers) + `scripts/perf/capture-visuals.mjs`.
- **Important commands**: `npm run dev|build|typecheck|lint|test|e2e|harness`.
  PowerShell 5.1 (no `&&`). e2e live specs need network (skip as BLOCKED_EXTERNAL).
- **Environment quirks**: Playwright chromium is SwiftShader-only (deterministic CI);
  hardware evidence comes from real Chrome 151 headless (ANGLE D3D11, Intel UHD).
- **High-severity unresolved findings**: none (final review B findings F-01..F-05 fixed
  with mutation-verified regression tests; reviewer A retry returned empty and the
  Director took ownership of its scope).
- **Key evidence paths**: reports/performance/hardware-*.json, reports/visual/final/*.png,
  reports/finalization/baseline/BASELINE.md, docs/agent/OPTIMIZATION_LOG.md.
- **Expected next checkpoint**: any optional future work; otherwise the repo is at a
  verified, deployed SHIP state.
