import { z } from "zod";

import { fieldComparisonSchema } from "../comparison/schemas";
import { validationFactSchema, validationResultSchema } from "../validation/schemas";

export const hygieneDimensionSchema = z.enum([
  "completeness",
  "freshness",
  "consistency",
  "forecast_support",
  "risk_visibility",
  "next_step_clarity",
  "stakeholder_clarity",
  "coordination_readiness",
]);

export const forecastRiskLevelSchema = z.enum(["Low", "Medium", "High", "Critical"]);

export const scoringEvidenceSeveritySchema = z.enum(["positive", "info", "low", "medium", "high", "critical"]);

export const scoringEvidenceSchema = z
  .object({
    dimension: hygieneDimensionSchema,
    severity: scoringEvidenceSeveritySchema,
    message: z.string().min(1),
    crmField: z.string().min(1).optional(),
    currentValue: z.string().nullable().optional(),
    extractedValue: z.string().optional(),
    sourceId: z.string().min(1).optional(),
    factId: z.string().min(1).optional(),
    evidenceText: z.string().min(1).optional(),
    comparisonIssueType: z.string().min(1).optional(),
  })
  .strict();

export const dimensionScoreSchema = z
  .object({
    dimension: hygieneDimensionSchema,
    score: z.number().int().min(0).max(100),
    weight: z.number().positive(),
    explanation: z.string().min(1),
    evidence: z.array(scoringEvidenceSchema),
  })
  .strict();

export const scoringOpportunitySchema = z
  .object({
    id: z.string().optional(),
    stage: z.string().nullable().optional(),
    forecastCategory: z.string().nullable().optional(),
    amount: z.number().nullable().optional(),
    closeDate: z.coerce.date().nullable().optional(),
    ownerName: z.string().nullable().optional(),
  })
  .passthrough();

export const scoringCrmSnapshotSchema = z
  .object({
    id: z.string().optional(),
    fieldName: z.string().min(1),
    value: z.string().nullable().optional(),
    capturedAt: z.coerce.date().optional(),
  })
  .passthrough();

export const scoringContactSchema = z
  .object({
    id: z.string().optional(),
    fullName: z.string().nullable().optional(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    opportunityRole: z.string().nullable().optional(),
    isPrimary: z.boolean().optional(),
  })
  .passthrough();

export const scoringSourceItemSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    occurredAt: z.coerce.date().nullable().optional(),
    ingestedAt: z.coerce.date().optional(),
    visibility: z.string().optional(),
  })
  .passthrough();

export const scoringOptionsSchema = z.object({
  referenceDate: z.coerce.date().default(() => new Date()),
  staleActivityDays: z.number().int().positive().default(14),
  urgentCloseWindowDays: z.number().int().positive().default(7),
  weights: z.partialRecord(hygieneDimensionSchema, z.number().positive()).default({}),
});

export const scoringContextSchema = z
  .object({
    opportunity: scoringOpportunitySchema.optional(),
    crmSnapshot: z.array(scoringCrmSnapshotSchema).default([]),
    contacts: z.array(scoringContactSchema).default([]),
    sourceItems: z.array(scoringSourceItemSchema).default([]),
    facts: z.array(validationFactSchema).default([]),
    validationResults: z.array(validationResultSchema).default([]),
    comparisons: z.array(fieldComparisonSchema).default([]),
    options: scoringOptionsSchema.optional(),
  })
  .strict();

export const hygieneScoreResultSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    riskLevel: forecastRiskLevelSchema,
    riskPoints: z.number().int().min(0),
    dimensions: z.array(dimensionScoreSchema),
    explanation: z.string().min(1),
    evidence: z.array(scoringEvidenceSchema),
  })
  .strict();
