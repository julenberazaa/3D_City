# CONTINUATION — recovery after interruption

Keep this compact and current. A fresh OpenCode session must be able to resume from here.

- **Branch**: main. **HEAD**: 7c699ad (initial commit) — WP-02c changes UNCOMMITTED (git discipline: commit only after reviewer pass).
- **Remote**: https://github.com/julenberazaa/3D_City.git (fetch+push OK, no force push).
- **Model lock**: engineering = `opencode-go/deepseek-v4-flash`; visual = `opencode-go/gpt-5.6-luna`
  via `visual-reviewer` agent. See docs/agent/MODEL_LOCK.md.
- **Architecture**: frozen 2026-08-10 (see docs/agent/ARCHITECTURE.md): Vite 8 + TS 6 strict, Vitest 4,
  Playwright, Three.js 0.185 (WebGL2 primary), Rapier3D-compat, PMTiles + Overture, terrarium elevation,
  GitHub Pages static deploy.
- **What works**: WP-01 audit PASS; WP-02a geo foundation DONE (projection/mvt/terrarium + types);
  WP-02b fixtures DONE (fixtures/sf-downtown: 14,948 buildings, 12,890 roads, 16 z15 terrain chunks,
  all coords fixture-local meters relative to bbox-center origin; terrain origins already local);
  WP-02c DONE — src/world/generator.ts (buildWorld, FNV-1a determinism, no Math.random), src/render/
  renderer.ts + camera.ts, src/main.ts boot with loading stages + HUD, vite.config.ts copies fixtures
  to dist via closeBundle plugin, tests/unit/generator.test.ts (26 unit tests total green),
  tests/e2e/smoke.spec.ts (green, headless SwiftShader WebGL). Gates 08/10/14 PASS
  (harness run 20260810-132940). Screenshot: reports/visual/wp02-slice.png.
- **What does not**: physics, fusion, streaming, cache, search, walk/drive (WP-03+). Vehicle none.
- **Most recent full harness**: none yet (bootstrap in progress; targeted runs only).
- **Most recent targeted harness**: 20260810-132940 — gates 08, 10, 14 all PASS.
- **Current work package**: WP-02c (implementer done; reviewer + commit pending).
- **Exact next action**: fresh reviewer on WP-02c → fix if needed → commit verified checkpoint → WP-03.
- **Important commands**: `npm install`, `npm run dev`, `npm run build`, `npm run typecheck`,
  `npm run lint`, `npm run test`, `npm run harness`, `npm run e2e`, `npm run build:stress`.
  All on Windows PowerShell 5.1 (no `&&`; use `;` / `if ($?)`).
- **Known environment quirks**: Windows + PowerShell 5.1; vite preview binds IPv6 `localhost` only —
  Playwright webServer command must keep `--host 127.0.0.1` (see playwright.config.ts); headless
  Chromium WebGL needs `--use-angle=swiftshader --enable-unsafe-swiftshader` launch args (already set);
  Playwright `webServer` never auto-builds — run `npm run build` before `npm run e2e`.
- **High-severity unresolved findings**: none. Note: fixture max building height 326 m (Salesforce
  Tower) exceeds the naive "maxTerrain+60" bound — generator test uses a data-derived bound instead.
- **Key evidence paths**: reports/harness/<run-id>/, reports/research/, reports/visual/wp02-slice.png,
  reports/reviews/wp02c-implementer.log.
- **Deployment state**: none yet (GitHub Pages planned, build paths not stable).
- **Expected next checkpoint**: git commit of WP-02c (generator + renderer + camera + tests + smoke)
  after reviewer pass.
