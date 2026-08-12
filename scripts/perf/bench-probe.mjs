import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE ?? "http://localhost:4173";
const url = process.argv[2] ?? `${BASE}/?fixture=sf-downtown&benchmark=1&bench_seconds=20&bench_dist=500`;

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => console.log(`[console.${m.type()}]`, m.text().slice(0, 160)));
page.on("pageerror", (e) => console.log("[pageerror]", String(e.message).slice(0, 200)));

console.log("URL:", url);
await page.goto(url, { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  const status = await page.locator("#status").textContent().catch(() => "?");
  const done = await page.evaluate(() => window.__benchmarkDone === true).catch(() => false);
  const car = await page.evaluate(() => (window.__game?.carPos ? window.__game.carPos() : null)).catch(() => null);
  console.log(`t=${Math.round((Date.now() - t0) / 1000)}s status="${status}" done=${done} car=${car ? car.x.toFixed(1) + "," + car.z.toFixed(1) : "n/a"}`);
  if (done) break;
  await page.waitForTimeout(3000);
}
const result = await page.evaluate(() => window.__benchmarkResult ?? null).catch(() => null);
if (result) {
  const r = result;
  console.log("FPS_SANITY", JSON.stringify({
    renderer: r.renderer,
    fpsMedian: r.frames?.fpsMedian,
    p95: r.frames?.frameMs?.p95,
    p99: r.frames?.frameMs?.p99,
    severeStalls250ms: r.frames?.severeStalls250ms,
    totalM: r.distance?.totalM,
    drivenM: r.distance?.drivenM,
    heapMB: r.heap?.usedMBFinal,
    errors: r.errors?.count,
    durationSec: r.durationSec,
  }));
} else {
  console.log("RESULT: none");
}
await browser.close();
process.exit(0);
