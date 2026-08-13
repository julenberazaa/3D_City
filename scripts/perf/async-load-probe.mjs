import { chromium } from "@playwright/test";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE ?? "https://julenberazaa.github.io/3D_City";
const url = `${BASE}/?bbox=8.49,47.34,8.55,47.39`;

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url, { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let readyAt = -1;
let prev = "";
while (Date.now() - t0 < 240000) {
  const status = await page.locator("#status").textContent().catch(() => "?");
  if (status.includes("Ready") && readyAt < 0) {
    readyAt = Date.now() - t0;
    console.log(`READY at t=${(readyAt / 1000).toFixed(1)}s`);
  }
  const stream = await page.evaluate(() => window.__game?.stream?.() ?? null).catch(() => null);
  if (stream) {
    const line = `t=${((Date.now() - t0) / 1000).toFixed(1)}s status="${status}" active=${stream.active} queued=${stream.queued} fetching=${stream.fetching} generating=${stream.generating} physics=${stream.physicsChunks}`;
    if (line !== prev) {
      console.log(line);
      prev = line;
    }
    if (stream.queued === 0 && stream.fetching === 0 && stream.generating === 0 && readyAt > 0) {
      console.log(`QUEUE_IDLE at t=${((Date.now() - t0) / 1000).toFixed(1)}s`);
      break;
    }
  }
  await page.waitForTimeout(2000);
}
await browser.close();
process.exit(0);
