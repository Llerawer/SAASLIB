import { test, expect } from "@playwright/test";

test.describe("Flow 2 — Landing (rebuild)", () => {
  test("hero renders on desktop with headline, tagline, reader mockup, CTA", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/landing-preview");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /aprende inglés sin dejar/i,
    );
    await expect(
      page.getByText(/lee libros, artículos, videos\. captura palabras sin romper el flow/i),
    ).toBeVisible();
    // Reader mockup signals
    await expect(page.getByText(/the great gatsby/i)).toBeVisible();
    const cta = page.getByRole("link", { name: /prueba gratis/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/signup");
  });

  test("anchor 'Ver cómo funciona' scrolls to #como-funciona", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/landing-preview");
    await page.getByRole("link", { name: /ver cómo funciona/i }).click();
    await expect(page.locator("#como-funciona")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: /tres pasos\. sin esfuerzo\./i }),
    ).toBeVisible();
  });

  test("pricing section shows both tiers", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/landing-preview");
    await page.locator("#precios").scrollIntoViewIfNeeded();
    await expect(page.getByRole("link", { name: /empezar gratis/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /empezar pro · \$8\/mes/i })).toBeVisible();
  });
});
