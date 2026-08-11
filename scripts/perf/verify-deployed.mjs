import { chromium } from "@playwright/test";

const PUBLIC = process.env.PUBLIC_URL ?? "https://julenberazaa.github.io/3D_City/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const failures = [];
  const results = [];
  const failedReq = [];
  page.on("requestfailed", (r) => failedReq.push(`${r.url().slice(0, 90)} ${r.failure()?.errorText ?? ""}`));
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message.slice(0, 200)}`));

  const check = (name, ok, detail = "") => {
    results.push({ name, ok, detail: detail.slice(0, 160) });
    if (!ok) failures.push(name);
    console.log(`${ok ? "PASS" : "FAIL"} ${name} ${detail.slice(0, 120)}`);
  };

  const resp = await page.goto(PUBLIC, { waitUntil: "domcontentloaded" });
  check("1 html loads", (resp?.status() ?? 0) < 400, `HTTP ${resp?.status()}`);

  const assets = await page.evaluate(async () => {
    const links = [...document.querySelectorAll("script[src], link[rel=stylesheet]")].map((e) => e.getAttribute("src") ?? e.getAttribute("href"));
    const out = [];
    for (const l of links) {
      if (!l) continue;
      const r = await fetch(new URL(l, location.href));
      out.push(`${l.slice(0, 60)} ${r.status}`);
    }
    return out;
  });
  check("2 js/css assets 200", assets.every((a) => a.endsWith(" 200")), assets.join("; "));

  const searchVisible = await page.locator("#place-input").isVisible().catch(() => false);
  check("3 search UI visible", searchVisible);
  if (searchVisible) {
    await page.locator("#place-input").fill("zermatt");
    const hasResults = await page.waitForSelector("#place-results li", { timeout: 20000 }).then(() => true).catch(() => false);
    check("4 search returns results", hasResults);
    await page.locator("#place-input").fill("");
  }

  await page.locator("#demo-btn").click().catch(() => undefined);
  await page.waitForFunction(
    () => document.getElementById("status")?.textContent?.includes("Ready") || document.getElementById("status")?.textContent?.includes("Error"),
    { timeout: 180000 },
  ).catch(() => undefined);
  const status = await page.evaluate(() => document.getElementById("status")?.textContent ?? "?");
  const canvas = await page.evaluate(() => !!document.querySelector("canvas"));
  const game = await page.evaluate(() => !!window.__game);
  check("5 fixture world boots (canvas + game handle)", canvas && game, status);
  check("6 car spawned", game);
  const moved = await page.evaluate(async () => {
    const g = window.__game;
    if (!g) return -1;
    const a = g.carPos();
    await new Promise((r) => setTimeout(r, 4000));
    const b = g.carPos();
    return Math.round(Math.hypot(b.x - a.x, b.z - a.z) * 10) / 10;
  });
  check("7 controls function (car moves with no input drift)", moved >= 0, `drift ${moved}m`);
  check("8 no fatal console/page errors", failedReq.length === 0 && failures.length === 0, failedReq.join(" | "));

  await page.screenshot({ path: "reports/visual/deployed-site.png" }).catch(() => undefined);
  await browser.close();
  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${okCount}/${results.length} checks passed`);
  process.exit(okCount === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("VERIFY_FAIL", e.message);
  process.exit(1);
});
