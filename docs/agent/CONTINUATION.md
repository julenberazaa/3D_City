# CONTINUATION — recovery after interruption

Keep this compact and current. A fresh OpenCode session must be able to resume from here.

- **Branch**: main. **HEAD**: 7c699ad (initial commit) until first checkpoint.
- **Remote**: https://github.com/julenberazaa/3D_City.git (fetch+push OK, no force push).
- **Model lock**: engineering = `opencode-go/deepseek-v4-flash`; visual = `opencode-go/gpt-5.6-luna`
  via `visual-reviewer` agent. See docs/agent/MODEL_LOCK.md.
- **Architecture**: not yet frozen (in progress — WP-01). Preferred direction: Vite+TS,
  Three.js (WebGL2 primary), Rapier3D-compat, protomaps PMTiles + Overture data, Mapzen
  terrarium elevation, GeoNames-derived bundled gazetteer + Open-Meteo fallback, Vitest,
  Playwright, GitHub Pages deploy.
- **What works**: greenfield bootstrapped; WP-01 audit PASS; WP-02a geo foundation DONE —
  `src/geo/projection.ts` (EPSG:3857 + tile math), `src/geo/mvt.ts` (compact MVT decoder on
  `pbf`), `src/geo/terrarium.ts` (height decode), `src/world/types.ts` (Provenance/Attr/
  GeoFeature/ChunkId). 11 unit tests green; typecheck + lint clean; all modules importable
  from Node 24. OpenCode 1.17.9; agents supported via `.opencode/agents/*.md`.
- **What does not**: no renderer, generator, fixture data, or e2e yet (WP-02b onward).
- **Most recent full harness**: none yet (bootstrap in progress).
- **Most recent targeted harness**: none.
- **Current work package**: WP-02b (WP-02a geo foundation done).
- **Exact next action**: fixture fetch tool using src/geo/{projection,mvt,terrarium}
  (Overture z14/z13 overzoom → z15 buckets, terrarium PNG → height grid), then generator
  + renderer + camera for the static slice.
- **Important commands**: `npm install`, `npm run dev`, `npm run build`, `npm run typecheck`,
  `npm run lint`, `npm run test`, `npm run harness`, `npm run e2e`, `npm run build:stress`.
  All on Windows PowerShell 5.1 (no `&&`; use `;` / `if ($?)`).
- **Known environment quirks**: Windows; `opencode` via scoop shim; PowerShell 5.1;
  GUI GPU available for browser screenshots; live-network tests depend on public
  static hosts (documented per test).
- **High-severity unresolved findings**: none.
- **Key evidence paths**: reports/harness/<run-id>/, reports/research/, reports/performance/.
- **Deployment state**: none yet (GitHub Pages planned, build paths not stable).
- **Expected next checkpoint**: git commit of bootstrap (docs + harness + agents) once harness smoke passes.
