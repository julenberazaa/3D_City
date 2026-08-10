# MODEL LOCK

Resolved 2026-08-10 from the installed OpenCode catalogue (OpenCode CLI 1.17.9, `opencode models`).

## MODEL A — PRIMARY ENGINEERING MODEL (only)

- **Provider ID**: `opencode-go`
- **Model ID**: `opencode-go/deepseek-v4-flash`
- **Variants available for this exact model**: none besides base (catalogue also lists
  `opencode/deepseek-v4-flash`, `opencode/deepseek-v4-flash-free`, `opencode-go/deepseek-v4-pro`,
  `nvidia/deepseek-ai/deepseek-v4-flash`). No `max` variant exists for this exact model.
- **Decision**: use `opencode-go/deepseek-v4-flash` (the strongest variant of this exact
  model; the `-free` variant is a downgrade; other provider prefixes expose the same model).
  A fake "max" overlay is NOT created (it would not increase real reasoning).
- **CLI reference**: `opencode run --model opencode-go/deepseek-v4-flash`

## MODEL B — VISUAL SPECIALIST (exclusive role)

- **Provider ID**: `opencode-go`
- **Model ID**: `opencode-go/gpt-5.6-luna`
- **Available**: yes (present in catalogue).
- **Allowed role ONLY**: visual interpretation of concrete artifacts (screenshots,
  rendered UI, diagrams, PDFs). No code writing, no architecture decisions, no general
  research, no generic second opinion.
- **CLI reference**: `opencode run --model opencode-go/gpt-5.6-luna --agent visual-reviewer`
  (project agent definition in `.opencode/agents/visual-reviewer.md`).

## ENFORCEMENT
- Director = current primary session on `opencode-go/deepseek-v4-flash`.
- All subagents pinned to `opencode-go/deepseek-v4-flash` except `visual-reviewer`
  (Luna). No other model may be used for any engineering work.
- If Luna is unavailable at review time: record `VISUAL_MODEL_UNAVAILABLE` in the
  ledger, use DOM/geometry/browser assertions, and classify only the
  visual-model-dependent gate. Never silently substitute another model.
