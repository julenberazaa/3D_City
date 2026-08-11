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

## Radii (measured, code truth — DEFAULT_STREAM_CONFIG)
- Physics radius: 400 m
- High-detail render radius: 1200 m
- Low-detail/prefetch radius: 2400 m

## Real-hardware evidence (2026-08-11, Chrome 151, ANGLE D3D11 Intel UHD)
- FPS median 161-164 in all scenarios (target ≥55) — 3x over target.
- Frame time p95 7.0-8.4 ms (target ≤25 ms, aim ≤20 ms).
- Severe stalls: 1-2 at startup load burst; ZERO during driving (target: none repeated).
- Memory: bounded 63-140 MB over 10-min traversal + 4-city revisit matrix (no monotonic growth).
- Cache revisit: 100% hits, load 90 s → 64 s (hardware-revisit.json).
- Chunk generation: async-batched, gen p95 ~690-895 ms wall time amortized across frames
  (zero blocking); ring decimation bounds single-step cost.
- Draw calls p50 ~30-53, triangles p50 ~200-285k.

## Honesty rule
A PASS for the FPS gate requires real measured evidence on real hardware. In
headless/software renderers the gate reports BLOCKED_ENVIRONMENT with counters only.
