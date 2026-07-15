import { compareFields } from "../agents/comparison";
import { MockModelProvider, StructuredExtractionAgent } from "../agents/extraction";
import { generateRecommendations } from "../agents/recommendation";
import { scoreOpportunity } from "../agents/scoring";
import { validateFacts } from "../agents/validation";
import type { HygieneWorkflowExecutionEvent, HygieneWorkflowFinalStatus, HygieneWorkflowResult, HygieneWorkflowTelemetry, RunHygieneWorkflowInput } from "./types";

export async function runHygieneWorkflow(input: RunHygieneWorkflowInput): Promise<HygieneWorkflowResult> {
  const workflowRunId = input.workflowRunId ?? createWorkflowRunId();
  const clock = input.options?.now ?? (() => new Date());
  const startedAt = clock();
  const events: HygieneWorkflowExecutionEvent[] = [];
  const retryCount = input.options?.retryCount ?? 0;
  const base = {
    extractedFacts: [],
    validationResults: [],
    fieldComparisons: [],
    hygieneScore: null,
    recommendations: [],
  } satisfies Pick<HygieneWorkflowResult, "extractedFacts" | "validationResults" | "fieldComparisons" | "hygieneScore" | "recommendations">;

  const emit = (type: HygieneWorkflowExecutionEvent["type"], message?: string, metadata?: Record<string, unknown>) => {
    events.push({ id: `${workflowRunId}-${events.length + 1}-${type}`, type, workflowRunId, occurredAt: clock(), sequence: events.length + 1, message, metadata });
  };

  emit("workflow_started", "CRM hygiene workflow started.");

  try {
    const opportunity = input.opportunity;
    const contacts = input.contacts ?? [];
    const sourceItems = input.sourceItems ?? [];
    const crmSnapshot = input.crmSnapshot ?? [];
    const referenceDate = input.options?.referenceDate ?? startedAt;
    const extractor = new StructuredExtractionAgent(input.options?.extractionProvider ?? new MockModelProvider());

    const extractedFacts = await extractor.extractDealFacts({ opportunity, contacts, sourceItems });
    emit("facts_extracted", "Facts extracted from source evidence.", { factCount: extractedFacts.length });

    const validationResults = validateFacts({
      facts: extractedFacts,
      sources: sourceItems.map((item) => ({ id: item.id, occurredAt: item.occurredAt, visibility: sourceVisibility(item), metadata: item.metadata })),
      options: {
        referenceDate,
        maxFactAgeDays: input.options?.maxFactAgeDays ?? 30,
        minimumConfidence: input.options?.minimumConfidence ?? 0.7,
        strictRecommendationEligibility: input.options?.strictRecommendationEligibility ?? true,
      },
    });
    emit("validation_completed", "Fact validation completed.", statusCounts(validationResults));

    const fieldComparisons = compareFields({
      opportunity,
      crmSnapshot,
      facts: extractedFacts,
      validationResults,
      options: {
        referenceDate,
        staleNextStepDays: input.options?.staleNextStepDays ?? 14,
        urgentCloseWindowDays: input.options?.urgentCloseWindowDays ?? 7,
        minimumHighSeverityConfidence: input.options?.minimumHighSeverityConfidence ?? 0.7,
      },
    });
    emit("comparison_completed", "CRM field comparison completed.", { comparisonCount: fieldComparisons.length });

    const hygieneScore = scoreOpportunity({
      opportunity,
      crmSnapshot,
      contacts,
      sourceItems: sourceItems.map((item) => ({ ...item, visibility: sourceVisibility(item) })),
      facts: extractedFacts,
      validationResults,
      comparisons: fieldComparisons,
      options: { referenceDate, staleActivityDays: 14, urgentCloseWindowDays: 7, ...input.options?.scoringOptions },
    });
    emit("score_calculated", "Hygiene score calculated.", { score: hygieneScore.score, riskLevel: hygieneScore.riskLevel });

    const recommendations = generateRecommendations({
      opportunity,
      comparisons: fieldComparisons,
      facts: extractedFacts,
      validationResults,
      existingRecommendations: input.existingRecommendations ?? [],
      snoozedRecommendations: input.snoozedRecommendations ?? [],
      options: input.options?.recommendationOptions ?? { minimumConfidence: input.options?.minimumConfidence ?? 0.7 },
    });
    emit("recommendations_generated", "Recommendations generated.", { recommendationCount: recommendations.length });

    const finalStatus = calculateFinalStatus(validationResults, fieldComparisons, recommendations);
    emit("workflow_completed", "CRM hygiene workflow completed.", { finalStatus });
    const completedAt = clock();

    return { workflowRunId, extractedFacts, validationResults, fieldComparisons, hygieneScore, recommendations, executionEvents: events, telemetry: telemetry(startedAt, completedAt, retryCount, extractedFacts.length, validationResults, fieldComparisons.length, recommendations), finalStatus };
  } catch (error) {
    emit("workflow_failed", "CRM hygiene workflow failed.", { error: error instanceof Error ? error.message : String(error) });
    const completedAt = clock();
    return { workflowRunId, ...base, executionEvents: events, telemetry: telemetry(startedAt, completedAt, retryCount, 0, [], 0, []), finalStatus: "failed", error: error instanceof Error ? { message: error.message, name: error.name } : { message: String(error) } };
  }
}

function sourceVisibility(item: { visibility?: unknown; metadata?: Record<string, unknown> }): string | undefined {
  if (typeof item.visibility === "string") return item.visibility;
  return typeof item.metadata?.visibility === "string" ? item.metadata.visibility : undefined;
}

function calculateFinalStatus(validationResults: HygieneWorkflowResult["validationResults"], comparisons: HygieneWorkflowResult["fieldComparisons"], recommendations: HygieneWorkflowResult["recommendations"]): HygieneWorkflowFinalStatus {
  if (validationResults.some((result) => result.status === "needs_review")) return "clarification_required";
  if (comparisons.length === 0 && recommendations.length === 0) return "no_action_required";
  return "completed";
}

function telemetry(startedAt: Date, completedAt: Date, retryCount: number, factCount: number, validationResults: HygieneWorkflowResult["validationResults"], comparisonCount: number, recommendations: HygieneWorkflowResult["recommendations"]): HygieneWorkflowTelemetry {
  const counts = statusCounts(validationResults);
  return { startedAt, completedAt, durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()), factCount, validFactCount: counts.validFactCount, needsReviewFactCount: counts.needsReviewFactCount, rejectedFactCount: counts.rejectedFactCount, comparisonCount, recommendationCount: recommendations.length, approvalCount: recommendations.filter((recommendation) => recommendation.approvalPolicy !== "none").length, retryCount };
}

function statusCounts(validationResults: HygieneWorkflowResult["validationResults"]): { validFactCount: number; needsReviewFactCount: number; rejectedFactCount: number } {
  return {
    validFactCount: validationResults.filter((result) => result.status === "valid").length,
    needsReviewFactCount: validationResults.filter((result) => result.status === "needs_review").length,
    rejectedFactCount: validationResults.filter((result) => result.status === "rejected").length,
  };
}

function createWorkflowRunId(): string {
  return `hygiene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
