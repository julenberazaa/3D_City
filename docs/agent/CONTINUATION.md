# CONTINUATION — recovery after interruption

- **Branch**: `fidelity-recovery` (owner-mandated work branch for the fidelity/style
  recovery). Rollback baseline `2a40ee8` untouched on origin/main (deployed release).
- **Current HEAD**: see `git rev-parse HEAD` (last commit of the recovery phase).
  Local-only so far — **no push to main** until side-by-side evidence is approved.
- **Remote**: https://github.com/julenberazaa/3D_City.git.
- **State of the recovery**: COMPLETE as a candidate. All objective gates green
  (87 unit incl. 8 fidelity gates, 6 e2e, harness 22 PASS / 0 FAIL, build/lint/
  typecheck clean). Real-GPU sanity healthy. Luna visual review: PREFERRED_VERSION
  = AFTER, no CRITICAL; HIGHs (car clipping, road z-fighting) fixed and verified.
  Owner decision needed: merge to main + CI/deploy (gate 23 final_release).
- **What changed in the recovery (summary)**:
  - M1 data model: Overture facade/roof colors+materials, subtype, names,
    roof_height, connectors (junction topology) preserved through fixture+live;
    multi-ring largest-ring footprint; GEN_VERSION g3.
  - M2 buildings: evidence-hierarchy styling (OBSERVED color → material →
    subtype → palette), roof_height apex, pyramidal roofs, terrain-hugging base
    (buried 19%→0), floor bands.
  - M3 roads: connector junction graph + cap polygons (winding fixed), two-tone
    curb+surface passes (elevation layering, no z-fight), carriageway widths,
    footway de-emphasis, pseudo-junctions for connector-less fixtures, trimmed
    ribbons with budget clamp (no gaps).
  - M4 physics: convex-hull building colliders (≤48 pts, AABB fallback).
  - M5 spawn: drivable classes only + connector connectivity (degree ≥2).
  - Game feel: elevated smoothed camera (24/16, speed look-ahead, ground-guard),
    arcade speed (~94 km/h cap), car readability (2.0×4.4 m, windshield, blob
    shadow — inside physics silhouette), mini-HUD default (H = diagnostics).
  - Environment: street-name labels (class-prioritized, density-capped),
    deterministic trees inside real green polygons (DERIVED policy), shoreline
    water ring, inline favicon.
- **Manual gameplay evidence** (same driver, same bboxes, release vs candidate):
  recoveries 17→7 (dense 20→0 in the first set; water 8→1), severe stalls 12→2,
  FPS p50 161-164 on real GPU (mountain 151 after tree trim).
  Records: reports/final-ux/manual-{before,after}-*.json; screenshots
  reports/visual/style-recovery/{before,after}/.
- **Owner requirements persisted**: VISUAL_PRODUCT_SPEC.md (R-028),
  REAL_WORLD_FIDELITY_POLICY.md (R-029), STYLE_ACCEPTANCE.md (R-030) in
  docs/agent/; primary style reference docs/reference/objective_vista.png.
- **Known limitations**: camera has no collision system (out of scope; framing
  near tall buildings can occlude), walk mode/tunnels/Panoramax deferred,
  no lane markings.
- **Important commands**: `npm run dev|build|typecheck|lint|test|e2e|harness`.
  PowerShell 5.1 (no `&&`). Preview server locks rolldown .node → kill it
  (`Get-CimInstance Win32_Process | Where CommandLine -like "*preview*"`) before
  `npm ci`. Harness npm-audit gate is network-bounded (BLOCKED_EXTERNAL on
  throttled registry). e2e live specs skip as BLOCKED_EXTERNAL offline.
- **Environment quirks**: S3/registry throttling intermittently stalls live loads
  and npm ci (retry; the harness audit gate is bounded); vitest timeout 60s
  (heavy generators under load).
- **Key evidence paths**: reports/visual/style-recovery/, reports/final-ux/,
  reports/harness/20260812-221726/, docs/agent/FIDELITY_RECOVERY_AUDIT.md,
  docs/agent/STYLE_RECOVERY_AUDIT.md.
- **Next checkpoint**: owner reviews before/after + Luna verdict → if approved:
  merge fidelity-recovery to main, CI, deploy, verify public URL (verify-deployed.mjs).
