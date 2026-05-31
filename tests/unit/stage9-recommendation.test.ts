import { describe, expect, it } from "vitest";

import { generateRecommendations, recommendationCardSchema, type RecommendationCard, type RecommendationContext } from "../../lib/agents/recommendation";
import type { FieldComparison } from "../../lib/agents/comparison";
import type { ValidationFact, ValidationResult } from "../../lib/agents/validation";

const sourceTimestamp = new Date("2026-05-29T16:00:00.000Z");

describe("Stage 9 recommendation and approval card engine", () => {
  it("generates a recommendation from a valid comparison", () => {
    const cards = run({ comparisons: [comparison({ crmField: "DecisionMaker__c", currentValue: "", extractedValue: "Priya Shah", issueType: "empty_field", severity: "medium" })] });

    expect(cards).toEqual([expect.objectContaining({ actionType: "update_crm_field", crmField: "DecisionMaker__c", suggestedValue: "Priya Shah", riskLevel: "medium", approvalPolicy: "standard_approval" })]);
    expect(() => recommendationCardSchema.parse(cards[0])).not.toThrow();
  });

  it("does not generate a recommendation without evidence", () => {
    const invalid = comparison({ evidence: { ...evidence(), evidenceText: "" } }) as FieldComparison;

    expect(() => run({ comparisons: [invalid] })).toThrow();
  });

  it("requires strict approval for high-risk fields", () => {
    const cards = run({ comparisons: [comparison({ crmField: "StageName", currentValue: "DEMO", extractedValue: "NEGOTIATION", issueType: "stage_mismatch", severity: "high" })], options: { approvers: { manager: "mgr-1", revOps: "ops-1" } } });
    const update = find(cards, "update_crm_field");

    expect(update).toMatchObject({ riskLevel: "high", requiredApprover: "manager", approvalPolicy: "strict_approval", missingRequiredApprover: false });
    expect(update.approvalLevels.map((level) => level.approverRole)).toEqual(["manager", "revOps"]);
  });

  it("requires manager approval for forecast changes", () => {
    const cards = run({ comparisons: [comparison({ crmField: "ForecastCategoryName", currentValue: "COMMIT", extractedValue: "PIPELINE", issueType: "forecast_mismatch", severity: "high" })] });

    expect(find(cards, "update_crm_field")).toEqual(expect.objectContaining({ requiredApprover: "manager", approvalPolicy: "strict_approval", missingRequiredApprover: true }));
    expect(cards).toEqual(expect.arrayContaining([expect.objectContaining({ actionType: "request_manager_review", requiredApprover: "manager" })]));
  });

  it("keeps amount updates on strict approval or blocked policy only", () => {
    const strict = run({ comparisons: [comparison({ crmField: "Amount", currentValue: "100000", extractedValue: "125000", issueType: "contradiction", severity: "high" })] });
    const blocked = run({ comparisons: [comparison({ crmField: "Amount", currentValue: "100000", extractedValue: "125000", issueType: "contradiction", severity: "high" })], options: { amountUpdatePolicy: "blocked" } });

    expect(find(strict, "update_crm_field").approvalPolicy).toBe("strict_approval");
    expect(find(blocked, "update_crm_field")).toEqual(expect.objectContaining({ approvalPolicy: "blocked", status: "blocked" }));
  });

  it("classifies task creation as low-risk", () => {
    const cards = run({ comparisons: [comparison({ crmField: "NextStepDueDate__c", currentValue: "", extractedValue: "Call procurement on 2026-06-02", issueType: "missing_task", severity: "medium" })] });

    expect(cards).toEqual([expect.objectContaining({ actionType: "create_task", riskLevel: "low", approvalPolicy: "none", approvalLevels: [] })]);
  });

  it("keeps internal messages draft-only", () => {
    const cards = run({ comparisons: [comparison({ crmField: "CloseDate", currentValue: "2026-06-05", extractedValue: "next month", issueType: "timeline_mismatch", severity: "high" })], options: { includeDraftInternalMessages: true } });

    expect(find(cards, "draft_internal_message")).toEqual(expect.objectContaining({ status: "draft", approvalPolicy: "draft_only", riskLevel: "low" }));
  });

  it("does not generate recommendations for rejected or low-confidence facts", () => {
    const lowConfidence = comparison({ evidence: { ...evidence(), confidence: 0.42 }, recommendationEligible: false });
    const rejected = comparison({ evidence: { ...evidence(), factId: "rejected" } });

    expect(run({ comparisons: [lowConfidence] })).toEqual([]);
    expect(run({ comparisons: [rejected], validationResults: [result("rejected", { status: "rejected" })] })).toEqual([]);
  });

  it("suppresses duplicate recommendations", () => {
    const first = comparison({ crmField: "Risk__c", currentValue: "", extractedValue: "legal delay", issueType: "hidden_risk", severity: "medium", evidence: { ...evidence(), factId: "risk-1" } });
    const second = comparison({ crmField: "Risk__c", currentValue: "", extractedValue: "Legal Delay", issueType: "hidden_risk", severity: "medium", evidence: { ...evidence(), factId: "risk-2" } });

    expect(run({ comparisons: [first, second] }).filter((card) => card.actionType === "add_risk_tag")).toHaveLength(1);
  });

  it("coalesces multiple facts that suggest the same update", () => {
    const cards = run({
      facts: [riskFact({ factId: "proc-1" }), riskFact({ factId: "proc-2", sourceId: "src-2" })],
      validationResults: [result("proc-1"), result("proc-2")],
    });

    expect(cards.filter((card) => card.actionType === "request_manager_review")).toHaveLength(1);
  });

  it("keeps conflicting recommendations separate when suggested values differ", () => {
    const cards = run({ comparisons: [comparison({ crmField: "ForecastCategoryName", extractedValue: "PIPELINE", evidence: { ...evidence(), factId: "f1" } }), comparison({ crmField: "ForecastCategoryName", extractedValue: "BEST_CASE", evidence: { ...evidence(), factId: "f2" } })] });

    expect(cards.filter((card) => card.actionType === "update_crm_field")).toHaveLength(2);
  });

  it("suppresses a recommendation when an equivalent pending card already exists", () => {
    const duplicateKey = "update_crm_field|ForecastCategoryName|pipeline";
    const cards = run({ comparisons: [comparison({ crmField: "ForecastCategoryName", extractedValue: "PIPELINE" })], existingRecommendations: [{ duplicateKey, status: "pending_approval" }] });

    expect(cards.filter((card) => card.duplicateKey === duplicateKey)).toEqual([]);
  });

  it("suppresses a recommendation when the user snoozed a similar card", () => {
    const cards = run({ comparisons: [comparison({ crmField: "Risk__c", currentValue: "", extractedValue: "legal delay", issueType: "hidden_risk", severity: "medium" })], snoozedRecommendations: [{ actionType: "add_risk_tag", crmField: "Risk__c", suggestedValue: "legal delay", status: "snoozed" }] });

    expect(cards).toEqual([]);
  });

  it("marks cards when a required approver is missing", () => {
    const cards = run({ comparisons: [comparison({ crmField: "CloseDate", currentValue: "2026-06-05", extractedValue: "2026-07-01", issueType: "timeline_mismatch", severity: "high" })] });

    expect(find(cards, "update_crm_field")).toEqual(expect.objectContaining({ missingRequiredApprover: true }));
  });

  it("suppresses unsupported CRM field mappings", () => {
    const cards = run({ comparisons: [comparison({ crmField: "Unsupported__c", issueType: "contradiction", severity: "medium" })] });

    expect(cards).toEqual([]);
  });
});

function run(overrides: Partial<RecommendationContext>): RecommendationCard[] {
  const comparisons = overrides.comparisons ?? [];
  return generateRecommendations({
    opportunity: { id: "opp-1", ownerName: "Alex Rivera" },
    facts: [],
    comparisons,
    validationResults: comparisons.map((item) => result(item.evidence.factId)),
    ...overrides,
  });
}

function find(cards: RecommendationCard[], actionType: RecommendationCard["actionType"]): RecommendationCard {
  const card = cards.find((item) => item.actionType === actionType);
  if (!card) throw new Error(`Missing ${actionType}`);
  return card;
}

function comparison(overrides: Partial<FieldComparison> = {}): FieldComparison {
  return {
    crmField: "ForecastCategoryName",
    currentValue: "COMMIT",
    extractedValue: "PIPELINE",
    issueType: "forecast_mismatch",
    severity: "high",
    evidence: evidence(),
    recommendationEligible: true,
    ...overrides,
  };
}

function evidence() {
  return { factId: "fact-1", sourceId: "src-1", sourceTimestamp, evidenceText: "Manager note says not commit-ready.", validationStatus: "valid" as const, confidence: 0.9 };
}

function result(factId: string, overrides: Partial<ValidationResult> = {}): ValidationResult {
  return { factId, status: "valid", reasons: ["VALID"], confidence: 0.9, actionRisk: "low", evidenceStatus: "present", ...overrides };
}

function riskFact(overrides: Partial<ValidationFact> = {}): ValidationFact {
  return {
    factId: "proc-1",
    factType: "procurement_status",
    rawValue: "procurement blocked",
    normalizedValue: "procurement blocked",
    evidenceText: "Procurement is blocked on vendor setup.",
    sourceId: "src-1",
    sourceTimestamp,
    confidence: 0.9,
    confidenceBand: "high",
    suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "ProcurementStatus__c", fieldLabel: "Procurement Status", confidence: 1 },
    recommendationEligible: true,
    sourceMatchStatus: "matched",
    ...overrides,
  };
}
