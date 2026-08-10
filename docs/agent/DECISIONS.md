# DECISIONS — evidence-backed log

| # | Date | Decision | Rationale / evidence | Reversed? |
|---|---|---|---|---|
| D-001 | 2026-08-10 | Engineering model locked to `opencode-go/deepseek-v4-flash`; visual model `opencode-go/gpt-5.6-luna` only | OpenCode catalogue 1.17.9; no max variant exists for the flash model | no |
| D-002 | 2026-08-10 | Subagent depth hard-limited to 1 via `permission.task: deny` on every subagent | Policy §13; enforced mechanically, not by prompt alone | no |
| D-003 | 2026-08-10 | Repository docs are durable memory (STATUS/NEXT_ACTION/CONTINUATION updated at milestones) | Policy §18 | no |
| D-004 | 2026-08-10 | WebGL2 is the primary renderer; WebGPU deferred until evidence shows benefit | WebGL2 is mature/universal; WebGPU renderer churn risk; see ARCHITECTURE §render | no |

(More entries will be appended as decisions are made with evidence.)
