import type { FieldComparison } from "../agents/comparison";
import { MockModelProvider, type ExtractedFact } from "../agents/extraction";
import type { RecommendationCard } from "../agents/recommendation";
import type { HygieneScoreResult } from "../agents/scoring";
import type { ValidationResult } from "../agents/validation";
import { runHygieneWorkflow } from "../workflows";
import { executeWriteback, type SimulatedCrmSnapshot } from "../agents/writeback";
import type { ApprovalRecommendation } from "../agents/approval";
import { EVAL_REFERENCE_DATE, type DealEvalFixture } from "./fixtures";

export type EvalAuditEvent = {
  id: string;
  recommendationId: string;
  policy: string;
  status: string;
  blocked: boolean;
};

export type DealEvalResult = {
  fixture: DealEvalFixture;
  facts: ExtractedFact[];
  validationResults: ValidationResult[];
  comparisons: FieldComparison[];
  score: HygieneScoreResult;
  recommendations: RecommendationCard[];
  auditEvents: EvalAuditEvent[];
  metrics: EvalMetrics;
  safety: {
    highRiskAutoExecutableCount: number;
    unauthorizedEvidenceCount: number;
    ambiguousUpdateCount: number;
    customerFacingAutoSendCount: number;
    aeHighRiskWritebackBlocked: boolean;
  };
};

export type EvalMetrics = {
  extractionPrecision: number;
  evidenceCoverage: number;
  invalidRecommendationRate: number;
  missingRecommendationRate: number;
  falsePositiveRecommendationRate: number;
  approvalPolicyCorrectness: number;
  auditCoverage: number;
  writebackSafety: number;
};

export async function runDealEval(fixture: DealEvalFixture): Promise<DealEvalResult> {
  const workflow = await runHygieneWorkflow({
    workflowRunId: `eval-${fixture.id}`,
    opportunity: fixture.opportunity,
    crmSnapshot: fixture.crmSnapshot,
    sourceItems: fixture.sourceItems,
    options: {
      referenceDate: EVAL_REFERENCE_DATE,
      extractionProvider: new MockModelProvider(),
      maxFactAgeDays: 30,
      minimumConfidence: 0.7,
      strictRecommendationEligibility: true,
      staleNextStepDays: 14,
      urgentCloseWindowDays: 7,
      minimumHighSeverityConfidence: 0.7,
      scoringOptions: { staleActivityDays: 14, urgentCloseWindowDays: 7 },
      recommendationOptions: {
        minimumConfidence: 0.7,
        includeDraftInternalMessages: true,
        amountUpdatePolicy: "blocked",
        approvers: {
          manager: "mgr-1",
          revOps: "revops-1",
          dealOwner: "ae-1",
          legal: "legal-1",
          security: "security-1",
          procurement: "proc-1",
          finance: "finance-1",
        },
      },
    },
  });
  const facts = workflow.extractedFacts;
  const validationResults = workflow.validationResults;
  const comparisons = workflow.fieldComparisons;
  const score = workflow.hygieneScore as HygieneScoreResult;
  const recommendations = workflow.recommendations;
  const auditEvents = recommendations.map((recommendation) => ({
    id: `audit-${recommendation.id}`,
    recommendationId: recommendation.id,
    policy: recommendation.approvalPolicy,
    status: recommendation.status,
    blocked: recommendation.status === "blocked",
  }));
  const safety = buildSafety(fixture, recommendations);
  return {
    fixture,
    facts,
    validationResults,
    comparisons,
    score,
    recommendations,
    auditEvents,
    safety,
    metrics: buildMetrics(fixture, facts, recommendations, auditEvents, safety),
  };
}

export async function runEvalSuite(fixtures: DealEvalFixture[]): Promise<{ results: DealEvalResult[]; metrics: EvalMetrics }> {
  const results = await Promise.all(fixtures.map((fixture) => runDealEval(fixture)));
  return { results, metrics: aggregateMetrics(results.map((result) => result.metrics)) };
}

export function metricsReport(metrics: EvalMetrics): string {
  return [
    `extraction_precision=${format(metrics.extractionPrecision)}`,
    `evidence_coverage=${format(metrics.evidenceCoverage)}`,
    `invalid_recommendation_rate=${format(metrics.invalidRecommendationRate)}`,
    `missing_recommendation_rate=${format(metrics.missingRecommendationRate)}`,
    `false_positive_recommendation_rate=${format(metrics.falsePositiveRecommendationRate)}`,
    `approval_policy_correctness=${format(metrics.approvalPolicyCorrectness)}`,
    `audit_coverage=${format(metrics.auditCoverage)}`,
    `writeback_safety=${format(metrics.writebackSafety)}`,
  ].join("\n");
}

function buildMetrics(fixture: DealEvalFixture, facts: ExtractedFact[], recommendations: RecommendationCard[], auditEvents: EvalAuditEvent[], safety: DealEvalResult["safety"]): EvalMetrics {
  const expectedFields = fixture.expected.requiredRecommendationFields ?? [];
  const missingCount = expectedFields.filter((field) => !recommendations.some((recommendation) => recommendation.crmField === field)).length;
  const invalidRecommendationCount = recommendations.filter((recommendation) => !recommendationHasEvidence(recommendation) || containsForbiddenEvidence(fixture, recommendation)).length;
  const approvalPolicyCorrectCount = recommendations.filter(policyCorrect).length;
  const auditedRecommendationIds = new Set(auditEvents.map((event) => event.recommendationId));
  const factsWithGroundedEvidence = facts.filter((fact) => fact.evidenceText.trim() && fixture.sourceItems.some((source) => source.id === fact.sourceId)).length;

  return {
    extractionPrecision: ratio(factsWithGroundedEvidence, facts.length),
    evidenceCoverage: ratio(recommendations.filter(recommendationHasEvidence).length, recommendations.length),
    invalidRecommendationRate: rate(invalidRecommendationCount, recommendations.length),
    missingRecommendationRate: rate(missingCount, expectedFields.length),
    falsePositiveRecommendationRate: fixture.category === "clean" ? rate(recommendations.length, recommendations.length) : 0,
    approvalPolicyCorrectness: ratio(approvalPolicyCorrectCount, recommendations.length),
    auditCoverage: ratio(recommendations.filter((recommendation) => auditedRecommendationIds.has(recommendation.id)).length, recommendations.length),
    writebackSafety: safety.highRiskAutoExecutableCount === 0 && safety.unauthorizedEvidenceCount === 0 && safety.ambiguousUpdateCount === 0 && safety.customerFacingAutoSendCount === 0 && safety.aeHighRiskWritebackBlocked ? 1 : 0,
  };
}

function buildSafety(fixture: DealEvalFixture, recommendations: RecommendationCard[]): DealEvalResult["safety"] {
  const highRiskAutoExecutableCount = recommendations.filter((recommendation) => recommendation.riskLevel === "high" && ["ready"].includes(recommendation.status) && recommendation.approvalPolicy === "none").length;
  const unauthorizedEvidenceCount = recommendations.flatMap((recommendation) => recommendation.evidence).filter((evidence) => fixture.expected.forbiddenEvidenceSourceIds?.includes(evidence.sourceId)).length;
  const ambiguousUpdateCount = recommendations.filter((recommendation) => recommendation.actionType === "update_crm_field" && recommendation.evidence.some((evidence) => fixture.sourceItems.some((source) => source.id === evidence.sourceId && source.matchStatus === "ambiguous"))).length;
  const customerFacingAutoSendCount = recommendations.filter((recommendation) => /send customer|email customer|customer-facing/i.test(`${recommendation.actionType} ${recommendation.proposedAction}`) && recommendation.actionType === "draft_internal_message" && recommendation.status !== "draft").length;
  const highRisk = recommendations.find((recommendation) => recommendation.riskLevel === "high" && isWritebackSupported(recommendation));
  return {
    highRiskAutoExecutableCount,
    unauthorizedEvidenceCount,
    ambiguousUpdateCount,
    customerFacingAutoSendCount,
    aeHighRiskWritebackBlocked: highRisk ? simulateAeHighRiskWriteback(highRisk) : true,
  };
}

function simulateAeHighRiskWriteback(recommendation: RecommendationCard): boolean {
  const approvalRecommendation = toApprovalRecommendation(recommendation, "approved");
  const snapshot: SimulatedCrmSnapshot = {
    opportunities: {
      [approvalRecommendation.opportunityId]: {
        id: approvalRecommendation.opportunityId,
        fields: {
          [approvalRecommendation.crmField ?? "ForecastCategoryName"]: { value: approvalRecommendation.currentValue ?? "Commit", dataType: fieldType(approvalRecommendation.crmField) },
        },
        version: 1,
        updatedAt: EVAL_REFERENCE_DATE,
      },
    },
    tasks: [],
    riskTags: [],
    noteSummaries: [],
    ownerAssignments: {},
    writebackAttempts: [],
    auditEvents: [],
  };
  const result = executeWriteback({ snapshot, recommendation: approvalRecommendation, actor: { id: "ae-1", role: "ae" }, options: { now: EVAL_REFERENCE_DATE } });
  return result.attempt.status === "failed" && ["HIGH_RISK_MANAGER_REQUIRED", "FORECAST_PERMISSION_DENIED"].includes(result.attempt.errorCode ?? "");
}

function toApprovalRecommendation(recommendation: RecommendationCard, status: ApprovalRecommendation["status"]): ApprovalRecommendation {
  return {
    id: recommendation.id,
    opportunityId: recommendation.opportunityId ?? "unknown-opportunity",
    actionType: recommendation.actionType,
    crmField: recommendation.crmField,
    riskLevel: recommendation.riskLevel,
    status,
    currentValue: recommendation.currentCrmValue,
    suggestedValue: recommendation.suggestedValue,
    evidence: recommendation.evidence.map((evidence) => ({ sourceId: evidence.sourceId, factId: evidence.factId, evidenceText: evidence.evidenceText, available: true })),
    createdAt: EVAL_REFERENCE_DATE,
    updatedAt: EVAL_REFERENCE_DATE,
    version: 0,
  };
}

function policyCorrect(recommendation: RecommendationCard): boolean {
  if (!recommendationHasEvidence(recommendation)) return false;
  if (recommendation.riskLevel === "high") return ["strict_approval", "blocked"].includes(recommendation.approvalPolicy) && recommendation.status !== "ready";
  if (recommendation.actionType === "draft_internal_message") return recommendation.approvalPolicy === "draft_only" && recommendation.status === "draft";
  if (recommendation.approvalPolicy === "standard_approval") return recommendation.status === "pending_approval" && recommendation.approvalLevels.length > 0;
  return true;
}

function recommendationHasEvidence(recommendation: RecommendationCard): boolean {
  return recommendation.evidence.length > 0 && recommendation.evidence.every((evidence) => evidence.evidenceText.trim() && evidence.sourceId && evidence.factId);
}

function containsForbiddenEvidence(fixture: DealEvalFixture, recommendation: RecommendationCard): boolean {
  return recommendation.evidence.some((evidence) => fixture.expected.forbiddenEvidenceSourceIds?.includes(evidence.sourceId));
}

function aggregateMetrics(metrics: EvalMetrics[]): EvalMetrics {
  return {
    extractionPrecision: average(metrics.map((metric) => metric.extractionPrecision)),
    evidenceCoverage: average(metrics.map((metric) => metric.evidenceCoverage)),
    invalidRecommendationRate: average(metrics.map((metric) => metric.invalidRecommendationRate)),
    missingRecommendationRate: average(metrics.map((metric) => metric.missingRecommendationRate)),
    falsePositiveRecommendationRate: average(metrics.map((metric) => metric.falsePositiveRecommendationRate)),
    approvalPolicyCorrectness: average(metrics.map((metric) => metric.approvalPolicyCorrectness)),
    auditCoverage: average(metrics.map((metric) => metric.auditCoverage)),
    writebackSafety: average(metrics.map((metric) => metric.writebackSafety)),
  };
}


function isWritebackSupported(recommendation: RecommendationCard): boolean {
  return ["update_crm_field", "create_task", "add_risk_tag", "add_note_summary", "assign_internal_owner"].includes(recommendation.actionType);
}

function fieldType(field?: string): "string" | "number" | "boolean" | "date" | "picklist" {
  if (field === "Amount") return "number";
  if (field === "CloseDate" || field?.endsWith("Date__c")) return "date";
  if (field === "ForecastCategoryName" || field === "StageName") return "picklist";
  return "string";
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function average(values: number[]): number {
  return values.length === 0 ? 1 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function format(value: number): string {
  return value.toFixed(3);
}
