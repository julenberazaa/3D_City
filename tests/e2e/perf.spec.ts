import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("performance: drive session frame-time/memory capture", async ({ page }) => {
  test.setTimeout(600000);
  const reportDir = fileURLToPath(new URL("../../reports/performance", import.meta.url));
  mkdirSync(reportDir, { recursive: true });

  await page.goto("/?bbox=-122.425,37.767,-122.396,37.792");
  await page.waitForFunction(
    () => document.querySelector("#status")?.textContent?.includes("Ready"),
    { timeout: 120000 },
  );

  const frames: Array<{ t: number; fps: number }> = [];

  // rAF-based FPS: count render-loop callbacks over a fixed window.
  const startSampler = () =>
    page.evaluate(() => {
      const w = window as unknown as { __rAFCount?: number; __rAFStart?: number };
      w.__rAFCount = 0;
      w.__rAFStart = performance.now();
      const tick = () => {
        w.__rAFCount = (w.__rAFCount ?? 0) + 1;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

  await page.keyboard.down("KeyW");
  for (let i = 0; i < 10; i++) {
    await startSampler();
    await page.waitForTimeout(5000);
    const now = Date.now();
    const sample = await page.evaluate(() => {
      const w = window as unknown as { __rAFCount?: number; __rAFStart?: number };
      const elapsed = (performance.now() - (w.__rAFStart ?? 0)) / 1000;
      const fps = elapsed > 0 ? (w.__rAFCount ?? 0) / elapsed : 0;
      const g = (window as unknown as {
        __game: { stream: () => { active: number; physicsChunks: number }; carPos: () => { x: number; y: number; z: number } };
      }).__game;
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return {
        fps: Math.round(fps * 10) / 10,
        stream: g.stream(),
        pos: g.carPos(),
        heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : -1,
      };
    });
    frames.push({ t: now, fps: sample.fps });
    console.log("sample", i, JSON.stringify(sample));
  }
  await page.keyboard.up("KeyW");

  const fpsValues = frames.map((f) => f.fps).filter((f) => f > 0);
  fpsValues.sort((a, b) => a - b);
  const p50 = fpsValues[Math.floor(fpsValues.length / 2)];
  const p95 = fpsValues[Math.floor(fpsValues.length * 0.95)];
  const summary = {
    platform: process.platform,
    browser: "chromium-headless-swiftshader",
    note: "software rasterizer (SwiftShader): not representative of hardware GPU; adaptive DPR engaged",
    samples: frames,
    fps: { p50, p95, min: fpsValues[0], max: fpsValues[fpsValues.length - 1] },
  };
  writeFileSync(`${reportDir}/drive-session.json`, JSON.stringify(summary, null, 2));
  console.log("FPS p50", p50, "p95", p95);
});
