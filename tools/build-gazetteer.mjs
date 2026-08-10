import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const URL = "https://download.geonames.org/export/dump/cities15000.zip";
const MIN_POP = 15000;

async function main() {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const entry = zip.getEntries()[0];
  const text = zip.readAsText(entry.entryName);
  const entries = text.split("\n").filter(Boolean);

  const out = [];
  for (const line of entries) {
    const cols = line.split("\t");
    if (cols.length < 15) continue;
    const pop = Number(cols[14]);
    const lat = Number(cols[4]);
    const lon = Number(cols[5]);
    if (!Number.isFinite(pop) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (pop < MIN_POP) continue;
    const ascii = /^[A-Za-z][A-Za-z' .-]*$/;
    const main = (cols[2] || cols[1]).toLowerCase();
    const alternates = (cols[3] || "")
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length >= 2 && a.length <= 24 && ascii.test(a))
      .filter((a) => a.toLowerCase() !== main)
      .sort((a, b) => {
        const pa = a.toLowerCase().startsWith(main.slice(0, 2)) ? 0 : 1;
        const pb = b.toLowerCase().startsWith(main.slice(0, 2)) ? 0 : 1;
        return pa - pb || a.length - b.length;
      })
      .slice(0, 4);
    out.push({
      n: cols[2] || cols[1], // ascii name preferred
      al: alternates.length ? alternates : undefined,
      c: cols[8], // country code
      a: cols[10], // admin1
      p: pop,
      la: Math.round(lat * 1e4) / 1e4,
      lo: Math.round(lon * 1e4) / 1e4,
    });
  }
  out.sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : b.p - a.p));

  const here = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(here, "..", "fixtures", "gazetteer.json");
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ source: URL, entries: out }));
  console.log(`gazetteer: ${out.length} settlements (pop>=${MIN_POP}) -> ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
