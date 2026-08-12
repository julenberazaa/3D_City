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
  await page.keyboard.press("KeyH");
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

test("search: arrow keys navigate results and Enter picks the selection (a11y)", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(page.locator("#place-input")).toBeVisible({ timeout: 30000 });
  await page.locator("#place-input").fill("berlin");
  await page.waitForSelector("#place-results li", { timeout: 20000 });
  const input = page.locator("#place-input");

  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(input).toHaveAttribute("aria-activedescendant", "place-opt-0");
  await expect(page.locator("#place-opt-0")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#place-opt-1")).toHaveAttribute("aria-selected", "false");

  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", "place-opt-1");
  await expect(page.locator("#place-opt-1")).toHaveAttribute("aria-selected", "true");

  await input.press("ArrowUp");
  await expect(input).toHaveAttribute("aria-activedescendant", "place-opt-0");

  await input.press("Enter");
  await page.waitForURL(/\?bbox=/, { timeout: 15000 });
});

test("search: status announces loading/ready with live regions", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/?fixture=sf-downtown");
  await page.waitForFunction(
    () => document.querySelector("#status")?.textContent?.includes("Ready"),
    { timeout: 120000 },
  );
  const status = page.locator("#status");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
});
