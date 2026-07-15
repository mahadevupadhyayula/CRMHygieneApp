import { expect, test } from "@playwright/test";

test("founder interview demo validates Nimbus approval flow then Orbit timeout reset flow", async ({ page }) => {
  await page.goto("/demo");

  await expect(page.getByTestId("scenario-selector")).toHaveValue("nimbus-happy-path");
  await page.getByTestId("transcript-input").fill("Next step: schedule a procurement mapping call with Priya in procurement by 2026-07-17. Decision-maker: Dana CFO owns final approval. Procurement status: packet requested but not yet received. Legal status: customer legal flagged non-standard indemnity language as a high risk. Close date risk: July 31 is questionable unless legal confirms by next week.");
  await page.getByTestId("run-analysis").click();
  await expect(page.getByTestId("recommendations")).toContainText("NextStep");

  const nextStep = page.locator('[data-testid^="recommendation-card-"]').filter({ hasText: "NextStep" }).first();
  await nextStep.getByLabel(/Edit value/).fill("Schedule procurement mapping call with Priya and legal by 2026-07-18");
  await nextStep.getByRole("button", { name: "Edit and approve" }).click();
  await expect(nextStep).toContainText("edited");

  const closeDate = page.locator('[data-testid^="recommendation-card-"]').filter({ hasText: "CloseDate" }).first();
  if (await closeDate.count()) {
    await closeDate.getByLabel(/Reject reason/).fill("Founder demo: reject close date until legal confirms timing.");
    await closeDate.getByRole("button", { name: "Reject" }).click();
    await expect(closeDate).toContainText("rejected");
  }

  await expect(page.getByTestId("apply-approved-crm-changes")).toBeVisible();
  await page.getByTestId("apply-approved-crm-changes").click();
  await expect(page.getByTestId("writeback-results")).toContainText("success");
  await expect(page.getByTestId("crm-before-NextStep")).toContainText("Send recap from May discovery call");
  await expect(page.getByTestId("crm-after-NextStep")).toContainText("Schedule procurement mapping call with Priya and legal by 2026-07-18");
  await expect(page.getByTestId("execution-timeline")).toContainText("success");

  await page.getByTestId("reset-scenario").click();
  await expect(page.getByTestId("empty-results")).toBeVisible();

  await page.getByTestId("scenario-selector").selectOption("orbit-crm-timeout");
  await page.getByTestId("run-analysis").click();
  const orbitRec = page.locator('[data-testid^="recommendation-card-"]').first();
  await orbitRec.getByRole("button", { name: "Approve" }).click();
  await page.getByTestId("apply-approved-crm-changes").click();
  await expect(page.getByTestId("writeback-results")).toContainText("API_TIMEOUT");
  await expect(page.locator('[data-testid^="retry-count-"]').first()).toContainText("2");
  await expect(page.locator('[data-testid^="error-code-"]').first()).toContainText("API_TIMEOUT");
  await expect(page.getByTestId("crm-changed-summary")).toContainText("no — CRM state remained unchanged");
});
