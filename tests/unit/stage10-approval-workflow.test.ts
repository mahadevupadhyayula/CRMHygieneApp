import { describe, expect, it } from "vitest";

import { ApprovalWorkflowError, transitionRecommendation, visibleRecommendations, type ApprovalActor, type ApprovalRecommendation, type ApprovalWorkflowAction } from "../../lib/agents/approval";

const now = new Date("2026-05-30T12:00:00.000Z");
const manager: ApprovalActor = { id: "mgr-1", name: "Mira Manager", role: "manager" };

function recommendation(overrides: Partial<ApprovalRecommendation> = {}): ApprovalRecommendation {
  return {
    id: "rec-1",
    opportunityId: "opp-1",
    actionType: "update_crm_field",
    crmField: "NextStep",
    riskLevel: "low",
    status: "pending",
    currentValue: "Call buyer",
    suggestedValue: "Send MAP",
    evidence: [{ sourceId: "src-1", factId: "fact-1", evidenceText: "Send MAP tomorrow.", available: true }],
    createdAt: now,
    updatedAt: now,
    version: 0,
    ...overrides,
  };
}

function transition(action: ApprovalWorkflowAction, overrides: Partial<ApprovalRecommendation> = {}, actionOverrides: Partial<Parameters<typeof transitionRecommendation>[0]> = {}) {
  return transitionRecommendation({ recommendation: recommendation(overrides), actor: manager, action, options: { now }, ...actionOverrides });
}

describe("Stage 10 approval workflow state transitions", () => {
  it("transitions pending to approved and records audit plus feedback", () => {
    const result = transition("approve");

    expect(result.recommendation.status).toBe("approved");
    expect(result.auditEvent).toEqual(expect.objectContaining({ action: "approve", fromStatus: "pending", toStatus: "approved" }));
    expect(result.feedbackEvent).toEqual(expect.objectContaining({ signal: "approved" }));
  });

  it("transitions pending to edited, saves the edited value, and audits the edited value", () => {
    const result = transition("edit", {}, { editedValue: "Send executive MAP by Friday" });

    expect(result.recommendation).toEqual(expect.objectContaining({ status: "edited", suggestedValue: "Send executive MAP by Friday", editedValue: "Send executive MAP by Friday" }));
    expect(result.auditEvent.metadata).toEqual(expect.objectContaining({ editedValue: "Send executive MAP by Friday" }));
    expect(result.feedbackEvent).toEqual(expect.objectContaining({ signal: "edited" }));
  });

  it("transitions pending to rejected when a reason is provided", () => {
    const result = transition("reject", {}, { rejectionReason: "Evidence conflicts with latest seller update." });

    expect(result.recommendation.status).toBe("rejected");
    expect(result.recommendation.rejectionReason).toBe("Evidence conflicts with latest seller update.");
    expect(result.feedbackEvent).toEqual(expect.objectContaining({ signal: "rejected" }));
  });

  it("transitions pending to snoozed when the due date is valid", () => {
    const result = transition("snooze", {}, { snoozedUntil: "2026-06-02T12:00:00.000Z" });

    expect(result.recommendation.status).toBe("snoozed");
    expect(result.recommendation.snoozedUntil?.toISOString()).toBe("2026-06-02T12:00:00.000Z");
    expect(result.feedbackEvent).toEqual(expect.objectContaining({ signal: "snoozed" }));
  });

  it("transitions approved to executed", () => {
    const result = transition("execute", { status: "approved", version: 3 });

    expect(result.recommendation.status).toBe("executed");
    expect(result.feedbackEvent).toBeUndefined();
  });

  it("transitions approved to failed", () => {
    const result = transition("fail", { status: "approved", version: 3 }, { failureReason: "CRM writeback failed" });

    expect(result.recommendation.status).toBe("failed");
    expect(result.auditEvent.metadata).toEqual(expect.objectContaining({ failureReason: "CRM writeback failed" }));
  });

  it("prevents rejected recommendations from executing", () => {
    expect(() => transition("execute", { status: "rejected", rejectionReason: "Wrong field" })).toThrowError(/cannot transition/i);
  });

  it("shows snoozed cards again after their due time", () => {
    const snoozed = recommendation({ status: "snoozed", snoozedUntil: new Date("2026-06-01T12:00:00.000Z") });

    expect(visibleRecommendations([snoozed], "2026-06-01T11:59:00.000Z")).toEqual([]);
    expect(visibleRecommendations([snoozed], "2026-06-01T12:00:00.000Z")).toEqual([snoozed]);
  });

  it.each(["approve", "edit", "reject", "snooze", "execute", "fail", "cancel"] as ApprovalWorkflowAction[])("creates an audit event for %s transitions", (action) => {
    const actionInput = action === "edit" ? { editedValue: "Updated value" } : action === "reject" ? { rejectionReason: "Not right" } : action === "snooze" ? { snoozedUntil: "2026-06-03T12:00:00.000Z" } : {};
    const startStatus = action === "execute" || action === "fail" ? "approved" : "pending";

    const result = transition(action, { status: startStatus }, actionInput);

    expect(result.auditEvent).toEqual(expect.objectContaining({ recommendationId: "rec-1", action, fromStatus: startStatus, toStatus: result.recommendation.status }));
  });

  it.each(["approve", "edit", "reject"] as ApprovalWorkflowAction[])("creates feedback for %s", (action) => {
    const actionInput = action === "edit" ? { editedValue: "Updated value" } : action === "reject" ? { rejectionReason: "Not right" } : {};

    const result = transition(action, {}, actionInput);

    expect(result.feedbackEvent).toBeDefined();
  });

  it("detects double approval clicks as duplicate transitions", () => {
    const first = transition("approve");

    expect(() => transitionRecommendation({ recommendation: first.recommendation, actor: manager, action: "approve", options: { now } })).toThrowError(/already approved/i);
  });

  it("rejects concurrent edit and approve attempts with stale expected version", () => {
    const edited = transition("edit", {}, { editedValue: "New next step", options: { now, expectedVersion: 0 } });

    expect(() => transitionRecommendation({ recommendation: edited.recommendation, actor: manager, action: "approve", options: { now, expectedVersion: 0 } })).toThrowError(ApprovalWorkflowError);
  });

  it("blocks deleted, evidence-missing, stale, no-reason rejection, and invalid snooze edge cases", () => {
    expect(() => transition("approve", { deletedAt: now })).toThrowError(/deleted/i);
    expect(() => transition("approve", { evidence: [{ sourceId: "src-1", available: false }] })).toThrowError(/evidence/i);
    expect(() => transition("approve", { staleAt: now })).toThrowError(/stale/i);
    expect(() => transition("reject")).toThrowError(/reason/i);
    expect(() => transition("snooze", {}, { snoozedUntil: "2026-05-29T12:00:00.000Z" })).toThrowError(/future/i);
  });
});
