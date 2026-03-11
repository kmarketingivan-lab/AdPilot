import { test, expect } from "@playwright/test";

test.describe("Email Module", () => {
  test("should navigate to campaigns page", async ({ page }) => {
    await page.goto("/dashboard/email/campaigns");
    await expect(page).toHaveURL(/email\/campaigns/);
  });

  test("should display campaign list or wizard", async ({ page }) => {
    await page.goto("/dashboard/email/campaigns");
    // Check for campaign-related UI elements
    const campaignUI = page.locator(
      "[data-testid='campaign-list'], [data-testid='campaign-wizard'], table, button:has-text('New'), button:has-text('Create')"
    );
    await expect(campaignUI.first()).toBeVisible();
  });

  test("should navigate to email templates", async ({ page }) => {
    await page.goto("/dashboard/email/templates");
    await expect(page).toHaveURL(/email\/templates/);
  });

  test("should navigate to email lists", async ({ page }) => {
    await page.goto("/dashboard/email/lists");
    await expect(page).toHaveURL(/email\/lists/);
  });

  test("should navigate to email analytics", async ({ page }) => {
    await page.goto("/dashboard/email/analytics");
    await expect(page).toHaveURL(/email\/analytics/);
  });
});
