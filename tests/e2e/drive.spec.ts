import { test, expect } from "@playwright/test";

test("game boots and the car drives through the world", async ({ page }) => {
  test.setTimeout(240000);
  await page.goto("/");
  await page.waitForFunction(
    () => document.querySelector("#status")?.textContent?.includes("Ready"),
    { timeout: 120000 },
  );
  await page.waitForFunction(() => (window as unknown as { __game?: unknown }).__game !== undefined);

  const hud = page.locator("#hud");
  await expect(hud).toContainText("buildings");
  await expect(hud).toContainText("roads");

  const state = await page.evaluate(() => {
    const g = (window as unknown as { __game: { colliders: () => { terrain: number; buildings: number } } }).__game;
    return g.colliders();
  });
  expect(state.terrain).toBe(16);
  expect(state.buildings).toBeGreaterThan(3000);

  const start = await page.evaluate(() => {
    const g = (window as unknown as { __game: { carPos: () => { x: number; y: number; z: number } } }).__game;
    return g.carPos();
  });

  await page.keyboard.down("KeyW");

  let last: { pos: { x: number; y: number; z: number }; speed: number; wheels: number } | null = null;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    last = await page.evaluate(() => {
      const g = (window as unknown as {
        __game: { carPos: () => { x: number; y: number; z: number }; speedKmh: () => number; wheels: () => number };
      }).__game;
      return { pos: g.carPos(), speed: g.speedKmh(), wheels: g.wheels() };
    });
    const moved = Math.hypot(last.pos.x - start.x, last.pos.z - start.z);
    if (moved > 5 && last.speed > 1) break;
  }
  await page.keyboard.up("KeyW");

  expect(last).not.toBeNull();
  const moved = Math.hypot(last!.pos.x - start.x, last!.pos.z - start.z);
  expect(moved).toBeGreaterThan(5);
  expect(last!.wheels).toBeGreaterThanOrEqual(2);
  expect(last!.speed).toBeGreaterThan(0);
  // Causality gate: displacement must align with the spawn heading (proves
  // the throttle drove the car forward instead of rolling/drifting).
  const spawnHeading = await page.evaluate(() => {
    const g = (window as unknown as { __game: { headingRad: () => number } }).__game;
    return g.headingRad();
  });
  const forwardDot =
    ((last!.pos.x - start.x) * Math.sin(spawnHeading) + (last!.pos.z - start.z) * Math.cos(spawnHeading)) /
    moved;
  expect(forwardDot).toBeGreaterThan(0.5);

  await page.keyboard.down("KeyA");
  await page.waitForTimeout(2000);
  await page.keyboard.up("KeyA");
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const g = (window as unknown as { __game: { speedKmh: () => number } }).__game;
    return g.speedKmh();
  });
  expect(after).toBeGreaterThan(0);

  await page.screenshot({ path: "reports/visual/wp03-drive.png" });
});
