import { describe, expect, it } from "vitest";

import { canApproveRecommendation, transitionRecommendation, type ApprovalActor, type ApprovalRecommendation } from "../../lib/agents/approval";

const now = new Date("2026-05-30T12:00:00.000Z");
const manager: ApprovalActor = { id: "mgr-1", name: "Mira Manager", role: "manager" };
const ae: ApprovalActor = { id: "ae-1", name: "Avery AE", role: "ae" };
const revops: ApprovalActor = { id: "ops-1", name: "Rae RevOps", role: "revops" };
const readonly: ApprovalActor = { id: "view-1", name: "Riley Readonly", role: "readonly" };
const auditor: ApprovalActor = { id: "audit-1", name: "Ari Auditor", role: "auditor" };

function recommendation(overrides: Partial<ApprovalRecommendation> = {}): ApprovalRecommendation {
  return {
    id: "rec-permission-1",
    opportunityId: "opp-1",
    actionType: "update_crm_field",
    crmField: "Risk__c",
    riskLevel: "medium",
    status: "pending",
    currentValue: null,
    suggestedValue: "Procurement risk",
    evidence: [{ sourceId: "src-1", factId: "fact-1", evidenceText: "Procurement still pending.", available: true }],
    createdAt: now,
    updatedAt: now,
    version: 0,
    ...overrides,
  };
}

describe("Stage 10 approval role integration rules", () => {
  it("requires manager role for approving high-risk cards", () => {
    const highRisk = recommendation({ crmField: "Amount", riskLevel: "high", suggestedValue: "125000" });

    expect(() => transitionRecommendation({ recommendation: highRisk, actor: revops, action: "approve", options: { now, revOpsApprovableFields: ["Amount"] } })).toThrowError(/manager/i);
    expect(transitionRecommendation({ recommendation: highRisk, actor: manager, action: "approve", options: { now } }).recommendation.status).toBe("approved");
  });

  it("prevents AEs from approving forecast changes", () => {
    const forecast = recommendation({ crmField: "ForecastCategoryName", riskLevel: "medium", suggestedValue: "PIPELINE" });

    expect(canApproveRecommendation(forecast, ae)).toBe(false);
    expect(() => transitionRecommendation({ recommendation: forecast, actor: ae, action: "approve", options: { now } })).toThrowError(/forecast/i);
  });

  it("allows RevOps to approve configured fields", () => {
    const opsField = recommendation({ crmField: "ForecastCategoryName", riskLevel: "medium", suggestedValue: "BEST_CASE" });
    const result = transitionRecommendation({ recommendation: opsField, actor: revops, action: "approve", options: { now, revOpsApprovableFields: ["ForecastCategoryName"] } });

    expect(result.recommendation.status).toBe("approved");
    expect(result.auditEvent.actorRole).toBe("revops");
  });

  it("prevents read-only users from approving", () => {
    expect(() => transitionRecommendation({ recommendation: recommendation(), actor: readonly, action: "approve", options: { now } })).toThrowError(/read-only/i);
  });

  it("allows auditors to view state through predicates but not act", () => {
    const card = recommendation();

    expect(card.status).toBe("pending");
    expect(canApproveRecommendation(card, auditor)).toBe(false);
    expect(() => transitionRecommendation({ recommendation: card, actor: auditor, action: "approve", options: { now } })).toThrowError(/auditor/i);
  });

  it("saves edited values and audits them", () => {
    const result = transitionRecommendation({ recommendation: recommendation(), actor: revops, action: "edit", editedValue: "Security risk accepted by champion", options: { now } });

    expect(result.recommendation.suggestedValue).toBe("Security risk accepted by champion");
    expect(result.auditEvent).toEqual(expect.objectContaining({ action: "edit", metadata: expect.objectContaining({ editedValue: "Security risk accepted by champion" }) }));
    expect(result.feedbackEvent).toEqual(expect.objectContaining({ signal: "edited" }));
  });

  it("fails when the approver lacks field permission", () => {
    expect(() => transitionRecommendation({ recommendation: recommendation({ crmField: "LegalStatus__c" }), actor: ae, action: "approve", options: { now } })).toThrowError(/cannot approve/i);
  });
});
