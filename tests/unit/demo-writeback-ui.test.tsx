import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CrmDiff } from "../../app/demo/components/crm-diff";
import { WritebackPanel } from "../../app/demo/components/writeback-panel";
import type { ApprovalRecommendation } from "../../lib/agents/approval";
import type { DemoSession } from "../../lib/demo/types";

const now = new Date("2026-07-15T00:00:00.000Z");
function snapshot(next = "Old next step") {
  return { opportunities: { opp: { id: "opp", version: 0, sourceCapturedAt: now, updatedAt: now, fields: { NextStep: { value: next, dataType: "string" as const, label: "Next Step" }, CloseDate: { value: "2026-07-31", dataType: "date" as const } } } }, tasks: [], riskTags: [], noteSummaries: [], ownerAssignments: {}, writebackAttempts: [], auditEvents: [] };
}
function rec(overrides: Partial<ApprovalRecommendation> = {}): ApprovalRecommendation {
  return { id: "rec-next", opportunityId: "opp", actionType: "update_crm_field", crmField: "NextStep", currentValue: "Old next step", suggestedValue: "Send MAP", evidence: [{ sourceId: "src", available: true }], riskLevel: "low", status: "pending", createdAt: now, updatedAt: now, version: 0, ...overrides };
}
function session(recommendations: ApprovalRecommendation[]): DemoSession {
  return { sessionId: "s1", scenarioId: "nimbus-happy-path", transcript: "", recommendations, crmSnapshot: snapshot(), writebackSnapshot: snapshot(), auditEvents: [], writebackAttempts: [], version: 1, createdAt: now, updatedAt: now } as DemoSession;
}

describe("Phase 6 writeback UI", () => {
  it("hides the Apply Approved CRM Changes button until a recommendation is approved or edited", () => {
    const html = renderToStaticMarkup(<WritebackPanel session={session([rec()])} onSessionUpdate={() => undefined} />);
    expect(html).not.toContain("Apply Approved CRM Changes");
  });

  it("shows the apply button and writeback execution timeline for approved recommendations", () => {
    const html = renderToStaticMarkup(<WritebackPanel session={{ ...session([rec({ status: "approved" })]), writebackAttempts: [{ id: "a1", idempotencyKey: "k", recommendationId: "rec-next", opportunityId: "opp", actorId: "mgr-1", actorRole: "manager", actionType: "update_crm_field", status: "failed", message: "failed", createdAt: now, retryCount: 2, errorCode: "API_TIMEOUT", errorMessage: "timeout", approvalRequirement: "approval_light" }], auditEvents: [{ id: "audit-a1", recommendationId: "rec-next", opportunityId: "opp", actorId: "mgr-1", actorName: "Morgan Manager", actorRole: "manager", action: "fail", fromStatus: "approved", toStatus: "failed", message: "timeout", metadata: { errorCode: "API_TIMEOUT" }, createdAt: now }] }} onSessionUpdate={() => undefined} />);
    expect(html).toContain("Apply Approved CRM Changes");
    expect(html).toContain("Execution timeline");
    expect(html).toContain("API_TIMEOUT");
    expect(html).toContain("Failure audit event");
  });

  it("renders before-and-after CRM diff and unchanged confirmation", () => {
    const html = renderToStaticMarkup(<CrmDiff before={snapshot()} after={snapshot()} />);
    expect(html).toContain("CRM before / after state");
    expect(html).toContain("CRM state changed: no — CRM state remained unchanged");
    expect(html).toContain("Next Step");
  });
});
