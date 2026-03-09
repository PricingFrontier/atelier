import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("loads with title Atelier", async ({ page }) => {
    await page.goto("/");

    // The main heading
    const heading = page.locator("h1");
    await expect(heading).toBeVisible({ timeout: 10_000 });
    await expect(heading).toHaveText("Atelier");

    // Subtitle text
    await expect(page.getByText("Generalized Linear Model Workbench")).toBeVisible();
  });

  test("New Model button navigates to config page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });

    const newModelBtn = page.getByRole("button", { name: /New Model/ });
    await expect(newModelBtn).toBeVisible();
    await newModelBtn.click();

    await expect(page).toHaveURL(/\/new/);
    // Config page header should show "New Model"
    await expect(page.locator("header").getByText("New Model")).toBeVisible();
  });

  test("keyboard shortcut N navigates to config page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press("n");

    await expect(page).toHaveURL(/\/new/);
  });
});
