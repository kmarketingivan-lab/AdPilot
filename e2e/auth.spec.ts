import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should show sign-in page", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(page).toHaveURL(/signin/);
  });

  test("should redirect unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect to sign-in when not authenticated
    await expect(page).toHaveURL(/signin|auth/);
  });

  test("should display sign-in form elements", async ({ page }) => {
    await page.goto("/auth/signin");
    // Check for common auth form elements
    const form = page.locator("form");
    await expect(form).toBeVisible();
  });
});
