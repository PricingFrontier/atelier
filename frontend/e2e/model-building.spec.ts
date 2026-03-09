import { test, expect } from "@playwright/test";
import { fullSetupToBuilder, waitForExploration } from "./helpers";

test.describe("Model Building", () => {
  test("full journey: upload, configure, explore, see factors", async ({ page }) => {
    await fullSetupToBuilder(page);

    // The sidebar should show available factors (columns minus response)
    // DrivAge, Region, Area, BonusMalus, Exposure should be listed
    await expect(page.getByText("DrivAge")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Region")).toBeVisible();
    await expect(page.getByText("BonusMalus")).toBeVisible();

    // Factor count summary in sidebar
    await expect(page.getByText(/numeric/)).toBeVisible();
    await expect(page.getByText(/categorical/)).toBeVisible();
  });

  test("right-click factor opens context menu and adds term", async ({ page }) => {
    await fullSetupToBuilder(page);

    // Find the Region factor row (categorical) and right-click it
    const regionRow = page.getByText("Region").first();
    await regionRow.click({ button: "right" });

    // Context menu should appear (z-[100]) with Category option
    const contextMenu = page.locator(".fixed.z-\\[100\\]");
    await expect(contextMenu).toBeVisible({ timeout: 5_000 });
    const categoryOption = contextMenu.getByText("Category").first();
    await expect(categoryOption).toBeVisible({ timeout: 5_000 });
    await categoryOption.click();

    // A term badge should appear under Region (e.g. "[Cat]")
    // Term badge "Cat" should appear in the sidebar for Region
    await expect(page.locator("aside").getByText("Cat", { exact: true })).toBeVisible({ timeout: 5_000 });

    // Fit button should now be enabled (has terms)
    const fitBtn = page.getByRole("button", { name: /Fit Model/ });
    await expect(fitBtn).toBeEnabled();
  });

  test("fit model shows results on Model tab", async ({ page }) => {
    // Increase timeout for this test — fitting takes time
    test.setTimeout(120_000);

    await fullSetupToBuilder(page);

    // Add a categorical term: Region
    const regionRow = page.getByText("Region").first();
    await regionRow.click({ button: "right" });
    const ctxMenu = page.locator(".fixed.z-\\[100\\]");
    await expect(ctxMenu).toBeVisible({ timeout: 5_000 });
    await ctxMenu.getByText("Category").first().click();
    // Term badge "Cat" should appear in the sidebar for Region
    await expect(page.locator("aside").getByText("Cat", { exact: true })).toBeVisible({ timeout: 5_000 });

    // Click Fit Model
    const fitBtn = page.getByRole("button", { name: /Fit Model/ });
    await expect(fitBtn).toBeEnabled();
    await fitBtn.click();

    // Wait for fitting to complete — button goes back to "Fit Model"
    await expect(fitBtn).toContainText("Fit Model", { timeout: 60_000 });

    // Model tab should appear and be clickable
    // Use exact name match to distinguish from "Fit Model" button
    const modelTab = page.getByRole("button", { name: "Model", exact: true }).first();
    // Wait for Model tab to appear (it shows up after fit results arrive)
    await expect(modelTab).toBeVisible({ timeout: 10_000 });
    await modelTab.click();

    // Model panel should show some fit statistics
    await expect(page.getByText(/deviance|AIC|BIC|coefficient/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("fit model auto-saves and appears in History tab", async ({ page }) => {
    // Increase timeout — fitting takes time
    test.setTimeout(120_000);

    await fullSetupToBuilder(page);

    // Add a term
    const regionRow = page.getByText("Region").first();
    await regionRow.click({ button: "right" });
    const ctxMenu2 = page.locator(".fixed.z-\\[100\\]");
    await expect(ctxMenu2).toBeVisible({ timeout: 5_000 });
    await ctxMenu2.getByText("Category").first().click();
    // Term badge "Cat" should appear in the sidebar for Region
    await expect(page.locator("aside").getByText("Cat", { exact: true })).toBeVisible({ timeout: 5_000 });

    // Fit model
    const fitBtn = page.getByRole("button", { name: /Fit Model/ });
    await fitBtn.click();
    await expect(fitBtn).toContainText("Fit Model", { timeout: 60_000 });

    // History tab should appear (it appears when history.length > 0)
    const historyTab = page.getByRole("button", { name: /History/ }).first();
    await expect(historyTab).toBeVisible({ timeout: 10_000 });
    await historyTab.click();

    // Should see at least one version entry
    await expect(page.getByText(/v1|Version/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
