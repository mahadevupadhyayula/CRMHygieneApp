import { describe, expect, it } from "vitest";

import { executeWriteback, rollbackWriteback, WritebackError, type SimulatedCrmSnapshot } from "../../lib/agents/writeback";
import type { ApprovalActor, ApprovalRecommendation } from "../../lib/agents/approval";

const now = new Date("2026-05-30T12:00:00.000Z");
const manager: ApprovalActor = { id: "mgr-1", name: "Mira Manager", role: "manager" };
const ae: ApprovalActor = { id: "ae-1", name: "Avery AE", role: "ae" };

function snapshot(overrides: Partial<SimulatedCrmSnapshot> = {}): SimulatedCrmSnapshot {
  return {
    opportunities: {
      "opp-1": {
        id: "opp-1",
        version: 0,
        sourceCapturedAt: now,
        fields: {
          NextStep: { value: "Call buyer", dataType: "string", label: "Next Step" },
          ForecastCategoryName: { value: "PIPELINE", dataType: "picklist" },
          Amount: { value: 100000, dataType: "number" },
          IsChampionEngaged__c: { value: false, dataType: "boolean" },
        },
      },
    },
    tasks: [],
    riskTags: [],
    noteSummaries: [],
    ownerAssignments: {},
    writebackAttempts: [],
    auditEvents: [],
    ...overrides,
  };
}

function recommendation(overrides: Partial<ApprovalRecommendation> = {}): ApprovalRecommendation {
  return {
    id: "rec-1",
    opportunityId: "opp-1",
    actionType: "update_crm_field",
    crmField: "NextStep",
    riskLevel: "low",
    status: "approved",
    currentValue: "Call buyer",
    suggestedValue: "Send MAP",
    evidence: [{ sourceId: "src-1", factId: "fact-1", evidenceText: "Send MAP tomorrow.", available: true }],
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...overrides,
  };
}

describe("Stage 11 simulated CRM writeback unit coverage", () => {
  it("writes an approved recommendation successfully and preserves before/after values", () => {
    const result = executeWriteback({ snapshot: snapshot(), recommendation: recommendation(), actor: manager, options: { now } });

    expect(result.snapshot.opportunities["opp-1"].fields.NextStep.value).toBe("Send MAP");
    expect(result.attempt.status).toBe("success");
    expect(result.attempt.change).toEqual(expect.objectContaining({ fieldName: "NextStep", beforeValue: "Call buyer", afterValue: "Send MAP" }));
    expect(result.auditEvent).toEqual(expect.objectContaining({ action: "execute", toStatus: "executed" }));
  });

  it("prevents unapproved and rejected recommendations from writing", () => {
    const unapproved = executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ status: "pending" }), actor: manager, options: { now } });
    const rejected = executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ status: "rejected" }), actor: manager, options: { now } });

    expect(unapproved.attempt).toEqual(expect.objectContaining({ status: "failed", errorCode: "RECOMMENDATION_NOT_APPROVED" }));
    expect(rejected.attempt).toEqual(expect.objectContaining({ status: "failed", errorCode: "RECOMMENDATION_NOT_APPROVED" }));
    expect(unapproved.snapshot.opportunities["opp-1"].fields.NextStep.value).toBe("Call buyer");
  });

  it("blocks high-risk writebacks without a manager actor", () => {
    const result = executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ riskLevel: "high", crmField: "Amount", suggestedValue: "125000" }), actor: ae, options: { now } });

    expect(result.attempt).toEqual(expect.objectContaining({ status: "failed", errorCode: "HIGH_RISK_MANAGER_REQUIRED" }));
    expect(result.snapshot.opportunities["opp-1"].fields.Amount.value).toBe(100000);
  });

  it("logs failed writebacks as attempts and audit events", () => {
    const result = executeWriteback({ snapshot: snapshot(), recommendation: recommendation(), actor: manager, options: { now, failRecommendationIds: ["rec-1"] } });

    expect(result.attempt).toEqual(expect.objectContaining({ status: "failed", errorCode: "SIMULATED_WRITEBACK_FAILURE" }));
    expect(result.snapshot.writebackAttempts).toHaveLength(1);
    expect(result.snapshot.auditEvents[0]).toEqual(expect.objectContaining({ action: "fail", toStatus: "failed" }));
  });

  it("rolls back a field update to the previous value", () => {
    const written = executeWriteback({ snapshot: snapshot(), recommendation: recommendation(), actor: manager, options: { now } });
    const rolledBack = rollbackWriteback({ snapshot: written.snapshot, attemptId: written.attempt.id, actor: manager, now: new Date("2026-05-30T13:00:00.000Z") });

    expect(rolledBack.snapshot.opportunities["opp-1"].fields.NextStep.value).toBe("Call buyer");
    expect(rolledBack.attempt.status).toBe("rolled_back");
    expect(rolledBack.attempt.change).toEqual(expect.objectContaining({ beforeValue: "Send MAP", afterValue: "Call buyer" }));
  });

  it("prevents duplicate writes with idempotency", () => {
    const first = executeWriteback({ snapshot: snapshot(), recommendation: recommendation(), actor: manager, options: { now } });
    const second = executeWriteback({ snapshot: first.snapshot, recommendation: recommendation(), actor: manager, options: { now } });

    expect(second.attempt.status).toBe("duplicate");
    expect(second.snapshot.opportunities["opp-1"].fields.NextStep.value).toBe("Send MAP");
    expect(second.snapshot.opportunities["opp-1"].version).toBe(1);
  });

  it("handles missing CRM fields, invalid field mappings, and value type mismatches", () => {
    const missingField = executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ crmField: "Missing__c" }), actor: manager, options: { now } });
    const invalidMapping = executeWriteback({ snapshot: snapshot(), recommendation: recommendation(), actor: manager, options: { now, fieldMapping: { NextStep: "" } } });
    const mismatch = executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ crmField: "Amount", suggestedValue: "not money" }), actor: manager, options: { now } });

    expect(missingField.attempt.errorCode).toBe("CRM_FIELD_MISSING");
    expect(invalidMapping.attempt.errorCode).toBe("INVALID_FIELD_MAPPING");
    expect(mismatch.attempt.errorCode).toBe("VALUE_TYPE_MISMATCH");
  });

  it("blocks concurrent writebacks and stale-source writebacks", () => {
    const concurrent = executeWriteback({ snapshot: snapshot(), recommendation: recommendation(), actor: manager, options: { now, expectedOpportunityVersion: 2 } });
    const stale = executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ staleAt: now }), actor: manager, options: { now } });

    expect(concurrent.attempt.errorCode).toBe("VERSION_CONFLICT");
    expect(stale.attempt.errorCode).toBe("SOURCE_STALE");
  });

  it("allows retry after failure because failed attempts do not satisfy idempotency", () => {
    const failed = executeWriteback({ snapshot: snapshot(), recommendation: recommendation(), actor: manager, options: { now, failRecommendationIds: ["rec-1"] } });
    const retried = executeWriteback({ snapshot: failed.snapshot, recommendation: recommendation(), actor: manager, options: { now } });

    expect(failed.attempt.status).toBe("failed");
    expect(retried.attempt.status).toBe("success");
    expect(retried.snapshot.opportunities["opp-1"].fields.NextStep.value).toBe("Send MAP");
  });

  it("rolls back high-risk updates", () => {
    const rec = recommendation({ riskLevel: "high", crmField: "Amount", suggestedValue: "125000" });
    const written = executeWriteback({ snapshot: snapshot(), recommendation: rec, actor: manager, options: { now } });
    const rolledBack = rollbackWriteback({ snapshot: written.snapshot, attemptId: written.attempt.id, actor: manager, now });

    expect(written.snapshot.opportunities["opp-1"].fields.Amount.value).toBe(125000);
    expect(rolledBack.snapshot.opportunities["opp-1"].fields.Amount.value).toBe(100000);
  });

  it("supports risk tags, note summaries, and internal owner assignments", () => {
    const risk = executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ id: "risk-rec", actionType: "add_risk_tag", crmField: undefined, suggestedValue: "Procurement risk" }), actor: manager, options: { now } });
    const note = executeWriteback({ snapshot: risk.snapshot, recommendation: recommendation({ id: "note-rec", actionType: "add_note_summary", crmField: undefined, suggestedValue: "Buyer asked for a MAP by Friday." }), actor: manager, options: { now } });
    const owner = executeWriteback({ snapshot: note.snapshot, recommendation: recommendation({ id: "owner-rec", actionType: "assign_internal_owner", crmField: undefined, suggestedValue: "legal-1" }), actor: manager, options: { now } });

    expect(owner.snapshot.riskTags).toEqual([expect.objectContaining({ tag: "Procurement risk" })]);
    expect(owner.snapshot.noteSummaries).toEqual([expect.objectContaining({ body: "Buyer asked for a MAP by Friday." })]);
    expect(owner.snapshot.ownerAssignments["opp-1"]).toEqual(expect.objectContaining({ ownerId: "legal-1", recommendationId: "owner-rec" }));
  });

  it("rolls back created tasks and prevents duplicate task creation", () => {
    const rec = recommendation({ actionType: "create_task", crmField: undefined, suggestedValue: "Follow up with CFO" });
    const written = executeWriteback({ snapshot: snapshot(), recommendation: rec, actor: manager, options: { now } });
    const duplicate = executeWriteback({ snapshot: written.snapshot, recommendation: rec, actor: manager, options: { now } });
    const rolledBack = rollbackWriteback({ snapshot: duplicate.snapshot, attemptId: written.attempt.id, actor: manager, now });

    expect(written.snapshot.tasks).toHaveLength(1);
    expect(duplicate.snapshot.tasks).toHaveLength(1);
    expect(duplicate.attempt.status).toBe("duplicate");
    expect(rolledBack.snapshot.tasks).toHaveLength(0);
  });

  it("throws typed errors for invalid rollback attempts", () => {
    expect(() => rollbackWriteback({ snapshot: snapshot(), attemptId: "missing", actor: manager, now })).toThrowError(WritebackError);
  });
});
