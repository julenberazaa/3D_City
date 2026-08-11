import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import http from "node:http";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/../..";
const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = `${ROOT}/reports/visual/final`;
mkdirSync(OUT, { recursive: true });

function get(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", () => resolve(-1));
    req.setTimeout(4000, () => req.destroy());
  });
}

async function waitForServer(t) {
  const t0 = Date.now();
  while (Date.now() - t0 < t) {
    try {
      if ((await get(`${BASE}/`)) === 200) return;
    } catch {
      // server not up yet; retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server not up");
}

const server = spawn("cmd.exe", ["/c", "npm run preview -- --host 127.0.0.1 --port 4174 --strictPort"], {
  cwd: ROOT,
  stdio: "ignore",
});

const SCENES = [
  { name: "01-search-landing", url: `${BASE}/`, wait: 4000, prep: async (p) => { await p.locator("#place-input").fill("zermatt"); await p.waitForTimeout(1500); } },
  { name: "02-fixture-world", url: `${BASE}/?fixture=sf-downtown&benchmark=1&bench_seconds=20&bench_dist=100000`, wait: 30000, waitReady: true },
  { name: "03-loading", url: `${BASE}/?bbox=8.49,47.34,8.55,47.39`, wait: 8000 },
  { name: "04-live-driving", url: `${BASE}/?bbox=8.49,47.34,8.55,47.39&benchmark=1&bench_seconds=30&bench_dist=100000`, wait: 30000, waitReady: true },
  { name: "05-dense-city", url: `${BASE}/?bbox=-74.015,40.700,-73.960,40.735&benchmark=1&bench_seconds=30&bench_dist=100000`, wait: 30000, waitReady: true },
  { name: "06-mountain", url: `${BASE}/?bbox=7.73,45.99,7.78,46.03&benchmark=1&bench_seconds=30&bench_dist=100000`, wait: 30000, waitReady: true },
];

async function main() {
  await waitForServer(30000);
  const only = process.argv.slice(2);
  const scenes = only.length > 0 ? SCENES.filter((s) => only.includes(s.name)) : SCENES;
  for (const s of scenes) {
    const browser = await chromium.launch({ headless: true, executablePath: CHROME });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    try {
      await page.goto(s.url, { waitUntil: "domcontentloaded" });
      if (s.waitReady) {
        const ready = await page
          .waitForFunction(() => document.getElementById("status")?.textContent?.includes("Ready"), undefined, { timeout: 300000 })
          .catch(() => null);
        if (!ready) {
          const st = await page.evaluate(() => document.getElementById("status")?.textContent ?? "?").catch(() => "?");
          console.log(`shot ${s.name} SKIPPED (never Ready; status=${st?.slice(0, 80)})`);
          continue;
        }
      }
      if (s.prep) await s.prep(page);
      await page.waitForTimeout(s.wait);
      await page.screenshot({ path: `${OUT}/${s.name}.png` });
      console.log(`shot ${s.name}`);
    } catch (e) {
      console.log(`shot ${s.name} FAILED: ${e.message.slice(0, 100)}`);
    } finally {
      await browser.close();
    }
  }
}

main()
  .catch((e) => console.error("FAIL", e.message))
  .finally(() => server.kill("SIGKILL"));
