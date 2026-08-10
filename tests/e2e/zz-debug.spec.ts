import { test } from "@playwright/test";

test("debug: car on real physics", async ({ page }) => {
  test.setTimeout(240000);
  await page.goto("/");
  await page.waitForFunction(
    () => document.querySelector("#status")?.textContent?.includes("Ready"),
    { timeout: 120000 },
  );
  await page.keyboard.down("KeyW");
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => {
      const g = (window as unknown as {
        __game: { carPos: () => { x: number; y: number; z: number }; speedKmh: () => number; wheels: () => number; headingRad: () => number; groundHeight: () => number; stream: () => { physicsChunks: number } };
      }).__game;
      const p = g.carPos();
      return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +p.y.toFixed(2), g: +g.groundHeight().toFixed(2), v: +g.speedKmh().toFixed(1), w: g.wheels(), phys: g.stream().physicsChunks };
    });
    console.log("t+" + ((i + 1) * 2) + "s", JSON.stringify(s));
  }
  await page.keyboard.up("KeyW");
});
