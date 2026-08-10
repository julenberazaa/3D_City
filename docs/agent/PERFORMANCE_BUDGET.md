# PERFORMANCE BUDGET

Target device: modern desktop/laptop browser, hardware-accelerated graphics (WebGL2).
Mobile is not a P0 target. Measured on the dev host (Windows, GPU available); CI runs
deterministic counters only and marks the FPS gate BLOCKED_ENVIRONMENT where needed.

## Targets (initial hypotheses, to be validated in WP-11)

| Metric | Target | How measured |
|---|---|---|
| FPS during ordinary driving | ~60 (p50), ≥50 (p95) | runtime overlay + Playwright perf traces |
| Frame time p95 | ≤ 20 ms | overlay sampler |
| Long-frame stalls | no repeated >250 ms at chunk boundaries | e2e frame-time sampling |
| Draw calls | < 1500 typical | renderer.info |
| Triangles | < 1.5M typical visible | renderer.info |
| Memory | bounded steady state during 15 min traversal (no monotonic growth beyond noise) | performance.memory / heap sampling |
| Chunk generation latency | < 1 s per chunk on warm cache | streamer counters |
| Cache | hit in < 300 ms when cached | cache counters |
| Main-thread budget | < 8 ms/frame outside GC spikes | workers for decode/gen |

## Quality profiles (default: Balanced)
- Low: DPR≤1, low-detail radius smaller, no vegetation, terrain subdivision lower.
- Balanced: DPR≤1.5, default radii, light vegetation.
- Quality: DPR≤2, bigger radii, more vegetation, better shadows.

Governor adjusts within profile bounds with hysteresis; no rapid oscillation.

## Radii (hypotheses, WP-06/11 profile)
- Physics radius: 120 m
- High-detail render radius: 300 m
- Low-detail/prefetch radius: 900 m

## Honesty rule
A PASS for the FPS gate requires real measured evidence on real hardware. In
headless/software renderers the gate reports BLOCKED_ENVIRONMENT with counters only.
