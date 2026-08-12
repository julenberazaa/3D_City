import { test, expect } from "@playwright/test";

test("game boots and the car drives through the world", async ({ page }) => {
  test.setTimeout(240000);
  await page.goto("/?fixture=sf-downtown");
  await page.waitForFunction(
    () => document.querySelector("#status")?.textContent?.includes("Ready"),
    { timeout: 120000 },
  );
  await page.waitForFunction(() => (window as unknown as { __game?: unknown }).__game !== undefined);

  const hud = page.locator("#hud");
  await page.keyboard.press("KeyH");
  await expect(hud).toContainText("buildings");
  await expect(hud).toContainText("roads");

  // Physics chunks activate as the streamer wakes up; poll until present.
  let state = { terrain: 0, buildings: 0 };
  const cDeadline = Date.now() + 60000;
  while (Date.now() < cDeadline) {
    state = await page.evaluate(() => {
      const g = (window as unknown as { __game: { colliders: () => { terrain: number; buildings: number } } }).__game;
      return g.colliders();
    });
    if (state.terrain >= 1 && state.buildings > 50) break;
    await page.waitForTimeout(500);
  }
  expect(state.terrain).toBeGreaterThanOrEqual(1);
  expect(state.buildings).toBeGreaterThan(50);

  const streamState = await page.evaluate(() => {
    const g = (window as unknown as { __game: { stream: () => { active: number } } }).__game;
    return g.stream();
  });
  expect(streamState.active).toBeGreaterThanOrEqual(1);

  const start = await page.evaluate(() => {
    const g = (window as unknown as { __game: { carPos: () => { x: number; y: number; z: number } } }).__game;
    return g.carPos();
  });

  await page.keyboard.down("KeyW");

  let last: { pos: { x: number; y: number; z: number }; speed: number; wheels: number; heading: number } | null = null;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    last = await page.evaluate(() => {
      const g = (window as unknown as {
        __game: { carPos: () => { x: number; y: number; z: number }; speedKmh: () => number; wheels: () => number; headingRad: () => number };
      }).__game;
      return { pos: g.carPos(), speed: g.speedKmh(), wheels: g.wheels(), heading: g.headingRad() };
    });
    const moved = Math.hypot(last.pos.x - start.x, last.pos.z - start.z);
    if (moved > 5 && last.speed > 1) break;
  }

  // Causality gate over a SHORT window (roads curve; long displacement vs
  // final heading misaligns on turns): sample p1, keep driving 2 s, sample
  // p2+heading, and require the short displacement to align with the heading.
  const p1 = await page.evaluate(() => {
    const g = (window as unknown as { __game: { carPos: () => { x: number; y: number; z: number } } }).__game;
    return g.carPos();
  });
  await page.waitForTimeout(2000);
  const p2 = await page.evaluate(() => {
    const g = (window as unknown as {
      __game: { carPos: () => { x: number; y: number; z: number }; headingRad: () => number };
    }).__game;
    return { pos: g.carPos(), heading: g.headingRad() };
  });
  await page.keyboard.up("KeyW");

  expect(last).not.toBeNull();
  const moved = Math.hypot(last!.pos.x - start.x, last!.pos.z - start.z);
  expect(moved).toBeGreaterThan(5);
  expect(last!.wheels).toBeGreaterThanOrEqual(2);
  expect(last!.speed).toBeGreaterThan(0);
  // Ground-truth gate: the car must sit ON the real terrain (catches misplaced
  // physics colliders — e.g. everything piled at the world origin).
  const ground = await page.evaluate(() => {
    const g = (window as unknown as { __game: { groundHeight: () => number } }).__game;
    return g.groundHeight();
  });
  expect(Math.abs(last!.pos.y - ground)).toBeLessThan(6);
  const windowMoved = Math.hypot(p2.pos.x - p1.x, p2.pos.z - p1.z);
  expect(windowMoved).toBeGreaterThan(1);
  const forwardDot =
    ((p2.pos.x - p1.x) * Math.sin(p2.heading) + (p2.pos.z - p1.z) * Math.cos(p2.heading)) /
    windowMoved;
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

  // R = vehicle recovery: teleports the car to a nearby safe road point and
  // clears all motion (stale wheel state would keep pushing the car).
  const beforeRecovery = await page.evaluate(() => {
    const g = (window as unknown as { __game: { carPos: () => { x: number; y: number; z: number } } }).__game;
    return g.carPos();
  });
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(1500);
  const recovered = await page.evaluate(() => {
    const g = (window as unknown as { __game: { carPos: () => { x: number; y: number; z: number }; speedKmh: () => number; groundHeight: () => number; wheels: () => number } }).__game;
    return { pos: g.carPos(), speed: g.speedKmh(), ground: g.groundHeight(), wheels: g.wheels() };
  });
  // Car is on the ground at the recovery point, close to its previous spot.
  expect(recovered.wheels).toBeGreaterThanOrEqual(2);
  expect(Math.abs(recovered.pos.y - recovered.ground)).toBeLessThan(6);
  expect(recovered.speed).toBeLessThan(20);
  expect(Math.hypot(recovered.pos.x - beforeRecovery.x, recovered.pos.z - beforeRecovery.z)).toBeLessThan(800);

  await page.screenshot({ path: "reports/visual/wp03-drive.png" });
});
