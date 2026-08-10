import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { WorldFixture } from "../../src/world/generator";
import { prepareFixture } from "../../src/geo/fusion";

export function readFixture(name: string): WorldFixture {
  const dir = fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
  const load = (f: string): unknown => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as unknown;
  const chunks = <T>(f: string): T => (load(f) as { chunks: T }).chunks;
  const raw: WorldFixture = {
    manifest: load("manifest.json") as WorldFixture["manifest"],
    buildings: chunks("buildings.json"),
    roads: chunks("roads.json"),
    water: chunks("water.json"),
    landcover: chunks("landcover.json"),
    terrain: chunks("terrain.json"),
  };
  return prepareFixture(raw);
}
