import { test, expect } from "@playwright/test";

test.describe("Heatmap Module", () => {
  test("should navigate to heatmap setup page", async ({ page }) => {
    await page.goto("/dashboard/heatmap");
    await expect(page).toHaveURL(/heatmap/);
  });

  test("should display tracking snippet or setup UI", async ({ page }) => {
    await page.goto("/dashboard/heatmap");
    // Check for setup-related UI: snippet code block, add site button, etc.
    const setupUI = page.locator(
      "code, pre, [data-testid='tracking-snippet'], button:has-text('Add'), button:has-text('Setup')"
    );
    await expect(setupUI.first()).toBeVisible();
  });

  test("should navigate to sessions page", async ({ page }) => {
    await page.goto("/dashboard/heatmap/sessions");
    await expect(page).toHaveURL(/heatmap\/sessions/);
  });

  test("should navigate to rage clicks page", async ({ page }) => {
    await page.goto("/dashboard/heatmap/rage-clicks");
    await expect(page).toHaveURL(/heatmap\/rage-clicks/);
  });

  test("should navigate to funnel page", async ({ page }) => {
    await page.goto("/dashboard/heatmap/funnel");
    await expect(page).toHaveURL(/heatmap\/funnel/);
  });
});
