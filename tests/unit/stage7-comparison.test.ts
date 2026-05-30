import { describe, expect, it } from "vitest";

import { compareFields, fieldComparisonSchema, type ComparisonContext } from "../../lib/agents/comparison";
import { validateFacts, type ValidationFact } from "../../lib/agents/validation";

const referenceDate = new Date("2026-05-30T12:00:00.000Z");

function fact(overrides: Partial<ValidationFact> = {}): ValidationFact {
  return {
    factId: "fact-1",
    factType: "next_step",
    rawValue: "send revised proposal",
    normalizedValue: "send revised proposal",
    evidenceText: "Next step: send revised proposal.",
    sourceId: "source-1",
    sourceTimestamp: new Date("2026-05-29T12:00:00.000Z"),
    confidence: 0.9,
    confidenceBand: "high",
    suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "NextStep", fieldLabel: "Next Step", confidence: 1 },
    recommendationEligible: true,
    sourceMatchStatus: "matched",
    ...overrides,
  };
}

function run(facts: ValidationFact[], overrides: Partial<ComparisonContext> = {}) {
  const validationResults = validateFacts({
    facts,
    sources: facts.map((item) => ({ id: item.sourceId, visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } })),
    options: { referenceDate, maxFactAgeDays: 45, minimumConfidence: 0.7 },
  });

  return compareFields({ facts, validationResults, options: { referenceDate }, ...overrides });
}

function issueTypes(comparisons: ReturnType<typeof run>) {
  return comparisons.map((comparison) => comparison.issueType);
}

describe("Stage 7 CRM field comparison engine", () => {
  it("detects an empty decision-maker field when complete stakeholder evidence exists", () => {
    const comparisons = run(
      [fact({ factId: "dm", factType: "decision_maker", rawValue: "Priya Shah", normalizedValue: "priya shah", evidenceText: "Decision-maker: Priya Shah.", suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "DecisionMaker__c", fieldLabel: "Decision Maker", confidence: 1 } })],
      { crmSnapshot: [{ fieldName: "DecisionMaker__c", value: "", capturedAt: referenceDate }] },
    );

    expect(comparisons).toEqual([expect.objectContaining({ crmField: "DecisionMaker__c", issueType: "missing_stakeholder", severity: "medium", currentValue: "", extractedValue: "priya shah" })]);
    expect(fieldComparisonSchema.safeParse(comparisons[0]).success).toBe(true);
  });

  it("detects a stale next step", () => {
    const comparisons = run([fact()], { crmSnapshot: [{ fieldName: "NextStep", value: "Send old proposal by 2026-05-01", capturedAt: referenceDate }] });

    expect(comparisons).toEqual(expect.arrayContaining([expect.objectContaining({ crmField: "NextStep", issueType: "stale_field", severity: "medium" })]));
  });

  it("detects a close date mismatch", () => {
    const comparisons = run(
      [fact({ factId: "timeline", factType: "timeline_signal", rawValue: "pushed to 2026-07-15", normalizedValue: "pushed to 2026-07-15", evidenceText: "Timeline signal: pushed to 2026-07-15.", suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "TimelineSignal__c", fieldLabel: "Timeline Signal", confidence: 1 } })],
      { opportunity: { closeDate: new Date("2026-06-30T00:00:00.000Z") }, crmSnapshot: [{ fieldName: "CloseDate", value: "2026-06-30", capturedAt: referenceDate }] },
    );

    expect(comparisons).toEqual([expect.objectContaining({ crmField: "CloseDate", issueType: "timeline_mismatch", severity: "high" })]);
  });

  it("detects a forecast mismatch", () => {
    const comparisons = run(
      [fact({ factId: "forecast", factType: "forecast_signal", rawValue: "commit", normalizedValue: "commit", evidenceText: "Forecast signal: commit.", suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "ForecastSignal__c", fieldLabel: "Forecast Signal", confidence: 1 } })],
      { opportunity: { forecastCategory: "PIPELINE" }, crmSnapshot: [{ fieldName: "ForecastCategoryName", value: "PIPELINE", capturedAt: referenceDate }] },
    );

    expect(comparisons).toEqual([expect.objectContaining({ crmField: "ForecastCategoryName", issueType: "forecast_mismatch", severity: "high" })]);
  });

  it("detects a stage mismatch", () => {
    const comparisons = run(
      [fact({ factId: "stage", factType: "stage_signal", rawValue: "still defining requirements", normalizedValue: "still defining requirements", evidenceText: "Stage signal: still defining requirements.", suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "StageSignal__c", fieldLabel: "Stage Signal", confidence: 1 } })],
      { opportunity: { stage: "PROPOSAL" }, crmSnapshot: [{ fieldName: "StageName", value: "PROPOSAL", capturedAt: referenceDate }] },
    );

    expect(comparisons).toEqual([expect.objectContaining({ crmField: "StageName", issueType: "stage_mismatch", severity: "high" })]);
  });

  it("detects a missing task due date", () => {
    const comparisons = run([fact({ normalizedValue: "send mutual action plan", rawValue: "send mutual action plan" })], {
      crmSnapshot: [
        { fieldName: "NextStep", value: "send mutual action plan", capturedAt: referenceDate },
        { fieldName: "NextStepDueDate__c", value: "", capturedAt: referenceDate },
      ],
    });

    expect(comparisons).toEqual([expect.objectContaining({ crmField: "NextStepDueDate__c", issueType: "missing_task" })]);
  });

  it("detects hidden risk when CRM risk is empty", () => {
    const comparisons = run(
      [fact({ factId: "risk", factType: "risk", rawValue: "legal delay", normalizedValue: "legal delay", evidenceText: "Risk: legal delay.", confidence: 0.84, confidenceBand: "high", suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "Risk__c", fieldLabel: "Risk", confidence: 1 } })],
      { crmSnapshot: [{ fieldName: "Risk__c", value: "", capturedAt: referenceDate }] },
    );

    expect(comparisons).toEqual([expect.objectContaining({ crmField: "Risk__c", issueType: "hidden_risk", severity: "medium" })]);
  });

  it("does not create an issue for aligned fields", () => {
    const comparisons = run([fact({ normalizedValue: "send revised proposal by 2026-06-04", rawValue: "send revised proposal by 2026-06-04" })], {
      crmSnapshot: [{ fieldName: "NextStep", value: "Send revised proposal by 2026-06-04", capturedAt: referenceDate }],
    });

    expect(comparisons).toEqual([]);
  });

  it("does not promote low-confidence facts into high-severity comparisons", () => {
    const comparisons = run(
      [fact({ factId: "low-forecast", factType: "forecast_signal", rawValue: "not commit-ready", normalizedValue: "not commit-ready", evidenceText: "Forecast signal: not commit-ready.", confidence: 0.45, confidenceBand: "low", recommendationEligible: false, suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "ForecastSignal__c", fieldLabel: "Forecast Signal", confidence: 1 } })],
      { opportunity: { forecastCategory: "COMMIT" }, crmSnapshot: [{ fieldName: "ForecastCategoryName", value: "COMMIT", capturedAt: referenceDate }] },
    );

    expect(comparisons).toEqual([expect.objectContaining({ issueType: "forecast_mismatch", severity: "medium", recommendationEligible: false })]);
  });

  it("does not compare an empty CRM field with incomplete extracted stakeholder evidence", () => {
    const comparisons = run(
      [fact({ factId: "role-only", factType: "decision_maker", rawValue: "CFO", normalizedValue: "cfo", confidence: 0.78, confidenceBand: "high", evidenceText: "Decision-maker: CFO.", suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "DecisionMaker__c", fieldLabel: "Decision Maker", confidence: 1 } })],
      { crmSnapshot: [{ fieldName: "DecisionMaker__c", value: "", capturedAt: referenceDate }] },
    );

    expect(comparisons).toEqual([]);
  });

  it("detects urgent close-date risk when legal has not started", () => {
    const comparisons = run(
      [fact({ factId: "legal", factType: "legal_status", rawValue: "not reviewed contract terms yet", normalizedValue: "not reviewed contract terms yet", evidenceText: "Legal has not reviewed contract terms yet.", suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "LegalStatus__c", fieldLabel: "Legal Status", confidence: 1 } })],
      { opportunity: { closeDate: new Date("2026-06-05T00:00:00.000Z") }, crmSnapshot: [{ fieldName: "CloseDate", value: "2026-06-05", capturedAt: referenceDate }] },
    );

    expect(issueTypes(comparisons)).toContain("timeline_mismatch");
  });

  it("infers negotiation when CRM is Demo but notes mention quote and discount", () => {
    const comparisons = run(
      [fact({ factId: "quote", factType: "stage_signal", rawValue: "quote and discount requested", normalizedValue: "quote and discount requested", evidenceText: "Stage signal: quote and discount requested.", suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "StageSignal__c", fieldLabel: "Stage Signal", confidence: 1 } })],
      { opportunity: { stage: "DEMO" }, crmSnapshot: [{ fieldName: "StageName", value: "DEMO", capturedAt: referenceDate }] },
    );

    expect(comparisons).toEqual([expect.objectContaining({ crmField: "StageName", extractedValue: "NEGOTIATION", issueType: "stage_mismatch" })]);
  });

  it("does not compare stale CRM value when there is no recent contradictory source", () => {
    const comparisons = run([fact({ sourceTimestamp: new Date("2026-04-01T12:00:00.000Z") })], {
      crmSnapshot: [{ fieldName: "NextStep", value: "Send old proposal by 2026-05-01", capturedAt: referenceDate }],
    });

    expect(comparisons).toEqual([]);
  });
});
