import { chromium } from "@playwright/test";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.argv[2] ?? "https://julenberazaa.github.io/3D_City";
const url = `${BASE}/?bbox=8.49,47.34,8.55,47.39`;

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => {
  window.__labelCanvases = [];
  const orig = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    const el = orig(tag, ...rest);
    if (tag === "canvas") {
      const origGetCtx = el.getContext.bind(el);
      el.getContext = (kind, ...args) => {
        const ctx = origGetCtx(kind, ...args);
        if (kind === "2d" && el.width === 256 && el.height === 64) {
          window.__labelCanvases.push({ w: el.width, h: el.height, t: performance.now() });
        }
        return ctx;
      };
    }
    return el;
  };
});
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 120)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e.message).slice(0, 120)));

console.log("URL:", url);
await page.goto(url, { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let lastStatus = "";
while (Date.now() - t0 < 180000) {
  const status = await page.locator("#status").textContent().catch(() => "?");
  if (status !== lastStatus) { console.log(`t=${Math.round((Date.now() - t0) / 1000)}s status="${status}"`); lastStatus = status; }
  if (status.includes("Ready")) break;
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(15000);
const labelCanvases = await page.evaluate(() => window.__labelCanvases?.length ?? 0);
console.log("LABEL_CANVASES_CREATED:", labelCanvases);
await page.screenshot({ path: "reports/visual/style-recovery/deployed/label-probe-zurich.png" });
await browser.close();
process.exit(0);
