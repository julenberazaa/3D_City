import { chromium } from "@playwright/test";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE ?? "http://localhost:4173";

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e.message).slice(0, 150)));
await page.goto(`${BASE}/?bbox=8.49,47.34,8.55,47.39`, { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let status = "";
while (Date.now() - t0 < 240000) {
  status = (await page.locator("#status").textContent().catch(() => "?")) ?? "";
  if (status.includes("Ready") || status.includes("Error")) break;
  await page.waitForTimeout(2000);
}
console.log("status:", status);
await page.waitForTimeout(12000);
// Orbit mode (C) + zoom in: an unoccluded street-level view where labels on
// the near road must be visible if they render at all.
await page.keyboard.press("KeyC");
await page.waitForTimeout(500);
await page.mouse.move(640, 400);
for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -400);
await page.waitForTimeout(2000);
await page.screenshot({ path: "reports/visual/style-recovery/deployed/label-closeup-zurich.png" });
const stats = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const gl = c.getContext("webgl2");
  const px = new Uint8Array(4 * c.width * c.height);
  gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let white = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] > 225 && px[i + 1] > 225 && px[i + 2] > 225) white++;
  return white;
});
console.log("CLOSEUP_WHITE_PX:", stats);
await browser.close();
process.exit(0);
