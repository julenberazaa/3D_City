import { describe, expect, it } from "vitest";
import { nextEma, chooseDpr } from "../../src/render/renderer";

describe("adaptive quality governor", () => {
  it("EMA rises on slow frames (regression: used to always add 0)", () => {
    expect(nextEma(16, 200)).toBeGreaterThan(16);
    expect(nextEma(16, 8)).toBeLessThan(16);
  });

  it("DPR lowers on sustained slow frames and restores when fast", () => {
    expect(chooseDpr(200, 2, 2)).toBe(1);
    expect(chooseDpr(50, 1, 2)).toBe(2);
    expect(chooseDpr(100, 2, 2)).toBe(2);
    expect(chooseDpr(100, 1, 2)).toBe(1);
  });

  it("hysteresis prevents oscillation around the boundary", () => {
    let ema = 16;
    let dpr = 2;
    for (let i = 0; i < 30; i++) {
      ema = nextEma(ema, 200);
      dpr = chooseDpr(ema, dpr, 2);
    }
    // EMA converges to 200 (>140 threshold) → DPR must be 1 and stay there.
    expect(ema).toBeGreaterThan(140);
    expect(dpr).toBe(1);
  });
});
