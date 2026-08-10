import { expect, test, type Locator } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const visualDir = fileURLToPath(new URL("../../reports/visual", import.meta.url));

/** Scene background / fog color (#b8cfe0) — any rendered ground pixel must differ from it. */
const FOG = [184, 207, 224];
const isFog = (p: number[]): boolean =>
  Math.abs(p[0] - FOG[0]) <= 8 && Math.abs(p[1] - FOG[1]) <= 8 && Math.abs(p[2] - FOG[2]) <= 8;

/** readPixels inside a rAF so the read happens in the same frame as the app's render
 * (the drawing buffer is only valid until presentation). Coordinates are relative
 * (0..1, y up from the buffer's bottom-left), resolved against the drawing buffer size. */
function sampleCanvas(canvas: Locator, relX: number, relY: number): Promise<number[]> {
  return canvas.evaluate(
    (el, [rx, ry]) =>
      new Promise<number[]>((resolve) => {
        requestAnimationFrame(() => {
          const c = el as HTMLCanvasElement;
          const gl = c.getContext("webgl2") || c.getContext("webgl");
          if (!gl) {
            resolve([0, 0, 0, 0]);
            return;
          }
          const px = Math.round(rx * (gl.drawingBufferWidth - 1));
          const py = Math.round(ry * (gl.drawingBufferHeight - 1));
          const p = new Uint8Array(4);
          gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
          resolve([...p]);
        });
      }),
    [relX, relY],
  );
}

/** Poll until the pixel is no longer the clear/fog color (i.e., geometry actually rendered there). */
async function waitForRendered(canvas: Locator, relX: number, relY: number, label: string): Promise<number[]> {
  let last: number[] = [];
  for (let i = 0; i < 60; i++) {
    last = await sampleCanvas(canvas, relX, relY);
    if (!isFog(last) && !(last[0] === 0 && last[1] === 0 && last[2] === 0)) return last;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`pixel ${label} never rendered; last=${JSON.stringify(last)}`);
}

test("static vertical slice: fixture world boots and renders", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Ready", { timeout: 90000 });
  const hud = await page.locator("#hud");
  await expect(hud).toBeVisible();
  expect(await hud.innerText()).toContain("buildings");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(400);
  expect(box!.height).toBeGreaterThanOrEqual(400);

  // With streaming the world appears around the player; poll the screen center
  // (the car / near terrain) and a lower-third point for rendered geometry,
  // not the clear/fog color — catches the terrain-facing-down class of bug.
  const center = await waitForRendered(canvas, 0.5, 0.45, "center");
  expect(isFog(center)).toBe(false);
  const lower = await waitForRendered(canvas, 0.5, 0.2, "lower");
  expect(isFog(lower)).toBe(false);

  mkdirSync(visualDir, { recursive: true });
  await page.screenshot({ path: `${visualDir}/wp02-slice.png` });
});
