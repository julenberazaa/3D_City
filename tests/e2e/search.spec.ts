import { test, expect } from "@playwright/test";

test("search: type a place, pick it, and enter its live world", async ({ page }) => {
  test.setTimeout(300000);
  await page.goto("/");
  await expect(page.locator("#place-input")).toBeVisible({ timeout: 30000 });

  await page.locator("#place-input").fill("zurich");
  await page.waitForSelector("#place-results li", { timeout: 20000 });
  const options = page.locator("#place-results li");
  const count = await options.count();
  expect(count).toBeGreaterThan(0);

  // Choose the Swiss Zurich (country CH).
  let chosen = false;
  for (let i = 0; i < count; i++) {
    const text = await options.nth(i).textContent();
    if (text && text.includes(", CH")) {
      await options.nth(i).click();
      chosen = true;
      break;
    }
  }
  expect(chosen).toBe(true);

  // The search navigates to the live bbox of Zurich.
  await page.waitForURL(/\?bbox=/, { timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelector("#status")?.textContent?.includes("Ready"),
    { timeout: 180000 },
  ).catch(async () => {
    const status = await page.locator("#status").textContent().catch(() => "unknown");
    if (status && status.includes("Network unavailable")) {
      test.skip(true, `live sources unreachable: ${status}`);
    }
    throw new Error(`search→live boot failed; status=${status}`);
  });
  const hud = await page.locator("#hud").textContent();
  expect(hud).toContain("live");
  await page.screenshot({ path: "reports/visual/wp08-search-live.png" });
});

test("search: keyboard Enter picks the top result", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(page.locator("#place-input")).toBeVisible({ timeout: 30000 });
  await page.locator("#place-input").fill("madrid");
  await page.waitForSelector("#place-results li", { timeout: 20000 });
  await page.locator("#place-input").press("Enter");
  await page.waitForURL(/\?bbox=/, { timeout: 15000 });
});
