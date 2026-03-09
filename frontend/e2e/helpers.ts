import { type Page, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Path to the test CSV fixture. */
export const TEST_CSV_PATH = path.join(__dirname, "fixtures", "test_data.csv");

/**
 * Upload a file by setting the hidden file input on the ModelConfigPage drop zone.
 * The upload zone uses a hidden <input type="file"> that triggers on click.
 */
export async function uploadFile(page: Page, filePath: string) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);

  // Wait for column preview to appear (upload processing complete)
  await expect(page.getByText("Project Name")).toBeVisible({ timeout: 15_000 });
}

/**
 * Interact with the custom SelectDropdown component.
 * The dropdown uses a button trigger and portals options to document.body at z-[1000].
 *
 * For card-level dropdowns (e.g. "Response variable"), the label is an h2 inside a
 * GlassCard (div.rounded-xl), and the dropdown button is a sibling of the CardHeader.
 *
 * For sub-label dropdowns (e.g. "Family", "Offset"), the label is a <label> element
 * and the dropdown button is in a sibling div.relative.
 */
export async function selectDropdown(page: Page, label: string, value: string) {
  // Check if this is a sub-label (rendered as <label>) or a card title (rendered as <h2>)
  const labelCount = await page.locator("label").filter({ hasText: label }).count();

  let trigger;
  if (labelCount > 0) {
    // Sub-label: find the label, then the button in its parent container
    const labelParent = page.locator("label").filter({ hasText: label }).first().locator("..");
    trigger = labelParent.locator("button").first();
  } else {
    // Card title: find the GlassCard containing this h2, then the dropdown button
    const card = page.locator("div.rounded-xl").filter({
      has: page.locator("h2", { hasText: label }),
    }).first();
    trigger = card.locator("div.relative > button").first();
  }

  await expect(trigger).toBeVisible({ timeout: 5_000 });
  await trigger.click();

  // Options are portaled to document.body at z-[1000]
  const optionPopover = page.locator(".fixed.z-\\[1000\\]");
  await expect(optionPopover).toBeVisible({ timeout: 5_000 });

  // Find and click the option by its text
  const option = optionPopover.locator("button").filter({ hasText: value }).first();
  await expect(option).toBeVisible({ timeout: 5_000 });
  await option.click();

  // Wait for the popover to close
  await expect(optionPopover).toBeHidden({ timeout: 3_000 });
}

/**
 * Wait for data exploration to complete on the ModelBuilderPage.
 * Exploration shows a loading spinner, then factors appear in the sidebar.
 */
export async function waitForExploration(page: Page) {
  // Wait for at least one factor to appear in the sidebar
  // The factor list shows column names from the uploaded CSV
  await expect(page.locator("aside").getByText("DrivAge")).toBeVisible({ timeout: 30_000 });
}

/**
 * Navigate from landing to config page, upload file, configure, and continue to builder.
 * This is the full happy-path setup used by model-building tests.
 */
export async function fullSetupToBuilder(page: Page, filePath: string = TEST_CSV_PATH) {
  // Start at landing page
  await page.goto("/");
  await expect(page.getByText("Atelier")).toBeVisible({ timeout: 10_000 });

  // Navigate to new model
  await page.getByRole("button", { name: /New Model/ }).click();
  await expect(page).toHaveURL(/\/new/);

  // Upload file
  await uploadFile(page, filePath);

  // Fill project name
  const nameInput = page.locator('input[type="text"]');
  await nameInput.fill("E2E Test Model");

  // Select response = ClaimNb
  await selectDropdown(page, "Response variable", "ClaimNb");

  // Select family = Poisson
  await selectDropdown(page, "Family", "Poisson");

  // Wait for validation to complete
  await page.waitForTimeout(1_500);

  // Click continue
  const continueBtn = page.getByRole("button", { name: /Continue to Model Builder/ });
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  // Wait for model builder page
  await expect(page).toHaveURL(/\/model/);
  await waitForExploration(page);
}
