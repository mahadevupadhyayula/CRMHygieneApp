import { describe, expect, it } from "vitest";

import { transitionRecommendation, type ApprovalActor, type ApprovalRecommendation } from "../../lib/agents/approval";
import { executeWriteback, type SimulatedCrmSnapshot } from "../../lib/agents/writeback";

const now = new Date("2026-05-31T14:00:00.000Z");
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
          StageName: { value: "Proposal", dataType: "picklist" },
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
    id: "flow-16",
    opportunityId: "opp-1",
    actionType: "update_crm_field",
    crmField: "NextStep",
    riskLevel: "low",
    status: "pending",
    currentValue: "Call buyer",
    suggestedValue: "Send MAP",
    evidence: [{ sourceId: "src-1", factId: "fact-1", evidenceText: "Buyer asked for MAP.", available: true }],
    createdAt: now,
    updatedAt: now,
    version: 0,
    ...overrides,
  };
}

function approve(rec: ApprovalRecommendation, actor: ApprovalActor): ApprovalRecommendation {
  return transitionRecommendation({ recommendation: rec, actor, action: "approve", options: { now } }).recommendation;
}

describe("Stage 16 live writeback integration", () => {
  it("approved task creates a CRM task", () => {
    const approved = approve(recommendation({ id: "task-flow", actionType: "create_task", crmField: undefined, suggestedValue: "Schedule executive alignment" }), ae);
    const written = executeWriteback({ snapshot: snapshot(), recommendation: approved, actor: ae, options: { now } });

    expect(written.attempt.status).toBe("success");
    expect(written.snapshot.tasks).toEqual([expect.objectContaining({ subject: "Schedule executive alignment" })]);
  });

  it("approved next-step update changes the CRM field", () => {
    const approved = approve(recommendation(), ae);
    const written = executeWriteback({ snapshot: snapshot(), recommendation: approved, actor: ae, options: { now } });

    expect(written.snapshot.opportunities["opp-1"].fields.NextStep.value).toBe("Send MAP");
  });

  it("forecast changes require manager approval and AE cannot approve stage or forecast updates", () => {
    const forecast = recommendation({ id: "forecast-flow", crmField: "ForecastCategoryName", riskLevel: "high", currentValue: "PIPELINE", suggestedValue: "COMMIT" });
    const stage = recommendation({ id: "stage-flow", crmField: "StageName", riskLevel: "high", currentValue: "Proposal", suggestedValue: "Negotiation" });

    expect(() => approve(forecast, ae)).toThrow(/manager/i);
    expect(() => approve(stage, ae)).toThrow(/manager/i);

    const approved = approve(forecast, manager);
    const written = executeWriteback({ snapshot: snapshot(), recommendation: approved, actor: manager, options: { now } });
    expect(written.snapshot.opportunities["opp-1"].fields.ForecastCategoryName.value).toBe("COMMIT");
  });

  it("read-only mode blocks all writebacks", () => {
    const approved = approve(recommendation(), ae);
    const written = executeWriteback({ snapshot: snapshot(), recommendation: approved, actor: ae, options: { now, readOnlyMode: true } });

    expect(written.attempt.status).toBe("failed");
    expect(written.attempt.errorCode).toBe("READ_ONLY_WRITE_FORBIDDEN");
  });

  it("failed writeback logs an audit event", () => {
    const approved = approve(recommendation({ id: "failure-flow" }), ae);
    const written = executeWriteback({ snapshot: snapshot(), recommendation: approved, actor: ae, options: { now, validationFailureRecommendationIds: ["failure-flow"] } });

    expect(written.attempt.status).toBe("failed");
    expect(written.snapshot.auditEvents).toContainEqual(expect.objectContaining({ action: "fail", metadata: expect.objectContaining({ errorCode: "CRM_VALIDATION_ERROR" }) }));
  });
});
