import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import { buildGazetteerIndex, searchGazetteer, type GazetteerEntry } from "../../src/search/gazetteer";

let index: ReturnType<typeof buildGazetteerIndex>;

beforeAll(() => {
  const dir = fileURLToPath(new URL("../../fixtures", import.meta.url));
  const raw = JSON.parse(readFileSync(`${dir}/gazetteer.json`, "utf8")) as { entries: GazetteerEntry[] };
  index = buildGazetteerIndex(raw.entries);
});

describe("gazetteer search (R-002)", () => {
  it("indexes the bundled gazetteer", () => {
    expect(index.entries.length).toBeGreaterThan(30000);
    expect(index.index.size).toBeGreaterThan(25000);
  });

  it("finds major settlements by prefix", () => {
    const sf = searchGazetteer(index, "san francisco");
    expect(sf.length).toBeGreaterThan(0);
    expect(sf[0]!.name).toBe("San Francisco");
    expect(sf[0]!.lat).toBeCloseTo(37.7749, 3);
    expect(sf[0]!.lon).toBeCloseTo(-122.4194, 3);

    const paris = searchGazetteer(index, "paris");
    expect(paris.some((r) => r.country === "FR" && r.name === "Paris")).toBe(true);

    const zurich = searchGazetteer(index, "zürich");
    expect(zurich.length).toBeGreaterThan(0);
    expect(zurich.some((r) => r.country === "CH")).toBe(true);

    // GeoNames transliterates Zürich as "Zuerich": the digraph normalization
    // must make both spellings find the same place.
    const zuerich = searchGazetteer(index, "zuerich");
    expect(zuerich.length).toBeGreaterThan(0);
    expect(zuerich.some((r) => r.country === "CH")).toBe(true);
  });

  it("returns deterministic results for repeated queries", () => {
    const a = searchGazetteer(index, "barcelona", 5);
    const b = searchGazetteer(index, "barcelona", 5);
    expect(a).toEqual(b);
  });

  it("empty/short queries return nothing", () => {
    expect(searchGazetteer(index, "")).toEqual([]);
    expect(searchGazetteer(index, "x")).toEqual([]);
  });

  it("ranks bigger places first for ambiguous prefixes", () => {
    const res = searchGazetteer(index, "santa");
    expect(res.length).toBeGreaterThan(0);
    for (let i = 1; i < res.length; i++) {
      expect(res[i]!.population).toBeLessThanOrEqual(res[i - 1]!.population);
    }
  });
});
