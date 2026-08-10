# CONTINUATION — recovery after interruption

- **Branch**: main. **HEAD**: see `git log -1` (last verified checkpoint ~2026-08-10, pushed to origin).
- **Remote**: https://github.com/julenberazaa/3D_City.git (push OK, never force-push).
- **Model lock**: engineering = `opencode-go/deepseek-v4-flash`; visual = `opencode-go/gpt-5.6-luna` (docs/agent/MODEL_LOCK.md).
- **Architecture**: Vite+TS, three.js WebGL2 (adaptive DPR), Rapier raycast vehicle + per-chunk heightfield/box colliders, Overture 2026-07-22.0 PMTiles + Mapzen terrarium via HTTP-range, deterministic fixture builder, z15 chunk streamer (priority/cancellation/eviction), IndexedDB LRU cache (200 MB), GeoNames gazetteer search + Open-Meteo fallback. See docs/agent/ARCHITECTURE.md.
- **What works**: search → live world → drive → streaming → cache, all with passing tests: 67 unit, 6 e2e (smoke, drive, live incl. cache-hit, search×2), full harness green except clean-state (CI) and final-release (SHIP) gates.
- **What does not**: walk mode (deferred P1), bridge/tunnel elevation refinement (partial), water flattening under terrain (visual only), full a11y audit (P2), Panoramax imagery (P3), worker-based async generation (main-thread sync per chunk, architecture notes it).
- **Most recent full harness**: run during the final release round (all PASS except the two release-time gates).
- **Most recent targeted**: gates 00-23 all PASS (run-id in reports/harness/).
- **Current work package**: WP-14 final — SHIP verdict delivered; remaining follow-ups are P2/P3.
- **Exact next action (if continuing)**: WP-10 walk mode or WP-11 worker-based chunk generation; update these docs at each milestone.
- **Important commands**: `npm run dev|build|typecheck|lint|test|e2e|harness|build:stress`. PowerShell 5.1 (no &&).
- **Environment quirks**: Windows; SwiftShader headless e2e is slow (~4-7 min suite); e2e live specs need network and skip as BLOCKED_EXTERNAL when unreachable; `opencode run` CLI is reliable only for short tasks (long tasks: in-session Task tool or Director).
- **High-severity unresolved findings**: none. Known P2: live suburb areas look sparse (true content), fog washout, HUD small.
- **Key evidence paths**: reports/harness/<run-id>/, reports/visual/*.png, reports/performance/drive-session.json, reports/reviews/.
- **Deployment state**: GitHub Actions CI + Pages deploy configured (.github/workflows/ci.yml); Pages needs the repo's Pages setting enabled (EXTERNAL_BLOCKER if not).
- **Expected next checkpoint**: any P2+ work; otherwise repo is at a verified, pushed SHIP state.
