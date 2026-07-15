// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { RecommendationCard } from "../../app/demo/components/recommendation-card";
import type { ApprovalRecommendation } from "../../lib/agents/approval";

const baseRecommendation: ApprovalRecommendation = {
  id: "rec-next-step",
  opportunityId: "opp-1",
  actionType: "update_crm_field",
  crmField: "NextStep",
  riskLevel: "medium",
  status: "pending",
  currentValue: "Old step",
  suggestedValue: "Send MAP",
  evidence: [{ sourceId: "email-1", factId: "fact-1", evidenceText: "Customer asked for a mutual action plan.", available: true }],
  createdAt: new Date("2026-07-15T00:00:00.000Z"),
  updatedAt: new Date("2026-07-15T00:00:00.000Z"),
  version: 0,
};

function renderCard(overrides: Partial<ApprovalRecommendation> = {}, onAction = vi.fn(async () => undefined)) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<RecommendationCard recommendation={{ ...baseRecommendation, ...overrides }} onAction={onAction} />));
  return { host, root, onAction };
}

async function click(host: HTMLElement, testId: string) {
  await act(async () => { host.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click(); });
}

describe("demo recommendation approval UI", () => {
  beforeEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

  it("approve calls the backend action handler with expectedVersion and waits for response-owned status", async () => {
    const onAction = vi.fn(async () => undefined);
    const { host } = renderCard({}, onAction);
    await click(host, "approve-rec-next-step");
    expect(onAction).toHaveBeenCalledWith("rec-next-step", { action: "approve", expectedVersion: 0 });
    expect(host.querySelector('[data-testid="status-rec-next-step"]')?.textContent).toBe("pending");
  });

  it("edit and approve requires a value before calling the backend", async () => {
    const { host, onAction } = renderCard();
    await click(host, "edit-approve-rec-next-step");
    expect(onAction).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Edited value is required");
  });

  it("reject requires a reason before calling the backend", async () => {
    const { host, onAction } = renderCard();
    await click(host, "reject-rec-next-step");
    expect(onAction).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Rejection reason is required");
  });

  it("snooze requires a future date before calling the backend", async () => {
    const { host, onAction } = renderCard();
    const input = host.querySelector<HTMLInputElement>('[data-testid="snooze-date-rec-next-step"]')!;
    await act(async () => { input.value = "2020-01-01T00:00"; input.dispatchEvent(new Event("input", { bubbles: true })); });
    await click(host, "snooze-rec-next-step");
    expect(onAction).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Choose a future snooze date");
  });

  it("renders version conflict refresh prompt from rejected backend response", async () => {
    const onAction = vi.fn(async () => { throw new Error("Recommendation version conflict. Refresh or re-run analysis before trying again."); });
    const { host } = renderCard({}, onAction);
    await click(host, "approve-rec-next-step");
    expect(host.textContent).toContain("Refresh or re-run analysis");
  });

  it("keeps recommendations independent across parent response updates", () => {
    const { host, root } = renderCard({ status: "approved", version: 1 });
    act(() => root.render(<><RecommendationCard recommendation={{ ...baseRecommendation, status: "approved", version: 1 }} onAction={vi.fn()} /><RecommendationCard recommendation={{ ...baseRecommendation, id: "rec-close-date", crmField: "CloseDate", status: "rejected", version: 1, rejectionReason: "Bad date" }} onAction={vi.fn()} /></>));
    expect(host.querySelector('[data-testid="status-rec-next-step"]')?.textContent).toBe("approved");
    expect(host.querySelector('[data-testid="status-rec-close-date"]')?.textContent).toBe("rejected");
  });
});
