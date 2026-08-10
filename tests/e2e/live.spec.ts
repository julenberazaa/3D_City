import { test, expect } from "@playwright/test";

/**
 * LIVE-DATA test (network required): boots the app with a real bbox that is
 * NOT part of the pinned fixtures and waits for the live world to render.
 * If the open sources are unreachable, the test skips (BLOCKED_EXTERNAL) —
 * it must never be mistaken for a code regression.
 */
test("live: renders a real non-fixture location from open sources", async ({ page }) => {
  test.setTimeout(300000);
  // One z15 tile area near San Jose (suburban, flat, moderate density).
  const bbox = "-121.955,37.320,-121.930,37.342";
  await page.goto(`/?bbox=${bbox}`);
  try {
    await page.waitForFunction(
      () => document.querySelector("#status")?.textContent?.includes("Ready"),
      { timeout: 180000 },
    );
  } catch {
    const status = await page.locator("#status").textContent().catch(() => "unknown");
    if (status && status.includes("Error")) {
      test.skip(true, `live sources unreachable in this environment: ${status}`);
    }
    throw new Error(`live boot failed; status=${status}`);
  }

  // Physics chunks activate as the streamer wakes up; poll until present.
  let state = { terrain: 0, buildings: 0, pos: { x: 0, y: 0, z: 0 } };
  const cDeadline = Date.now() + 60000;
  while (Date.now() < cDeadline) {
    state = await page.evaluate(() => {
      const g = (window as unknown as { __game: { colliders: () => { terrain: number; buildings: number }; carPos: () => { x: number; y: number; z: number } } }).__game;
      return { ...g.colliders(), pos: g.carPos() };
    });
    if (state.terrain >= 1 && state.buildings > 50) break;
    await page.waitForTimeout(500);
  }
  expect(state.terrain).toBeGreaterThanOrEqual(1);
  expect(state.buildings).toBeGreaterThan(50);
  for (const v of [state.pos.x, state.pos.y, state.pos.z]) {
    expect(Number.isFinite(v)).toBe(true);
  }

  // Rendered pixels (not a blank canvas). The drawing buffer is only valid
  // until presentation, so the read must happen inside a rAF (same as smoke).
  const colored = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        requestAnimationFrame(() => {
          const canvas = document.querySelector("canvas");
          const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
          if (!gl) return resolve(false);
          const W = gl.drawingBufferWidth;
          const H = gl.drawingBufferHeight;
          const p = new Uint8Array(4);
          gl.readPixels(Math.floor(W / 2), Math.floor(H / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
          resolve(p[0] + p[1] + p[2] > 0);
        });
      }),
  );
  expect(colored).toBe(true);

  await page.screenshot({ path: "reports/visual/wp05-live.png" });
});
