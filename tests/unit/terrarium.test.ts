import { describe, expect, it } from "vitest";
import { decodeTerrariumPng } from "../../src/geo/terrarium";

describe("decodeTerrariumPng", () => {
  it("decodes 2x2 grid with zero, positive, negative and fractional heights", () => {
    const rgba = new Uint8Array([
      128, 0, 0, 255,
      129, 0, 0, 255,
      127, 0, 0, 255,
      0, 1, 128, 255,
    ]);
    const heights = decodeTerrariumPng(2, 2, rgba);
    expect(heights).toBeInstanceOf(Float32Array);
    expect(heights.length).toBe(4);
    expect(heights[0]).toBeCloseTo(0, 3);
    expect(heights[1]).toBeCloseTo(256, 3);
    expect(heights[2]).toBeCloseTo(-256, 3);
    expect(heights[3]).toBeCloseTo(-32766.5, 3);
  });

  it("decodes a sea-level terrarium sample as negative EGM96 offset", () => {
    const rgba = new Uint8Array([0, 0, 0, 255]);
    const heights = decodeTerrariumPng(1, 1, rgba);
    expect(heights[0]).toBeCloseTo(-32768, 3);
  });
});
