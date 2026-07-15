import { expect, test } from "@playwright/test";

test.describe("/demo human approval UI", () => {
  test("Nimbus supports independent edit approval and close-date rejection", async ({ page }) => {
    await page.goto("/demo");
    await page.getByTestId("run-analysis").click();
    await expect(page.getByTestId("recommendations")).toContainText("Current value");
    await expect(page.getByTestId("recommendations")).toContainText("Suggested value");
    await expect(page.getByTestId("recommendations")).toContainText("Evidence");
    await expect(page.getByTestId("recommendations")).toContainText("Approval requirement");

    const nextStep = page.locator('[data-testid^="recommendation-card-"]').filter({ hasText: "NextStep" }).first();
    const nextStepId = await nextStep.getAttribute("data-testid");
    const nextId = nextStepId!.replace("recommendation-card-", "");
    await nextStep.getByTestId(`edit-value-${nextId}`).fill("Send mutual action plan and confirm procurement owner");
    await nextStep.getByTestId(`edit-approve-${nextId}`).click();
    await expect(nextStep.getByTestId(`status-${nextId}`)).toContainText("edited");
    await expect(nextStep.getByTestId(`version-${nextId}`)).toContainText("1");

    const closeDate = page.locator('[data-testid^="recommendation-card-"]').filter({ hasText: "CloseDate" }).first();
    const closeDateId = await closeDate.getAttribute("data-testid");
    const closeId = closeDateId!.replace("recommendation-card-", "");
    await closeDate.getByTestId(`reject-reason-${closeId}`).fill("Close date needs CRO confirmation first");
    await closeDate.getByTestId(`reject-${closeId}`).click();
    await expect(closeDate.getByTestId(`status-${closeId}`)).toContainText("rejected");
    await expect(nextStep.getByTestId(`status-${nextId}`)).toContainText("edited");
  });

  test("requires validation inputs and displays version conflict refresh prompt", async ({ page }) => {
    await page.goto("/demo");
    await page.getByTestId("run-analysis").click();
    const card = page.locator('[data-testid^="recommendation-card-"]').first();
    const testId = await card.getAttribute("data-testid");
    const id = testId!.replace("recommendation-card-", "");

    await card.getByTestId(`edit-approve-${id}`).click();
    await expect(card.getByRole("alert")).toContainText("Edited value is required");
    await card.getByTestId(`reject-${id}`).click();
    await expect(card.getByRole("alert")).toContainText("Rejection reason is required");
    await card.getByTestId(`snooze-date-${id}`).fill("2020-01-01T00:00");
    await card.getByTestId(`snooze-${id}`).click();
    await expect(card.getByRole("alert")).toContainText("future snooze date");

    await page.route(`/api/demo/recommendations/${id}`, (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "VERSION_CONFLICT", message: "Recommendation version 1 does not match expected version 0." } }) }));
    await card.getByTestId(`approve-${id}`).click();
    await expect(page.getByTestId("recommendation-error")).toContainText("Refresh or re-run analysis");
  });
});
