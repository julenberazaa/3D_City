import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/../..";
const OUT_DIR = join(ROOT, "reports", "performance");
const SHOT_DIR = join(OUT_DIR, "hardware-screenshots");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}`;

const SCENARIOS = {
  "dense-urban": { bbox: "-74.015,40.700,-73.960,40.735", label: "Manhattan (dense urban)", seconds: 600, dist: 5000 },
  "normal-town": { bbox: "8.49,47.34,8.55,47.39", label: "Zurich (normal town)", seconds: 180, dist: 1500 },
  "mountain": { bbox: "7.73,45.99,7.78,46.03", label: "Zermatt (mountainous)", seconds: 180, dist: 1500 },
};

const args = process.argv.slice(2);
const runList = args.length > 0 ? args : ["dense-urban"];
const headed = process.env.BENCH_HEADED === "1";

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("timeout")));
  });
}

async function waitForServer(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const code = await get(`${BASE}/`);
      if (code === 200) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("preview server did not start");
}

function startServer() {
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/c", "npm run preview -- --host 127.0.0.1 --port 4174 --strictPort"], { cwd: ROOT, stdio: "ignore" })
      : spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4174", "--strictPort"], { cwd: ROOT, stdio: "ignore" });
  const kill = () => {
    child.kill("SIGKILL");
  };
  return { child, kill };
}

function looksSoftware(renderer) {
  return /swiftshader|llvmpipe|basic render driver|software/i.test(renderer);
}

async function runScenario(browser, name, cfg) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const url = cfg.fixture
    ? `${BASE}/?fixture=${cfg.fixture}&benchmark=1&bench_seconds=${cfg.seconds}&bench_dist=${cfg.dist}`
    : `${BASE}/?bbox=${cfg.bbox}&benchmark=1&bench_seconds=${cfg.seconds}&bench_dist=${cfg.dist}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__benchmarkDone, null, { timeout: cfg.seconds * 1000 + 900000 });
  const result = await page.evaluate(() => window.__benchmarkResult);
  const loadMs = Date.now() - t0;

  if (looksSoftware(result.renderer)) {
    throw new Error(`run ${name} rejected: software renderer ${result.renderer}`);
  }
  await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: false });
  const out = {
    scenario: name,
    label: cfg.label,
    bbox: cfg.bbox,
    wallLoadMs: loadMs,
    result,
  };
  writeFileSync(join(OUT_DIR, `hardware-${name}.json`), JSON.stringify(out, null, 2));
  console.log(`[${name}] ${result.renderer} | fps p50 ${result.frames.fpsMedian} | p95 ${result.frames.frameMs.p95}ms | dist ${result.distance.totalM}m | gen p95 ${result.stream.genMs.p95}ms | late ${result.stream.lateChunks}`);
  await context.close();
  return out;
}

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const server = startServer();
  const results = [];
  try {
    await waitForServer(30000);
    const browser = await chromium.launch({
      headless: !headed,
      executablePath: CHROME,
    });
    try {
      const runs = runList.map((n) =>
        n.startsWith("fixture=")
          ? { name: n, cfg: { fixture: n.slice(8), label: `fixture ${n.slice(8)}`, seconds: 60, dist: 1000 } }
          : { name: n, cfg: SCENARIOS[n] ?? { bbox: n, label: n, seconds: 60, dist: 1000 } },
      );
      for (const run of runs) {
        results.push(await runScenario(browser, run.name, run.cfg));
      }
    } finally {
      await browser.close();
    }
    const env = {
      browser: "Google Chrome",
      version: results[0]?.result?.userAgent ?? "n/a",
      platform: results[0]?.result?.platform ?? "n/a",
      renderer: results[0]?.result?.renderer ?? "n/a",
      vendor: results[0]?.result?.vendor ?? "n/a",
      webgl: results[0]?.result?.webglVersion ?? "n/a",
      hardwareConcurrency: results[0]?.result?.hardwareConcurrency ?? 0,
    };
    writeFileSync(join(OUT_DIR, "hardware-environment.json"), JSON.stringify(env, null, 2));
    writeFileSync(join(OUT_DIR, "hardware-summary.json"), JSON.stringify(results, null, 2));
    console.log("ENV", JSON.stringify(env));
  } finally {
    server.kill();
  }
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
