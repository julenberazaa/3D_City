import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEV = "http://localhost:5199";

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const page = await browser.newPage();
await page.goto(DEV + "/label-test.html", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__stats !== undefined, undefined, { timeout: 30000 }).catch(() => {});
console.log("READPIXELS_STATS:", JSON.stringify(await page.evaluate(() => window.__stats)));
const pngPath = "reports/visual/style-recovery/deployed/sprite-isolated-test.png";
await page.screenshot({ path: pngPath });
const png = PNG.sync.read(readFileSync(pngPath));
let red = 0, green = 0, blue = 0, white = 0;
for (let i = 0; i < png.data.length; i += 4) {
  const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
  if (r > 200 && g < 80 && b < 80) red++;
  if (g > 200 && r < 80 && b < 80) green++;
  if (b > 200 && r < 80 && g < 80) blue++;
  if (r > 225 && g > 225 && b > 225) white++;
}
console.log("PNG_STATS:", JSON.stringify({ red, green, blue, white, w: png.width, h: png.height }));
await browser.close();
process.exit(0);
