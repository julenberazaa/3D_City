# CONTINUATION — recovery after interruption

- **Branch**: main. **HEAD**: `2a40ee8` (`2a40ee860398dcd751dff90d7ae7f8437ff66b34`). origin/main == local HEAD. Working tree clean.
- **Remote**: https://github.com/julenberazaa/3D_City.git.
- **Deployment**: PUSHED and VERIFIED. GitHub Actions CI green on HEAD (run 31541858046: verify + deploy-pages SUCCESS). Public URL https://julenberazaa.github.io/3D_City/ live, HTTP 200, `node scripts/perf/verify-deployed.mjs` = 8/8 PASS on the deployed site, real-GPU benchmark on the public URL: FPS p50 164, p95 6.6 ms, heap 57 MB, 0 errors. No push blocker.
- **Model lock**: engineering = `opencode-go/deepseek-v4-flash`; visual = `opencode-go/gpt-5.6-luna` (docs/agent/MODEL_LOCK.md).
- **Architecture**: Vite+TS, three.js WebGL2 (adaptive DPR governor), Rapier raycast
  vehicle + per-chunk heightfield/box colliders, Overture 2026-07-22.0 PMTiles +
  Mapzen terrarium, deterministic fixture builder, z15 chunk streamer with ASYNC
  BATCHED generation (rAF-interleaved, cancellable), IndexedDB LRU cache (200 MB,
  self-healing accounting), GeoNames gazetteer search + Open-Meteo fallback.
  IMPORTANT: fixture/gazetteer URLs are base-aware (`import.meta.env.BASE_URL`) so
  the app works under the /3D_City/ subpath.
- **What works**: search → live world → drive → streaming → cache → recovery (R);
  77 unit tests (13 files), 8 e2e (smoke, drive incl. R gate, perf, search×4, live);
  real-GPU benchmarks: FPS p50 161-164, p95 frame ≤8.4 ms, 1 startup stall, bounded
  heap, 100% cache-hit revisits; clean-clone build verified; Luna final review
  (no CRITICAL); Pages deployed and verified.
- **What does not / deferred**: walk mode (WP-10), tunnels (R-019 minimal set done),
  water-terrain flattening (visual), Panoramax (P3), full axe audit (P2).
- **Benchmark tooling**: `?benchmark=1` in-app mode + `scripts/perf/hardware-benchmark.mjs`
  (real installed Chrome, rejects software renderers) + `scripts/perf/capture-visuals.mjs`
  + `scripts/perf/verify-deployed.mjs` (public-site smoke).
- **Important commands**: `npm run dev|build|typecheck|lint|test|e2e|harness`.
  PowerShell 5.1 (no `&&`). e2e live specs need network (skip as BLOCKED_EXTERNAL).
- **Environment quirks**: Playwright chromium is SwiftShader-only (deterministic CI);
  hardware evidence comes from real Chrome 151 headless (ANGLE D3D11, Intel UHD).
- **High-severity unresolved findings**: none (final review B findings F-01..F-05 fixed
  with mutation-verified regression tests; reviewer A retry returned empty and the
  Director took ownership of its scope).
- **Key evidence paths**: reports/performance/hardware-*.json, reports/visual/final/*.png,
  reports/finalization/baseline/BASELINE.md, docs/agent/OPTIMIZATION_LOG.md,
  reports/visual/deployed-site.png.
- **Expected next checkpoint**: final closure + micro UX/game-feel pass (final continuation
  rewrite lands with the final commit after that pass).
