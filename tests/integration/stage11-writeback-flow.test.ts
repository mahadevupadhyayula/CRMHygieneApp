import { describe, expect, it } from "vitest";

import { transitionRecommendation, type ApprovalActor, type ApprovalRecommendation } from "../../lib/agents/approval";
import { executeWriteback, type SimulatedCrmSnapshot } from "../../lib/agents/writeback";

const now = new Date("2026-05-30T12:00:00.000Z");
const manager: ApprovalActor = { id: "mgr-1", name: "Mira Manager", role: "manager" };
const ae: ApprovalActor = { id: "ae-1", name: "Avery AE", role: "ae" };

function snapshot(): SimulatedCrmSnapshot {
  return {
    opportunities: {
      "opp-1": {
        id: "opp-1",
        version: 0,
        fields: {
          NextStep: { value: "Call buyer", dataType: "string" },
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
  };
}

function recommendation(overrides: Partial<ApprovalRecommendation> = {}): ApprovalRecommendation {
  return {
    id: "rec-flow-1",
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

function approve(rec: ApprovalRecommendation, actor: ApprovalActor = manager): ApprovalRecommendation {
  return transitionRecommendation({ recommendation: rec, actor, action: "approve", options: { now } }).recommendation;
}

describe("Stage 11 approval-to-writeback integration", () => {
  it("approves a next-step recommendation and updates the simulated CRM field", () => {
    const approved = approve(recommendation());
    const written = executeWriteback({ snapshot: snapshot(), recommendation: approved, actor: manager, options: { now } });

    expect(written.attempt.status).toBe("success");
    expect(written.snapshot.opportunities["opp-1"].fields.NextStep.value).toBe("Send MAP");
  });

  it("approves a task recommendation and creates one task", () => {
    const approved = approve(recommendation({ id: "task-rec", actionType: "create_task", crmField: undefined, suggestedValue: "Schedule executive alignment" }));
    const written = executeWriteback({ snapshot: snapshot(), recommendation: approved, actor: manager, options: { now } });

    expect(written.attempt.status).toBe("success");
    expect(written.snapshot.tasks).toEqual([expect.objectContaining({ subject: "Schedule executive alignment", recommendationId: "task-rec" })]);
  });

  it("approves a forecast recommendation as manager and changes forecast", () => {
    const forecast = recommendation({ id: "forecast-rec", crmField: "ForecastCategoryName", riskLevel: "high", currentValue: "PIPELINE", suggestedValue: "COMMIT" });
    const approved = approve(forecast, manager);
    const written = executeWriteback({ snapshot: snapshot(), recommendation: approved, actor: manager, options: { now } });

    expect(written.attempt.status).toBe("success");
    expect(written.snapshot.opportunities["opp-1"].fields.ForecastCategoryName.value).toBe("COMMIT");
  });

  it("fails when an AE attempts to approve a forecast change", () => {
    const forecast = recommendation({ id: "ae-forecast-rec", crmField: "ForecastCategoryName", riskLevel: "medium", currentValue: "PIPELINE", suggestedValue: "COMMIT" });

    expect(() => transitionRecommendation({ recommendation: forecast, actor: ae, action: "approve", options: { now } })).toThrowError(/forecast/i);
  });

  it("surfaces writeback failures in the audit log", () => {
    const approved = approve(recommendation({ id: "failure-rec" }));
    const written = executeWriteback({ snapshot: snapshot(), recommendation: approved, actor: manager, options: { now, failRecommendationIds: ["failure-rec"] } });

    expect(written.attempt.status).toBe("failed");
    expect(written.snapshot.auditEvents).toContainEqual(expect.objectContaining({ action: "fail", metadata: expect.objectContaining({ errorCode: "SIMULATED_WRITEBACK_FAILURE" }) }));
  });
});
