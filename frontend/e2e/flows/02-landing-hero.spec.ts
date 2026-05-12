import { test, expect } from "@playwright/test";

test.describe("Flow 2 — Landing Hero (Fase 1)", () => {
  test("hero renders on desktop with headline, paragraph, deck, CTA", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/landing-preview");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /aprende inglés sin dejar/i,
    );
    await expect(page.getByText(/lee\.\s*captura\.\s*no olvides\./i)).toBeVisible();
    await expect(page.getByText("127")).toBeVisible();
    const cta = page.getByRole("link", { name: /prueba con un libro/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/signup");
  });

  test("dblclick on a paragraph word underlines it (tú controlas)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/landing-preview");
    const word = page.locator('[data-word="rain"]');
    await word.dblclick();
    await expect(page.locator('[data-underlined="true"]')).toHaveText("rain");
  });
});
