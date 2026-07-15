import { expect, test } from "@playwright/test";

test("Nimbus applies approved next step, skips rejected close date, and shows duplicate writeback", async ({ page }) => {
  await page.goto("/demo");
  await page.getByTestId("run-analysis").click();
  await expect(page.getByTestId("recommendations")).toContainText("NextStep");
  await page.locator('[data-testid^="recommendation-card-"]').filter({ hasText: "NextStep" }).getByRole("button", { name: "Approve" }).click();
  const closeDate = page.locator('[data-testid^="recommendation-card-"]').filter({ hasText: "CloseDate" });
  if (await closeDate.count()) {
    await closeDate.getByLabel(/Reject reason/).fill("Deferred pending legal confirmation");
    await closeDate.getByRole("button", { name: "Reject" }).click();
  }
  await expect(page.getByTestId("apply-approved-crm-changes")).toBeVisible();
  await page.getByTestId("apply-approved-crm-changes").click();
  await expect(page.getByTestId("writeback-results")).toContainText("success");
  await expect(page.getByTestId("crm-diff")).toContainText("changed");
  await expect(page.getByTestId("crm-diff-CloseDate")).toContainText("unchanged");
  await page.getByTestId("apply-approved-crm-changes").click();
  await expect(page.getByTestId("writeback-results")).toContainText(/duplicate|skipped/);
});

test("Orbit timeout shows API_TIMEOUT retries, audit event, and unchanged CRM", async ({ page }) => {
  await page.goto("/demo");
  await page.getByTestId("scenario-selector").selectOption("orbit-crm-timeout");
  await page.getByTestId("run-analysis").click();
  await page.locator('[data-testid^="recommendation-card-"]').first().getByRole("button", { name: "Approve" }).click();
  await page.getByTestId("apply-approved-crm-changes").click();
  await expect(page.getByTestId("writeback-results")).toContainText("failed");
  await expect(page.getByTestId("writeback-results")).toContainText("API_TIMEOUT");
  await expect(page.getByTestId("writeback-results")).toContainText("2");
  await expect(page.getByTestId("crm-unchanged-failure-confirmation")).toContainText("CRM state remained unchanged");
  await expect(page.getByTestId("failure-audit-event")).toContainText("API_TIMEOUT");
});
