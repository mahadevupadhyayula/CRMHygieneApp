import { describe, expect, it } from "vitest";

import { scoreOpportunity, type HygieneScoreResult, type ScoringContext } from "../../lib/agents/scoring";
import type { FieldComparison } from "../../lib/agents/comparison";
import type { ValidationFact, ValidationResult } from "../../lib/agents/validation";

const referenceDate = new Date("2026-05-30T12:00:00.000Z");

const baseContext: ScoringContext = {
  opportunity: { id: "opp-1", stage: "NEGOTIATION", forecastCategory: "COMMIT", amount: 100000, closeDate: new Date("2026-06-20T00:00:00.000Z"), ownerName: "Alex Rivera" },
  crmSnapshot: [
    { fieldName: "StageName", value: "NEGOTIATION", capturedAt: referenceDate },
    { fieldName: "ForecastCategoryName", value: "COMMIT", capturedAt: referenceDate },
    { fieldName: "Amount", value: "100000", capturedAt: referenceDate },
    { fieldName: "CloseDate", value: "2026-06-20", capturedAt: referenceDate },
    { fieldName: "NextStep", value: "Procurement call on 2026-06-02", capturedAt: referenceDate },
    { fieldName: "NextStepDueDate__c", value: "2026-06-02", capturedAt: referenceDate },
    { fieldName: "DecisionMaker__c", value: "Priya Shah", capturedAt: referenceDate },
  ],
  contacts: [{ firstName: "Priya", lastName: "Shah", title: "VP Revenue Operations", opportunityRole: "Economic Buyer", isPrimary: true }],
  sourceItems: [{ id: "src-1", title: "MAP review", body: "Next step: Procurement call on 2026-06-02.", occurredAt: new Date("2026-05-29T16:00:00.000Z") }],
  facts: [fact({ factId: "next", factType: "next_step", rawValue: "Procurement call on 2026-06-02", normalizedValue: "procurement call on 2026-06-02" })],
  validationResults: [result("next")],
  comparisons: [],
  options: { referenceDate },
};

describe("Stage 8 hygiene scoring", () => {
  it("scores a healthy deal between 80 and 100 with low risk", () => {
    const scored = run(baseContext);

    expect(scored.score).toBeGreaterThanOrEqual(80);
    expect(scored.score).toBeLessThanOrEqual(100);
    expect(scored.riskLevel).toBe("Low");
    expect(scored.explanation).toContain("Hygiene score");
  });

  it("reduces next-step clarity when the next step is missing", () => {
    const scored = run({ ...baseContext, crmSnapshot: baseContext.crmSnapshot?.filter((field) => field.fieldName !== "NextStep" && field.fieldName !== "NextStepDueDate__c"), facts: [], validationResults: [] });

    expect(dimension(scored, "next_step_clarity").score).toBeLessThan(dimension(run(baseContext), "next_step_clarity").score);
    expect(scored.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ dimension: "next_step_clarity", crmField: "NextStep" })]));
  });

  it("significantly reduces consistency and forecast support for a forecast contradiction", () => {
    const scored = run({
      ...baseContext,
      comparisons: [comparison({ issueType: "forecast_mismatch", crmField: "ForecastCategoryName", currentValue: "COMMIT", extractedValue: "PIPELINE", severity: "high" })],
    });

    expect(dimension(scored, "consistency").score).toBeLessThanOrEqual(75);
    expect(dimension(scored, "forecast_support").score).toBeLessThanOrEqual(72);
    expect(scored.riskLevel).toBe("Medium");
  });

  it("increases forecast risk when close date pressure combines with an open blocker", () => {
    const scored = run({
      ...baseContext,
      opportunity: { ...baseContext.opportunity, closeDate: new Date("2026-06-03T00:00:00.000Z") },
      facts: [fact({ factId: "legal", factType: "legal_status", rawValue: "legal pending redlines", normalizedValue: "legal pending redlines" })],
      validationResults: [result("legal")],
    });

    expect(scored.riskLevel).toBe("High");
    expect(scored.riskPoints).toBeGreaterThanOrEqual(45);
  });

  it("raises risk for procurement, legal, and security blockers", () => {
    const scored = run({
      ...baseContext,
      facts: [
        fact({ factId: "proc", factType: "procurement_status", rawValue: "procurement pending vendor onboarding", normalizedValue: "procurement pending vendor onboarding" }),
        fact({ factId: "legal", factType: "legal_status", rawValue: "legal pending redlines", normalizedValue: "legal pending redlines" }),
        fact({ factId: "security", factType: "security_status", rawValue: "security pending SOC 2", normalizedValue: "security pending soc 2" }),
      ],
      validationResults: [result("proc"), result("legal"), result("security")],
    });

    expect(scored.riskLevel).toBe("Critical");
    expect(dimension(scored, "risk_visibility").score).toBeLessThan(100);
  });

  it("reduces stakeholder clarity when there is no decision-maker", () => {
    const scored = run({
      ...baseContext,
      crmSnapshot: baseContext.crmSnapshot?.filter((field) => field.fieldName !== "DecisionMaker__c"),
      contacts: [{ firstName: "Sam", lastName: "Patel", title: "Business Analyst", opportunityRole: "Evaluator", isPrimary: true }],
    });

    expect(dimension(scored, "stakeholder_clarity").score).toBeLessThan(80);
  });

  it("reduces coordination readiness when there is no owner", () => {
    const scored = run({ ...baseContext, opportunity: { ...baseContext.opportunity, ownerName: "" } });

    expect(dimension(scored, "coordination_readiness").score).toBeLessThan(80);
  });

  it("updates the score after an issue is resolved", () => {
    const unresolved = run({ ...baseContext, comparisons: [comparison({ issueType: "missing_task", crmField: "NextStepDueDate__c", currentValue: "", extractedValue: "procurement call", severity: "medium" })] });
    const resolved = run(baseContext);

    expect(resolved.score).toBeGreaterThan(unresolved.score);
    expect(dimension(resolved, "next_step_clarity").score).toBeGreaterThan(dimension(unresolved, "next_step_clarity").score);
  });

  it("clamps scores so they cannot go below 0", () => {
    const scored = run({
      ...baseContext,
      opportunity: { stage: "", forecastCategory: "", amount: null, closeDate: null, ownerName: "" },
      crmSnapshot: [],
      contacts: [],
      sourceItems: [],
      facts: [fact({ factId: "proc", factType: "procurement_status", rawValue: "procurement pending", normalizedValue: "procurement pending" })],
      validationResults: [result("proc")],
      comparisons: Array.from({ length: 20 }, (_, index) => comparison({ crmField: `Field${index}`, issueType: "contradiction", severity: "high" })),
    });

    expect(Math.min(...scored.dimensions.map((item) => item.score))).toBeGreaterThanOrEqual(0);
    expect(scored.score).toBeGreaterThanOrEqual(0);
  });

  it("clamps scores so they cannot exceed 100", () => {
    const scored = run(baseContext);

    expect(Math.max(...scored.dimensions.map((item) => item.score))).toBeLessThanOrEqual(100);
    expect(scored.score).toBeLessThanOrEqual(100);
  });

  it("does not hallucinate critical risk from missing data alone", () => {
    const scored = run({ ...baseContext, sourceItems: [], facts: [], validationResults: [], comparisons: [] });

    expect(scored.riskLevel).not.toBe("Critical");
    expect(scored.riskPoints).toBeLessThan(45);
  });

  it("compounds multiple issues without double-counting the same issue", () => {
    const duplicate = comparison({ issueType: "forecast_mismatch", crmField: "ForecastCategoryName", currentValue: "COMMIT", extractedValue: "PIPELINE", severity: "high" });
    const withOne = run({ ...baseContext, comparisons: [duplicate] });
    const withDuplicate = run({ ...baseContext, comparisons: [duplicate, duplicate] });
    const withAdditional = run({ ...baseContext, comparisons: [duplicate, comparison({ issueType: "hidden_risk", crmField: "Risk__c", currentValue: "", extractedValue: "legal delay", severity: "medium" })] });

    expect(withDuplicate.score).toBe(withOne.score);
    expect(withAdditional.score).toBeLessThan(withOne.score);
  });

  it("respects admin-configured dimension weights", () => {
    const context = { ...baseContext, comparisons: [comparison({ issueType: "forecast_mismatch", crmField: "ForecastCategoryName", currentValue: "COMMIT", extractedValue: "PIPELINE", severity: "high" })] };
    const defaultWeighted = run(context);
    const adminWeighted = run({ ...context, options: { referenceDate, weights: { forecast_support: 10, consistency: 10, completeness: 0.1, freshness: 0.1, risk_visibility: 0.1, next_step_clarity: 0.1, stakeholder_clarity: 0.1, coordination_readiness: 0.1 } } });

    expect(adminWeighted.score).toBeLessThan(defaultWeighted.score);
    expect(dimension(adminWeighted, "forecast_support").weight).toBe(10);
  });
});

function run(overrides: ScoringContext): HygieneScoreResult {
  return scoreOpportunity(overrides);
}

function dimension(result: HygieneScoreResult, name: string) {
  const found = result.dimensions.find((item) => item.dimension === name);
  if (!found) throw new Error(`Missing dimension ${name}`);
  return found;
}

function fact(overrides: Partial<ValidationFact>): ValidationFact {
  return {
    factId: "fact-1",
    factType: "next_step",
    rawValue: "Procurement call on 2026-06-02",
    normalizedValue: "procurement call on 2026-06-02",
    evidenceText: "Next step is procurement call on 2026-06-02.",
    sourceId: "src-1",
    sourceTimestamp: new Date("2026-05-29T16:00:00.000Z"),
    confidence: 0.9,
    confidenceBand: "high",
    suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "NextStep", fieldLabel: "Next Step", confidence: 1 },
    recommendationEligible: true,
    sourceMatchStatus: "matched",
    ...overrides,
  };
}

function result(factId: string, overrides: Partial<ValidationResult> = {}): ValidationResult {
  return { factId, status: "valid", reasons: ["VALID"], confidence: 0.9, actionRisk: "low", evidenceStatus: "present", ...overrides };
}

function comparison(overrides: Partial<FieldComparison>): FieldComparison {
  return {
    crmField: "ForecastCategoryName",
    currentValue: "COMMIT",
    extractedValue: "PIPELINE",
    issueType: "forecast_mismatch",
    severity: "high",
    evidence: { factId: "cmp-fact", sourceId: "src-1", sourceTimestamp: new Date("2026-05-29T16:00:00.000Z"), evidenceText: "Manager note says not commit-ready.", validationStatus: "valid", confidence: 0.9 },
    recommendationEligible: true,
    ...overrides,
  };
}
