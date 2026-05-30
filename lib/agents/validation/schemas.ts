import { z } from "zod";

import {
  crmFieldMappingSchema,
  extractedFactTypeSchema,
  extractionConfidenceBandSchema,
  sourceItemMatchStatusSchema,
} from "../extraction/schemas";

export const validationStatusSchema = z.enum(["valid", "needs_review", "rejected"]);
export const validationActionRiskSchema = z.enum(["low", "medium", "high"]);
export const validationEvidenceStatusSchema = z.enum([
  "present",
  "missing",
  "unauthorized",
  "missing_timestamp",
  "stale",
  "contradictory",
  "inference_only",
]);

export const validationSourceSchema = z
  .object({
    id: z.string().min(1),
    visibility: z.string().optional(),
    occurredAt: z.coerce.date().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const validationFactSchema = z
  .object({
    factId: z.string().min(1).optional(),
    factType: extractedFactTypeSchema,
    rawValue: z.string().default(""),
    normalizedValue: z.string().default(""),
    evidenceText: z.string().optional().default(""),
    sourceId: z.string().min(1),
    sourceTimestamp: z.coerce.date().optional(),
    confidence: z.number().min(0).max(1),
    confidenceBand: extractionConfidenceBandSchema.optional(),
    suggestedCrmFieldMapping: crmFieldMappingSchema.optional(),
    recommendationEligible: z.boolean().default(true),
    sourceMatchStatus: sourceItemMatchStatusSchema.default("matched"),
    isInference: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const validationOptionsSchema = z.object({
  referenceDate: z.coerce.date().default(() => new Date()),
  maxFactAgeDays: z.number().int().positive().default(30),
  minimumConfidence: z.number().min(0).max(1).default(0.7),
  strictRecommendationEligibility: z.boolean().default(true),
});

export const validationContextSchema = z
  .object({
    facts: z.array(validationFactSchema),
    sources: z.array(validationSourceSchema).default([]),
    options: validationOptionsSchema.optional(),
  })
  .strict();

export const validationResultSchema = z
  .object({
    factId: z.string().min(1),
    status: validationStatusSchema,
    reasons: z.array(z.string().min(1)),
    confidence: z.number().min(0).max(1),
    actionRisk: validationActionRiskSchema,
    evidenceStatus: validationEvidenceStatusSchema,
  })
  .strict();

export const validationResultListSchema = z.array(validationResultSchema);
