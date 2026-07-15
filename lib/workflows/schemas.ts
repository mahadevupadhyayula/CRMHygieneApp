import { z } from "zod";

export const hygieneWorkflowFinalStatusSchema = z.enum(["completed", "no_action_required", "clarification_required", "failed"]);
export const hygieneWorkflowEventTypeSchema = z.enum([
  "workflow_started",
  "facts_extracted",
  "validation_completed",
  "comparison_completed",
  "score_calculated",
  "recommendations_generated",
  "workflow_completed",
  "workflow_failed",
]);

export const hygieneWorkflowExecutionEventSchema = z.object({
  id: z.string().min(1),
  type: hygieneWorkflowEventTypeSchema,
  workflowRunId: z.string().min(1),
  occurredAt: z.coerce.date(),
  sequence: z.number().int().positive(),
  message: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const hygieneWorkflowTelemetrySchema = z.object({
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date(),
  durationMs: z.number().int().min(0),
  factCount: z.number().int().min(0),
  validFactCount: z.number().int().min(0),
  needsReviewFactCount: z.number().int().min(0),
  rejectedFactCount: z.number().int().min(0),
  comparisonCount: z.number().int().min(0),
  recommendationCount: z.number().int().min(0),
  approvalCount: z.number().int().min(0),
  retryCount: z.number().int().min(0),
}).strict();
