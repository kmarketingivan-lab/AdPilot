import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("should load dashboard page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveTitle(/AdPilot|Dashboard/i);
  });

  test("should display KPI cards", async ({ page }) => {
    await page.goto("/dashboard");
    // Check for KPI card elements
    const cards = page.locator("[data-testid='kpi-card'], .kpi-card, [class*='card']");
    await expect(cards.first()).toBeVisible();
  });

  test("should display sidebar navigation", async ({ page }) => {
    await page.goto("/dashboard");
    // Check sidebar contains navigation links
    const sidebar = page.locator("nav, [data-testid='sidebar'], aside");
    await expect(sidebar.first()).toBeVisible();
  });

  test("should have working navigation links", async ({ page }) => {
    await page.goto("/dashboard");
    // Check that main module links exist
    const socialLink = page.locator("a[href*='social']");
    const crmLink = page.locator("a[href*='crm']");
    const emailLink = page.locator("a[href*='email']");
    await expect(socialLink.first()).toBeVisible();
    await expect(crmLink.first()).toBeVisible();
    await expect(emailLink.first()).toBeVisible();
  });
});
