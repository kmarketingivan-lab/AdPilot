import { test, expect } from "@playwright/test";

test.describe("Social Module", () => {
  test("should navigate to social composer", async ({ page }) => {
    await page.goto("/dashboard/social/compose");
    await expect(page).toHaveURL(/social\/compose/);
  });

  test("should display platform selector in composer", async ({ page }) => {
    await page.goto("/dashboard/social/compose");
    // Check for platform selection UI (Instagram, Facebook, LinkedIn, etc.)
    const platformSelector = page.locator(
      "[data-testid='platform-selector'], [class*='platform'], button:has-text('Instagram'), button:has-text('Facebook')"
    );
    await expect(platformSelector.first()).toBeVisible();
  });

  test("should display social accounts page", async ({ page }) => {
    await page.goto("/dashboard/social/accounts");
    await expect(page).toHaveURL(/social\/accounts/);
  });

  test("should display social analytics page", async ({ page }) => {
    await page.goto("/dashboard/social/analytics");
    await expect(page).toHaveURL(/social\/analytics/);
  });
});
