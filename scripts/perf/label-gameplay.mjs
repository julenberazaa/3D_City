import { chromium } from "@playwright/test";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4173";
const SCENARIOS = {
  "owner-bbox": "/?bbox=-3.2424,43.3609,-3.1984,43.4049",
  "zurich": "/?bbox=8.49,47.34,8.55,47.39",
  "manhattan": "/?bbox=-74.015,40.700,-73.960,40.735",
};

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
for (const [name, path] of Object.entries(SCENARIOS)) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  const t0 = Date.now();
  let status = "";
  while (Date.now() - t0 < 240000) {
    status = (await page.locator("#status").textContent().catch(() => "?")) ?? "";
    if (status.includes("Ready") || status.includes("Error")) break;
    await page.waitForTimeout(2000);
  }
  // settle + straight drive (W only) so the road ahead is unobstructed.
  await page.waitForTimeout(8000);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `reports/visual/style-recovery/label-gameplay-${name}.png` });
  await page.keyboard.up("KeyW");
  await page.close();
  console.log(`${name}: captured (${status})`);
}
await browser.close();
process.exit(0);
