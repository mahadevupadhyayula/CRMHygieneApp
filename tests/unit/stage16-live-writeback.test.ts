import { describe, expect, it } from "vitest";

import type { ApprovalActor, ApprovalRecommendation } from "../../lib/agents/approval";
import { executeWriteback, exportWritebackAuditEvents, rollbackWriteback, type SimulatedCrmSnapshot } from "../../lib/agents/writeback";

const now = new Date("2026-05-31T12:00:00.000Z");
const manager: ApprovalActor = { id: "mgr-1", name: "Mira Manager", role: "manager" };
const ae: ApprovalActor = { id: "ae-1", name: "Avery AE", role: "ae" };

function snapshot(overrides: Partial<SimulatedCrmSnapshot> = {}): SimulatedCrmSnapshot {
  return {
    opportunities: {
      "opp-1": {
        id: "opp-1",
        version: 3,
        fields: {
          NextStep: { value: "Call buyer", dataType: "string" },
          Risk__c: { value: "None", dataType: "picklist" },
          DecisionMaker__c: { value: "Unknown", dataType: "string" },
          CloseDate: { value: "2026-06-30", dataType: "date" },
          StageName: { value: "Proposal", dataType: "picklist" },
          ForecastCategoryName: { value: "PIPELINE", dataType: "picklist" },
          Amount: { value: 100000, dataType: "number" },
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
    id: "rec-16",
    opportunityId: "opp-1",
    actionType: "update_crm_field",
    crmField: "NextStep",
    riskLevel: "low",
    status: "approved",
    currentValue: "Call buyer",
    suggestedValue: "Send MAP",
    evidence: [{ sourceId: "src-1", factId: "fact-1", evidenceText: "Buyer asked for MAP.", available: true }],
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...overrides,
  };
}

describe("Stage 16 approval-gated live writeback", () => {
  it("maps fields, serializes values, and writes allowed live CRM fields", () => {
    const closeDate = recommendation({ id: "close-date", crmField: "CloseDate", riskLevel: "medium", currentValue: "2026-06-30", suggestedValue: "2026-07-15" });
    const result = executeWriteback({ snapshot: snapshot(), recommendation: closeDate, actor: manager, options: { now, fieldMapping: { Close_Date__c: "CloseDate" } } });

    expect(result.attempt.status).toBe("success");
    expect(result.attempt.approvalRequirement).toBe("approval_required");
    expect(result.snapshot.opportunities["opp-1"].fields.CloseDate.value).toBe("2026-07-15");
    expect(result.auditEvent.metadata).toEqual(expect.objectContaining({ beforeValue: "2026-06-30", afterValue: "2026-07-15" }));
  });

  it("supports approved tasks, notes, risk tags, risk field, next step, decision-maker, stage, and forecast writes", () => {
    let current = snapshot();
    for (const rec of [
      recommendation({ id: "task", actionType: "create_task", crmField: undefined, suggestedValue: "Schedule CFO call" }),
      recommendation({ id: "note", actionType: "add_note_summary", crmField: undefined, suggestedValue: "Buyer requested security review notes." }),
      recommendation({ id: "risk-tag", actionType: "add_risk_tag", crmField: undefined, suggestedValue: "Security risk" }),
      recommendation({ id: "risk-field", crmField: "Risk__c", currentValue: "None", suggestedValue: "Security" }),
      recommendation({ id: "next-step", crmField: "NextStep", currentValue: "Call buyer", suggestedValue: "Send mutual action plan" }),
      recommendation({ id: "decision-maker", crmField: "DecisionMaker__c", currentValue: "Unknown", suggestedValue: "Dana CFO" }),
      recommendation({ id: "stage", crmField: "StageName", riskLevel: "high", currentValue: "Proposal", suggestedValue: "Negotiation" }),
      recommendation({ id: "forecast", crmField: "ForecastCategoryName", riskLevel: "high", currentValue: "PIPELINE", suggestedValue: "COMMIT" }),
    ]) {
      const written = executeWriteback({ snapshot: current, recommendation: rec, actor: manager, options: { now } });
      expect(written.attempt.status).toBe("success");
      current = written.snapshot;
    }

    expect(current.tasks).toEqual([expect.objectContaining({ subject: "Schedule CFO call" })]);
    expect(current.noteSummaries).toEqual([expect.objectContaining({ body: "Buyer requested security review notes." })]);
    expect(current.riskTags).toEqual([expect.objectContaining({ tag: "Security risk" })]);
    expect(current.opportunities["opp-1"].fields.Risk__c.value).toBe("Security");
    expect(current.opportunities["opp-1"].fields.DecisionMaker__c.value).toBe("Dana CFO");
    expect(current.opportunities["opp-1"].fields.StageName.value).toBe("Negotiation");
    expect(current.opportunities["opp-1"].fields.ForecastCategoryName.value).toBe("COMMIT");
  });

  it("enforces read-only mode, approval, role permissions, disabled amount changes, and out-of-scope closed stages", () => {
    expect(executeWriteback({ snapshot: snapshot(), recommendation: recommendation(), actor: manager, options: { now, readOnlyMode: true } }).attempt.errorCode).toBe("READ_ONLY_WRITE_FORBIDDEN");
    expect(executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ status: "pending" }), actor: manager, options: { now } }).attempt.errorCode).toBe("RECOMMENDATION_NOT_APPROVED");
    expect(executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ crmField: "ForecastCategoryName", riskLevel: "high", currentValue: "PIPELINE", suggestedValue: "COMMIT" }), actor: ae, options: { now } }).attempt.errorCode).toBe("HIGH_RISK_MANAGER_REQUIRED");
    expect(executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ crmField: "Amount", riskLevel: "high", currentValue: "100000", suggestedValue: "125000" }), actor: manager, options: { now } }).attempt.errorCode).toBe("AMOUNT_WRITEBACK_DISABLED");
    expect(executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ crmField: "StageName", riskLevel: "high", currentValue: "Proposal", suggestedValue: "Closed Won" }), actor: manager, options: { now } }).attempt.errorCode).toBe("CLOSED_WON_LOST_OUT_OF_SCOPE");
  });

  it("handles mocked CRM validation errors, field-level denials, timeouts, retries, and audit export requirements", () => {
    expect(executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ id: "validation" }), actor: manager, options: { now, validationFailureRecommendationIds: ["validation"] } }).attempt.errorCode).toBe("CRM_VALIDATION_ERROR");
    expect(executeWriteback({ snapshot: snapshot(), recommendation: recommendation(), actor: manager, options: { now, deniedFields: ["NextStep"] } }).attempt.errorCode).toBe("FIELD_PERMISSION_DENIED");
    expect(executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ id: "timeout" }), actor: manager, options: { now, timeoutRecommendationIds: ["timeout"], maxRetries: 2 } }).attempt).toEqual(expect.objectContaining({ status: "failed", errorCode: "API_TIMEOUT", retryCount: 2 }));
    expect(executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ id: "retry" }), actor: manager, options: { now, retryableFailureRecommendationIds: ["retry"], maxRetries: 1 } }).attempt).toEqual(expect.objectContaining({ status: "success", retryCount: 1 }));
    expect(executeWriteback({ snapshot: snapshot(), recommendation: recommendation(), actor: manager, options: { now, requireAuditExport: true, auditExporterAvailable: false } }).attempt.errorCode).toBe("AUDIT_EXPORT_REQUIRED");
  });

  it("detects duplicate tasks, concurrent versions, value conflicts after approval, and supports rollback/audit export", () => {
    const task = recommendation({ id: "dup-task", actionType: "create_task", crmField: undefined, suggestedValue: "Call CFO" });
    const first = executeWriteback({ snapshot: snapshot(), recommendation: task, actor: manager, options: { now } });
    const duplicate = executeWriteback({ snapshot: first.snapshot, recommendation: task, actor: manager, options: { now } });
    const conflict = executeWriteback({ snapshot: snapshot(), recommendation: recommendation({ currentValue: "Old value" }), actor: manager, options: { now } });
    const concurrent = executeWriteback({ snapshot: snapshot(), recommendation: recommendation(), actor: manager, options: { now, expectedOpportunityVersion: 99 } });
    const rolledBack = rollbackWriteback({ snapshot: duplicate.snapshot, attemptId: first.attempt.id, actor: manager, now });

    expect(duplicate.attempt.status).toBe("duplicate");
    expect(conflict.attempt.errorCode).toBe("WRITEBACK_CONFLICT");
    expect(concurrent.attempt.errorCode).toBe("VERSION_CONFLICT");
    expect(rolledBack.snapshot.tasks).toHaveLength(0);
    expect(() => rollbackWriteback({ snapshot: rolledBack.snapshot, attemptId: duplicate.attempt.id, actor: manager, now })).toThrow(/cannot be rolled back/i);
    expect(exportWritebackAuditEvents(rolledBack.snapshot).length).toBeGreaterThan(0);
  });
});
