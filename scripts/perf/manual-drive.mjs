import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/../..";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const MODES = new Set(["before", "after", "deployed"]);
const mode = process.argv[2];
if (!MODES.has(mode)) {
  console.error(`usage: node scripts/perf/manual-drive.mjs <before|after|deployed> [scenario]`);
  process.exit(1);
}
const SHOT_DIR = join(ROOT, "reports", "visual", "final-ux", mode);
const OUT = join(ROOT, "reports", "final-ux");
mkdirSync(SHOT_DIR, { recursive: true });
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE ?? "http://localhost:4173";
const SCENARIOS = {
  "normal-town": { url: `${BASE}/?bbox=8.49,47.34,8.55,47.39`, min: { secs: 90, dist: 800 }, label: "Zurich (normal town)" },
  "dense-urban": { url: `${BASE}/?bbox=-74.015,40.700,-73.960,40.735`, min: { secs: 90, dist: 500 }, label: "Manhattan (dense urban)" },
  "mountain": { url: `${BASE}/?bbox=7.73,45.99,7.78,46.03`, min: { secs: 90, dist: 500 }, label: "Zermatt (mountainous)" },
  "water": { url: `${BASE}/?fixture=sf-downtown`, min: { secs: 60, dist: 400 }, label: "SF downtown fixture (water visible)" },
  "owner-bbox": { url: `${BASE}/?bbox=-3.2424,43.3609,-3.1984,43.4049`, min: { secs: 90, dist: 500 }, label: "Owner bbox (Santander, Spain)" },
};

const DURATION_MS = 20 * 60 * 1000;

function randomInt(n) {
  return Math.floor(Math.random() * n);
}

async function runScenario(browser, name, cfg, tag) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`));

  await page.goto(cfg.url, { waitUntil: "domcontentloaded" });
  let statusText = "booting";
  const tBoot = Date.now();
  while (Date.now() - tBoot < 240000) {
    statusText = (await page.locator("#status").textContent().catch(() => "?")) ?? "";
    if (statusText.includes("Ready")) break;
    if (statusText.includes("Error") || statusText.includes("unavailable")) break;
    await page.waitForTimeout(1500);
  }
  if (!statusText.includes("Ready")) {
    if (statusText.includes("unavailable")) throw new Error(`BLOCKED_EXTERNAL: live sources unreachable (${statusText})`);
    throw new Error(`boot failed; status=${statusText}`);
  }
  // Wait for actual rendered pixels (chunk build is async; "Ready" precedes
  // the first frame): require BOTH center and lower-third to be non-fog, then
  // give the world a moment to build before shooting (first network visits are
  // slower than cached previews).
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas");
    if (!c) return false;
    const ctx = c.getContext("webgl2");
    if (!ctx) return false;
    const px = (fx, fy) => {
      const out = new Uint8Array(4);
      ctx.readPixels(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, out);
      return out;
    };
    const notFog = (p) => p[3] > 0 && (p[0] > 12 || p[1] > 12 || p[2] > 12);
    return notFog(px(0.5, 0.45)) && notFog(px(0.5, 0.2));
  }, { timeout: 60000 }).catch(() => {
    // Even a sky frame is fine after the cap — the shot is best-effort.
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(SHOT_DIR, `${tag}-${name}-spawn.png`) });

  await page.evaluate(() => {
    const dts = [];
    let last = performance.now();
    const loop = (t) => {
      dts.push(t - last);
      last = t;
      if (dts.length > 30000) dts.shift();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.__stats = {
      collect: () => {
        const s = [...dts].sort((a, b) => a - b);
        const p = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
        const severe = s.filter((d) => d >= 250).length;
        let longest = 0;
        for (const d of s) longest = Math.max(longest, d);
        return { fpsMedian: 1000 / p(0.5), p95: p(0.95), p99: p(0.99), severe, longest, n: s.length };
      },
    };
  });

  const t0 = Date.now();
  let driven = 0;
  let recoveries = 0;
  let lastPos = null;
  let lastMove = Date.now();
  const teleports = [];
  const steering = [];
  let steeringFor = 0;
  let steerKey = null;

  await page.keyboard.down("KeyW");

  while (Date.now() - t0 < DURATION_MS) {
    if (Date.now() - t0 > 1000 && steeringFor <= 0) {
      steerKey = randomInt(2) ? "KeyA" : "KeyD";
      steeringFor = 600 + randomInt(1400);
      if (steerKey) await page.keyboard.down(steerKey);
      steering.push(Date.now());
    }
    if (steeringFor === 500 && steerKey) await page.keyboard.up(steerKey);
    if (steeringFor > 0) steeringFor -= 500;
    if (randomInt(40) === 0) {
      await page.keyboard.up("KeyW");
      await page.waitForTimeout(300 + randomInt(600));
      await page.keyboard.down("KeyW");
    }

    const pos = await page.evaluate(() => window.__game?.carPos() ?? null);
    if (pos) {
      const p = { x: pos.x, z: pos.z };
      if (lastPos) {
        const d = Math.hypot(p.x - lastPos.x, p.z - lastPos.z);
        if (d < 30) {
          driven += d;
          if (d > 0.3) lastMove = Date.now();
        } else {
          teleports.push(Math.round(d));
        }
      }
      lastPos = p;
    }
    if (Date.now() - lastMove > 6000) {
      await page.keyboard.press("KeyR");
      recoveries++;
      lastMove = Date.now();
      await page.waitForTimeout(1500);
      lastPos = null;
      const p2 = await page.evaluate(() => window.__game?.carPos() ?? null);
      if (p2) lastPos = { x: p2.x, z: p2.z };
    }

    const done = Date.now() - t0 > (cfg.min.secs * 1000) && driven >= cfg.min.dist;
    if (done) break;
    await page.waitForTimeout(500);
  }
  await page.keyboard.up("KeyW");
  if (steerKey) await page.keyboard.up(steerKey);

  const frame = await page.evaluate(() => window.__stats.collect());
  await page.screenshot({ path: join(SHOT_DIR, `${tag}-${name}-drive.png`) });

  const record = {
    scenario: name,
    label: cfg.label,
    url: cfg.url,
    drivenM: Math.round(driven),
    durationS: Math.round((Date.now() - t0) / 1000),
    recoveries,
    teleports,
    steeringEvents: steering.length,
    fpsMedian: Math.round(frame.fpsMedian),
    frameMs: { p95: +frame.p95.toFixed(1), p99: +frame.p99.toFixed(1) },
    severeStalls250ms: frame.severe,
    longestFrameMs: Math.round(frame.longest),
    consoleErrors: consoleErrors.slice(0, 5),
    evidence: [`reports/visual/final-ux/${tag}-${name}-spawn.png`, `reports/visual/final-ux/${tag}-${name}-drive.png`],
  };
  writeFileSync(join(OUT, `manual-${tag}-${name}.json`), JSON.stringify(record, null, 2));
  console.log(`[${tag}/${name}] driven ${record.drivenM}m in ${record.durationS}s, R=${recoveries}, fps p50 ${record.fpsMedian} p95 ${record.frameMs.p95}ms, stalls ${record.severeStalls250ms}, longest ${record.longestFrameMs}ms, errs ${record.consoleErrors.length}`);
  await page.close();
  return record;
}

const tag = mode;
const only = process.argv[3];
const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const results = {};
for (const [name, cfg] of Object.entries(SCENARIOS)) {
  if (only && name !== only) continue;
  try {
    results[name] = await runScenario(browser, name, cfg, tag);
  } catch (e) {
    results[name] = { scenario: name, label: cfg.label, error: e.message };
    console.log(`[${tag}/${name}] ${e.message}`);
  }
}
await browser.close();
writeFileSync(join(OUT, `manual-${tag}-summary.json`), JSON.stringify(results, null, 2));
