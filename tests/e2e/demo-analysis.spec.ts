import { expect, test } from "@playwright/test";

test.describe("/demo backend analysis UI", () => {
  test("renders disclaimer", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByTestId("demo-disclaimer")).toContainText("Extraction is deterministic");
    await expect(page.getByTestId("demo-disclaimer")).toContainText("CRM writeback is simulated");
  });

  test("scenario selector resets transcript", async ({ page }) => {
    await page.goto("/demo");
    await page.getByTestId("transcript-input").fill("custom transcript");
    await page.getByTestId("scenario-selector").selectOption("solo-healthy-crm");
    await expect(page.getByTestId("transcript-input")).toHaveValue(/Morgan CFO/);
  });

  test("Run Hygiene Analysis calls backend and edited transcript changes displayed result", async ({ page }) => {
    await page.goto("/demo");
    await page.getByTestId("run-analysis").click();
    await expect(page.getByTestId("extracted-facts")).toContainText("Dana CFO");
    await page.getByTestId("transcript-input").fill("Decision-maker: Taylor CEO owns approval. Risk: none. Next step: schedule executive review by 2026-07-19.");
    await page.getByTestId("run-analysis").click();
    await expect(page.getByTestId("extracted-facts")).toContainText("Taylor CEO");
  });

  test("reset restores initial CRM/transcript", async ({ page }) => {
    await page.goto("/demo");
    await page.getByTestId("transcript-input").fill("changed");
    await page.getByTestId("reset-scenario").click();
    await expect(page.getByTestId("transcript-input")).toHaveValue(/Dana CFO/);
    await expect(page.getByTestId("crm-snapshot")).toContainText("Send recap from May discovery call");
  });

  test("controlled error state renders for missing session", async ({ page }) => {
    await page.goto("/demo");
    await page.evaluate(() => fetch("/api/demo/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: "missing", transcript: "x" }) }));
    await page.route("/api/demo/analyze", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "SESSION_NOT_FOUND", message: "Session missing" } }) }));
    await page.getByTestId("run-analysis").click();
    await expect(page.getByTestId("error-state")).toContainText("SESSION_NOT_FOUND");
    await expect(page.getByRole("button", { name: "Recreate session" })).toBeVisible();
  });
});
