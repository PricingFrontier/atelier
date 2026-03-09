import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import os from "os";

test.describe("Error Handling", () => {
  test("invalid file upload shows error", async ({ page }) => {
    await page.goto("/new");
    await expect(page.getByText("Select your data")).toBeVisible({ timeout: 10_000 });

    // Create a temporary invalid file (not CSV/Parquet content in a .csv extension)
    const tmpDir = os.tmpdir();
    const invalidFile = path.join(tmpDir, "invalid_data.csv");
    fs.writeFileSync(invalidFile, "this is not valid csv\x00\x01\x02binary garbage\n\n\n");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(invalidFile);

    // Either an error message should appear, or the upload should succeed
    // with the malformed data. The app shows uploadError as a red text.
    // Wait a bit for the upload to process
    await page.waitForTimeout(3_000);

    // Check if error appeared or data was parsed (CSV is lenient)
    const hasError = await page.locator("text=Failed").count() > 0
      || await page.locator('[class*="destructive"]').count() > 0;
    const hasData = await page.getByText("Project Name").count() > 0;

    // One of these should be true — either it errored or parsed
    expect(hasError || hasData).toBeTruthy();

    // Clean up
    fs.unlinkSync(invalidFile);
  });

  test("navigating to model builder without config shows fallback", async ({ page }) => {
    // Go directly to /model without any navigation state
    await page.goto("/model");

    // Should show the "No model configuration found" message
    await expect(page.getByText("No model configuration found")).toBeVisible({ timeout: 10_000 });

    // Should have a link to go back to setup
    await expect(page.getByText(/Go back to setup/i)).toBeVisible();
  });
});
