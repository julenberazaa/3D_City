# NEXT ACTION

CURRENT MILESTONE: Fidelity + style recovery candidate COMPLETE (branch `fidelity-recovery`).

CURRENT BLOCKER: none (all objective gates green; owner decision pending on merge).

NEXT REQUIRED ACTION: **owner approval of the recovery candidate** — review the
before/after screenshots (reports/visual/style-recovery/) and the Luna verdict
(PREFERRED_VERSION: AFTER, no CRITICAL). On approval: merge `fidelity-recovery`
to `main` (no force push), let CI run (verify + deploy-pages), then run
`node scripts/perf/verify-deployed.mjs` against the public URL and capture
`reports/visual/final-ux/deployed-final.png`.

Optional future work (NOT required for this milestone):
- Walk mode (R-020, deferred)
- Tunnel refinement
- Water/coast refinement (shoreline + bridges are in)
- Camera collision system (only if framing near tall buildings becomes an issue)
- Web Worker offload only if future profiling justifies it
- Panoramax facade imagery (P3)
- Full axe audit (P2)
- Lane markings / more detailed intersection styling
