import { test, expect } from "@playwright/test";

test.describe("Flow 2 — Landing Hero (Fase 1)", () => {
  test("hero renders on desktop with copy, stage, deck", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/landing-preview");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/aprende inglés/i);
    await expect(page.getByText(/lectura · pronunciación · memoria/i)).toBeVisible();
    await expect(page.getByText("127")).toBeVisible();
    await expect(page.getByRole("link", { name: /empieza gratis/i })).toBeVisible();
  });

  test("dblclick on a paragraph word underlines it (tú controlas)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/landing-preview");
    const word = page.locator('[data-word="rain"]');
    await word.dblclick();
    await expect(page.locator('[data-underlined="true"]')).toHaveText("rain");
  });

  test("mobile sticky CTA appears at narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/landing-preview");
    const stickyCta = page.locator(".fixed").getByRole("link", { name: /empieza gratis/i });
    await expect(stickyCta).toBeVisible();
  });
});
