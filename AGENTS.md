# 3D City — Agent Operating Manual

Browser-based 3D game that reconstructs real towns/cities from open geographic data
into a stylized low-poly miniature world. Open-source, static-deployable, no paid APIs.

## Non-negotiable rules

1. **Models**: Engineering ONLY `opencode-go/deepseek-v4-flash` (see `docs/agent/MODEL_LOCK.md`).
   Visual review ONLY `opencode-go/gpt-5.6-luna`. No other models.
2. **Single Director**: the current primary session. Subagent depth is HARD-LIMITED to 1.
   Children never spawn children. Enforce via `permission.task: deny` on all subagents.
3. **Durable memory**: repository docs are the memory. Update `STATUS.md`, `NEXT_ACTION.md`,
   `CONTINUATION.md` after every milestone. Never lose the thread.
4. **Anti-drift**: re-read `docs/agent/NORTH_STAR.md` before each work package.
5. **Evidence before claims**: never mark PASS without harness/runtime evidence.
6. **No cheating**: no deleting tests, no weakening acceptance, no stubs marked real,
   no swallowing errors, no fake external blockers.
7. **Verification before completion**: run the actual gates (`npm run harness` or targeted)
   before claiming any work done.
8. **Git discipline**: only commit verified coherent checkpoints; never force-push or
   rewrite remote history; push verified checkpoints to `origin/main`.

## Commands

| Task | Command |
|---|---|
| Install | `npm install` |
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm run test` |
| Full harness | `npm run harness` |
| E2E (Playwright) | `npm run e2e` |
| Stress build | `npm run build:stress` |

See `docs/agent/HARNESS.md` for gate structure and reports under `reports/harness/<run-id>/`.

## Reference docs (durable memory)

`docs/agent/NORTH_STAR.md` — vision and non-negotiables
`docs/agent/REQUIREMENTS.md` — R-001.. normalized requirements
`docs/agent/ARCHITECTURE.md` — frozen architecture
`docs/agent/UPSTREAM_REUSE_AUDIT.md` — reuse decisions
`docs/agent/DATA_SOURCES.md` — geodata sources + licenses
`docs/agent/PROVENANCE.md` — provenance classes (OBSERVED/DERIVED/INFERRED)
`docs/agent/DECISIONS.md` — evidence-backed decisions log
`docs/agent/RISKS.md` — risk register
`docs/agent/PERFORMANCE_BUDGET.md` — measured performance targets
`docs/agent/WORK_PACKAGES.md` — package states
`docs/agent/TRACEABILITY.md` — requirement → code → test → evidence
`docs/agent/STATUS.md` — executive state table
`docs/agent/NEXT_ACTION.md` — the single next action
`docs/agent/CONTINUATION.md` — recovery after interruption
`docs/agent/SUBAGENT_LEDGER.md` — every child spawn
`docs/agent/HARNESS.md` — harness gates
`docs/agent/MODEL_LOCK.md` — locked model configuration

## Workflow per package

1. Re-read NORTH_STAR → 2. read STATUS/NEXT_ACTION → 3. bounded recon only if needed →
4. one implementer → 5. targeted tests + runtime evidence → 6. fresh reviewer →
7. validate findings → 8. fixer only if needed → 9. rerun targeted → 10. update
TRACEABILITY/STATUS/NEXT_ACTION/CONTINUATION → 11. git checkpoint when green.

## Child handoff contract

Children return ≤ ~1200 tokens using:

STATUS: SCOPE: COMPLETED: FILES_CHANGED: TESTS_RUN: RESULTS: FINDINGS: RISKS:
REMAINING: EVIDENCE_PATHS: RECOMMENDED_NEXT_ACTION:

Long logs go to `reports/`, never into Director context.

## Visual review (Luna)

Only with concrete artifacts (Playwright screenshots). One invocation per review cycle.
Ledger in `docs/agent/SUBAGENT_LEDGER.md`. DeepSeek validates every Luna finding.

## Blockers

CODE_FAILURE (we fix) / HARNESS_DEFECT (fix harness) / ENVIRONMENT_FAILURE (evidence +
proceed) / EXTERNAL_BLOCKER (needs unavailable credentials/permissions/service).
A hard engineering problem is never an external blocker.
