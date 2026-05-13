import { test, expect } from "@playwright/test";

import {
  createTestUser,
  deleteTestUser,
  findUserIdByEmail,
  makeTestCreds,
} from "../fixtures/supabase-admin";

test.describe("Flow 1 — Auth (UI signup, login, error states)", () => {
  test("signup creates account and redirects to /library", async ({ page }) => {
    const { email, password } = makeTestCreds();
    let createdUserId: string | null = null;

    try {
      await page.goto("/signup");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /crear cuenta/i }).click();

      await page.waitForURL("**/library", { timeout: 15_000 });
      await expect(page).toHaveURL(/\/library$/);

      createdUserId = await findUserIdByEmail(email);
      expect(createdUserId, "user should exist in auth.users after signup").not.toBeNull();
    } finally {
      if (createdUserId) await deleteTestUser(createdUserId);
    }
  });

  test("login with valid credentials redirects to /library", async ({ page }) => {
    const { email, password } = makeTestCreds();
    const userId = await createTestUser(email, password);

    try {
      await page.goto("/login");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /^entrar/i }).click();

      await page.waitForURL("**/library", { timeout: 15_000 });
      await expect(page).toHaveURL(/\/library$/);
    } finally {
      await deleteTestUser(userId);
    }
  });

  test("login with wrong password shows error and stays on /login", async ({ page }) => {
    const { email, password } = makeTestCreds();
    const userId = await createTestUser(email, password);

    try {
      await page.goto("/login");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill("wrong-password-here");
      await page.getByRole("button", { name: /^entrar/i }).click();

      await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await deleteTestUser(userId);
    }
  });
});
