import { test, expect } from "@playwright/test";

test.describe("CRM Module", () => {
  test("should navigate to contacts page", async ({ page }) => {
    await page.goto("/dashboard/crm");
    await expect(page).toHaveURL(/crm/);
  });

  test("should display contacts table", async ({ page }) => {
    await page.goto("/dashboard/crm");
    // Check for table element rendering
    const table = page.locator("table, [data-testid='contacts-table'], [role='table']");
    await expect(table.first()).toBeVisible();
  });

  test("should display pipeline view", async ({ page }) => {
    await page.goto("/dashboard/crm/pipeline");
    await expect(page).toHaveURL(/crm\/pipeline/);
  });

  test("should have search/filter functionality", async ({ page }) => {
    await page.goto("/dashboard/crm");
    const searchInput = page.locator(
      "input[type='search'], input[placeholder*='search' i], [data-testid='search-input']"
    );
    await expect(searchInput.first()).toBeVisible();
  });
});
