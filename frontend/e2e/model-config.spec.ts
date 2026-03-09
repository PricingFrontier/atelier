import { test, expect } from "@playwright/test";
import { uploadFile, selectDropdown, TEST_CSV_PATH } from "./helpers";

test.describe("Model Config Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/new");
    // Wait for page to be ready — the upload zone should be visible
    await expect(page.getByText("Select your data")).toBeVisible({ timeout: 10_000 });
  });

  test("upload CSV file shows column preview and project name input", async ({ page }) => {
    await uploadFile(page, TEST_CSV_PATH);

    // After upload, we should see the configuration cards
    await expect(page.getByText("Project Name").first()).toBeVisible();
    await expect(page.getByText("Response variable").first()).toBeVisible();
    await expect(page.getByText("Distribution").first()).toBeVisible();

    // The file name should appear in the header
    await expect(page.getByText("test_data.csv")).toBeVisible();
  });

  test("select response, family, and fill name enables Continue button", async ({ page }) => {
    await uploadFile(page, TEST_CSV_PATH);

    // Continue button should be disabled initially (no response, no family, no name)
    const continueBtn = page.getByRole("button", { name: /Continue to Model Builder/ });
    await expect(continueBtn).toBeDisabled();

    // Fill project name
    const nameInput = page.locator('input[type="text"]');
    await nameInput.fill("Test Project");

    // Select response = ClaimNb
    await selectDropdown(page, "Response variable", "ClaimNb");

    // Still disabled — need family
    await expect(continueBtn).toBeDisabled();

    // Select family = Poisson
    await selectDropdown(page, "Family", "Poisson");

    // Wait for data validation to complete
    await page.waitForTimeout(1_500);

    // Now continue should be enabled
    await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  });

  test("Continue navigates to model builder page", async ({ page }) => {
    await uploadFile(page, TEST_CSV_PATH);

    // Fill project name
    const nameInput = page.locator('input[type="text"]');
    await nameInput.fill("Nav Test Project");

    // Select response and family
    await selectDropdown(page, "Response variable", "ClaimNb");
    await selectDropdown(page, "Family", "Poisson");

    // Wait for validation
    await page.waitForTimeout(1_500);

    // Click continue
    const continueBtn = page.getByRole("button", { name: /Continue to Model Builder/ });
    await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
    await continueBtn.click();

    // Should navigate to model builder
    await expect(page).toHaveURL(/\/model/);
  });
});
