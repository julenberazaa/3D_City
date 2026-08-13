import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = dirname(fileURLToPath(import.meta.url)) + "/../..";
const OUT = join(ROOT, "reports", "visual", "style-recovery", "owner-bbox");
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:4173/?bbox=-3.2424,43.3609,-3.1984,43.4049", { waitUntil: "domcontentloaded" });
let status = "";
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  status = (await page.locator("#status").textContent().catch(() => "?")) ?? "";
  if (status.includes("Ready") || status.includes("Error")) break;
  await page.waitForTimeout(2000);
}
console.log("status:", status);
await page.waitForFunction(() => {
  const c = document.querySelector("canvas");
  if (!c) return false;
  const ctx = c.getContext("webgl2");
  if (!ctx) return false;
  const px = (fx, fy) => { const o = new Uint8Array(4); ctx.readPixels(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, o); return o; };
  const nf = (p) => p[3] > 0 && (p[0] > 12 || p[1] > 12 || p[2] > 12);
  return nf(px(0.5, 0.45)) && nf(px(0.5, 0.2));
}, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(6000);
await page.screenshot({ path: join(OUT, "santander-spawn.png") });
// Drive briefly (hold W, gentle steering) and capture a drive shot.
await page.keyboard.down("KeyW");
for (let i = 0; i < 6; i++) {
  if (i % 2 === 0) await page.keyboard.down("KeyA"); else await page.keyboard.down("KeyD");
  await page.waitForTimeout(4000);
  await page.keyboard.up("KeyA"); await page.keyboard.up("KeyD");
}
await page.keyboard.up("KeyW");
await page.waitForTimeout(2000);
await page.screenshot({ path: join(OUT, "santander-drive.png") });
// Top diagnostic shot: orbit camera toggle (C) gives an overview.
await page.keyboard.press("KeyC");
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, "santander-overview.png") });
console.log("captured");
await browser.close();
process.exit(0);
