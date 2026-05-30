import { expect, test } from "@playwright/test";

test("homepage renders the CRM Hygiene Agent landing copy", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "CRM Hygiene Agent" })).toBeVisible();
  await expect(
    page.getByText(
      "Keep revenue data trustworthy by pairing transparent agent recommendations with human approval and auditable evidence.",
    ),
  ).toBeVisible();
});
