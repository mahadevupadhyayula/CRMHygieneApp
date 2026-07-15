import { describe, expect, it } from "vitest";

import { MockModelProvider, type AIModelProvider, type ExtractionSourceItem } from "../../lib/agents/extraction";
import { runDealEval } from "../evals/harness";
import { dealEvalFixtures, EVAL_REFERENCE_DATE } from "../evals/fixtures";
import { runHygieneWorkflow } from "../../lib/workflows";

const referenceDate = new Date("2026-05-31T00:00:00.000Z");
const sourceDate = new Date("2026-05-25T10:00:00.000Z");

const opportunity = {
  id: "opp-1",
  name: "Acme Renewal",
  stage: "Negotiation",
  forecastCategory: "Commit",
  closeDate: new Date("2026-06-30T00:00:00.000Z"),
  ownerName: "Alex AE",
  amount: 100000,
};

function source(body: string, overrides: Partial<ExtractionSourceItem> = {}): ExtractionSourceItem {
  return { id: overrides.id ?? "src-1", body, occurredAt: overrides.occurredAt ?? sourceDate, matchStatus: overrides.matchStatus ?? "matched", metadata: { visibility: "public", ...overrides.metadata }, ...overrides };
}

function healthySnapshot() {
  return [
    { fieldName: "NextStep", value: "run executive close-plan review", capturedAt: sourceDate },
    { fieldName: "NextStepDueDate__c", value: "2026-06-05", capturedAt: sourceDate },
    { fieldName: "DecisionMaker__c", value: "morgan cfo", capturedAt: sourceDate },
    { fieldName: "Risk__c", value: "none", capturedAt: sourceDate },
    { fieldName: "ForecastCategoryName", value: "Commit", capturedAt: sourceDate },
    { fieldName: "CloseDate", value: "2026-06-30", capturedAt: sourceDate },
    { fieldName: "StageName", value: "Negotiation", capturedAt: sourceDate },
    { fieldName: "Amount", value: "100000", capturedAt: sourceDate },
  ];
}

function baseOptions(provider: AIModelProvider = new MockModelProvider()) {
  return { referenceDate, extractionProvider: provider, minimumConfidence: 0.7, maxFactAgeDays: 30 };
}

describe("runHygieneWorkflow", () => {
  it("orchestrates extraction, validation, comparison, scoring, and recommendations", async () => {
    const result = await runHygieneWorkflow({
      workflowRunId: "workflow-orchestration",
      opportunity,
      crmSnapshot: [{ fieldName: "NextStep", value: null, capturedAt: sourceDate }, ...healthySnapshot().slice(1)],
      sourceItems: [source("Next step: schedule pricing workshop. Decision-maker: Morgan CFO.")],
      options: baseOptions(),
    });

    expect(result.finalStatus).toBe("completed");
    expect(result.extractedFacts.length).toBeGreaterThan(0);
    expect(result.validationResults.length).toBe(result.extractedFacts.length);
    expect(result.fieldComparisons.length).toBeGreaterThan(0);
    expect(result.hygieneScore?.score).toBeGreaterThanOrEqual(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("returns no_action_required for healthy CRM with aligned evidence", async () => {
    const result = await runHygieneWorkflow({
      workflowRunId: "workflow-healthy",
      opportunity,
      crmSnapshot: healthySnapshot(),
      sourceItems: [source("Next step: run executive close-plan review. Next-step due date: 2026-06-05. Decision-maker: Morgan CFO. Forecast signal: Commit remains supported by the buyer plan.")],
      contacts: [{ fullName: "Morgan CFO" }],
      options: baseOptions(),
    });

    expect(result.finalStatus).toBe("no_action_required");
    expect(result.recommendations).toHaveLength(0);
  });

  it("returns clarification_required for ambiguous close date evidence", async () => {
    const result = await runHygieneWorkflow({
      workflowRunId: "workflow-ambiguous-close-date",
      opportunity,
      crmSnapshot: healthySnapshot(),
      sourceItems: [source("Close date risk: end of quarter.")],
      options: baseOptions(),
    });

    expect(result.finalStatus).toBe("clarification_required");
    expect(result.telemetry.needsReviewFactCount).toBeGreaterThan(0);
  });

  it("returns failed when the injected provider throws", async () => {
    const provider: AIModelProvider = { extractDealFacts: async () => { throw new Error("provider unavailable"); } };

    const result = await runHygieneWorkflow({ workflowRunId: "workflow-failure", opportunity, crmSnapshot: healthySnapshot(), sourceItems: [source("Next step: call buyer.")], options: baseOptions(provider) });

    expect(result.finalStatus).toBe("failed");
    expect(result.error?.message).toBe("provider unavailable");
    expect(result.executionEvents.at(-1)?.type).toBe("workflow_failed");
  });

  it("records telemetry and ordered execution events", async () => {
    const result = await runHygieneWorkflow({ workflowRunId: "workflow-telemetry", opportunity, crmSnapshot: healthySnapshot(), sourceItems: [source("Next step: run executive close-plan review.")], options: baseOptions() });

    expect(result.executionEvents.map((event) => event.type)).toEqual(["workflow_started", "facts_extracted", "validation_completed", "comparison_completed", "score_calculated", "recommendations_generated", "workflow_completed"]);
    expect(result.executionEvents.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(result.telemetry.factCount).toBe(result.extractedFacts.length);
    expect(result.telemetry.comparisonCount).toBe(result.fieldComparisons.length);
    expect(result.telemetry.recommendationCount).toBe(result.recommendations.length);
  });

  it("keeps the eval harness on the shared workflow service", async () => {
    const fixture = dealEvalFixtures[0];
    const evalResult = await runDealEval(fixture);
    const workflowResult = await runHygieneWorkflow({ workflowRunId: `eval-${fixture.id}`, opportunity: fixture.opportunity, crmSnapshot: fixture.crmSnapshot, sourceItems: fixture.sourceItems, options: { ...baseOptions(), referenceDate: EVAL_REFERENCE_DATE } });

    expect(evalResult.facts).toEqual(workflowResult.extractedFacts);
    expect(evalResult.validationResults).toEqual(workflowResult.validationResults);
    expect(evalResult.comparisons).toEqual(workflowResult.fieldComparisons);
  });
});
