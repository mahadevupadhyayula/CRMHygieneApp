import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
});

test("user opens dashboard, filters high-risk deals, and reviews evidence", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Deal Hygiene Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nimbus Health Expansion" })).toBeVisible();

  await page.getByLabel("Filter by risk").selectOption("high");
  await expect(page.getByRole("link", { name: "Nimbus Health Expansion" })).toBeVisible();
  await expect(page.getByText("Orbit Logistics Renewal")).not.toBeVisible();

  await page.getByRole("link", { name: "Nimbus Health Expansion" }).click();
  await expect(page.getByRole("heading", { name: "CRM snapshot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence panel" })).toBeVisible();
  await expect(page.getByText("Source email-771")).toBeVisible();
  await expect(page.getByText("Permission-restricted source")).toBeVisible();
});

test("user approves, edits, rejects, and snoozes approval cards; audit log updates", async ({ page }) => {
  await page.goto("/approvals");

  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();
  await page.getByLabel("Filter approval cards by risk").selectOption("high");
  await expect(page.getByText("CloseDate")).toBeVisible();

  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(page.getByText("2026-07-15")).not.toBeVisible();

  await page.getByLabel("Filter approval cards by risk").selectOption("medium");
  await page.getByLabel("Edit value for Nimbus Health Expansion").fill("Send MAP and procurement checklist");
  await page.getByRole("button", { name: "Edit" }).first().click();

  await page.getByLabel("Reject reason for Orbit Logistics Renewal").fill("Security owner already updated CRM");
  await page.getByRole("button", { name: "Reject" }).first().click();

  await page.getByLabel("Filter approval cards by risk").selectOption("high");
  await page.getByRole("button", { name: "Snooze" }).first().click();

  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();
  await expect(page.getByText("approved CloseDate recommendation")).toBeVisible();
  await expect(page.getByText("edited NextStep recommendation")).toBeVisible();
  await expect(page.getByText("rejected Task recommendation")).toBeVisible();
  await expect(page.getByText("snoozed ForecastCategoryName recommendation")).toBeVisible();
});

test("mobile approval inbox keeps card actions accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/approvals");

  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" }).first()).toBeVisible();
});
