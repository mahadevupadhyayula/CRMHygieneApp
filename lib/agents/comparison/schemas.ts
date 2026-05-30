import { z } from "zod";

import { validationFactSchema, validationResultSchema } from "../validation/schemas";

export const comparisonIssueTypeSchema = z.enum([
  "empty_field",
  "stale_field",
  "contradiction",
  "timeline_mismatch",
  "missing_task",
  "hidden_risk",
  "stage_mismatch",
  "forecast_mismatch",
  "missing_stakeholder",
  "missing_owner",
]);

export const comparisonSeveritySchema = z.enum(["low", "medium", "high"]);

export const comparisonEvidenceSchema = z
  .object({
    factId: z.string().min(1),
    sourceId: z.string().min(1),
    sourceTimestamp: z.coerce.date(),
    evidenceText: z.string().min(1),
    validationStatus: z.enum(["valid", "needs_review"]),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const fieldComparisonSchema = z
  .object({
    crmField: z.string().min(1),
    currentValue: z.string().nullable(),
    extractedValue: z.string().min(1),
    issueType: comparisonIssueTypeSchema,
    severity: comparisonSeveritySchema,
    evidence: comparisonEvidenceSchema,
    recommendationEligible: z.boolean(),
  })
  .strict();

export const crmSnapshotForComparisonSchema = z
  .object({
    id: z.string().optional(),
    fieldName: z.string().min(1),
    value: z.string().nullable().optional(),
    capturedAt: z.coerce.date().optional(),
  })
  .passthrough();

export const opportunityForComparisonSchema = z
  .object({
    id: z.string().optional(),
    stage: z.string().nullable().optional(),
    forecastCategory: z.string().nullable().optional(),
    closeDate: z.coerce.date().nullable().optional(),
    ownerName: z.string().nullable().optional(),
  })
  .passthrough();

export const comparisonOptionsSchema = z.object({
  referenceDate: z.coerce.date().default(() => new Date()),
  staleNextStepDays: z.number().int().positive().default(14),
  urgentCloseWindowDays: z.number().int().positive().default(7),
  minimumHighSeverityConfidence: z.number().min(0).max(1).default(0.7),
});

export const comparisonContextSchema = z
  .object({
    opportunity: opportunityForComparisonSchema.optional(),
    crmSnapshot: z.array(crmSnapshotForComparisonSchema).default([]),
    facts: z.array(validationFactSchema),
    validationResults: z.array(validationResultSchema),
    options: comparisonOptionsSchema.optional(),
  })
  .strict();

export const fieldComparisonListSchema = z.array(fieldComparisonSchema);
