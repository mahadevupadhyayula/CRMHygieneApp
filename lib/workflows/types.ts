import type { FieldComparison } from "../agents/comparison";
import type { AIModelProvider, ExtractedFact, ExtractionContact, ExtractionOpportunity, ExtractionSourceItem } from "../agents/extraction";
import type { ExistingRecommendation, RecommendationCard, RecommendationOptions } from "../agents/recommendation";
import type { HygieneScoreResult, ScoringCRMSnapshot, ScoringOptions } from "../agents/scoring";
import type { ValidationResult } from "../agents/validation";

export type HygieneWorkflowFinalStatus = "completed" | "no_action_required" | "clarification_required" | "failed";

export type HygieneWorkflowEventType =
  | "workflow_started"
  | "facts_extracted"
  | "validation_completed"
  | "comparison_completed"
  | "score_calculated"
  | "recommendations_generated"
  | "workflow_completed"
  | "workflow_failed";

export type HygieneWorkflowExecutionEvent = {
  id: string;
  type: HygieneWorkflowEventType;
  workflowRunId: string;
  occurredAt: Date;
  sequence: number;
  message?: string;
  metadata?: Record<string, unknown>;
};

export type HygieneWorkflowTelemetry = {
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  factCount: number;
  validFactCount: number;
  needsReviewFactCount: number;
  rejectedFactCount: number;
  comparisonCount: number;
  recommendationCount: number;
  approvalCount: number;
  retryCount: number;
};

export type HygieneWorkflowOptions = {
  referenceDate?: Date;
  extractionProvider?: AIModelProvider;
  maxFactAgeDays?: number;
  minimumConfidence?: number;
  strictRecommendationEligibility?: boolean;
  staleNextStepDays?: number;
  urgentCloseWindowDays?: number;
  minimumHighSeverityConfidence?: number;
  scoringOptions?: Partial<ScoringOptions>;
  recommendationOptions?: RecommendationOptions;
  retryCount?: number;
  now?: () => Date;
};

export type RunHygieneWorkflowInput = {
  workflowRunId?: string;
  opportunity?: ExtractionOpportunity;
  crmSnapshot?: ScoringCRMSnapshot[];
  sourceItems?: ExtractionSourceItem[];
  contacts?: ExtractionContact[];
  existingRecommendations?: ExistingRecommendation[];
  snoozedRecommendations?: ExistingRecommendation[];
  options?: HygieneWorkflowOptions;
};

export type HygieneWorkflowResult = {
  workflowRunId: string;
  extractedFacts: ExtractedFact[];
  validationResults: ValidationResult[];
  fieldComparisons: FieldComparison[];
  hygieneScore: HygieneScoreResult | null;
  recommendations: RecommendationCard[];
  executionEvents: HygieneWorkflowExecutionEvent[];
  telemetry: HygieneWorkflowTelemetry;
  finalStatus: HygieneWorkflowFinalStatus;
  error?: { message: string; name?: string };
};
