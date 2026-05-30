import { z } from "zod";

export const extractedFactTypeSchema = z.enum([
  "next_step",
  "next_step_owner",
  "next_step_due_date",
  "decision_maker",
  "approver",
  "champion",
  "risk",
  "risk_severity",
  "timeline_signal",
  "close_date_risk",
  "stage_signal",
  "forecast_signal",
  "procurement_status",
  "legal_status",
  "security_status",
  "internal_owner_needed",
]);

export const extractionConfidenceBandSchema = z.enum(["low", "medium", "high"]);

export const sourceItemMatchStatusSchema = z.enum(["matched", "ambiguous", "unmatched"]);

export const crmFieldMappingSchema = z
  .object({
    objectName: z.string().min(1),
    fieldName: z.string().min(1),
    fieldLabel: z.string().min(1).optional(),
    confidence: z.number().min(0).max(1).default(1),
  })
  .strict();

export const extractedFactSchema = z
  .object({
    factType: extractedFactTypeSchema,
    rawValue: z.string().min(1),
    normalizedValue: z.string().min(1),
    evidenceText: z.string().min(1),
    sourceId: z.string().min(1),
    sourceTimestamp: z.coerce.date(),
    confidence: z.number().min(0).max(1),
    confidenceBand: extractionConfidenceBandSchema,
    suggestedCrmFieldMapping: crmFieldMappingSchema,
    recommendationEligible: z.boolean().default(true),
    sourceMatchStatus: sourceItemMatchStatusSchema.default("matched"),
  })
  .strict()
  .superRefine((fact, ctx) => {
    const expectedBand = fact.confidence < 0.5 ? "low" : fact.confidence < 0.75 ? "medium" : "high";
    if (fact.confidenceBand !== expectedBand) {
      ctx.addIssue({
        code: "custom",
        path: ["confidenceBand"],
        message: `confidenceBand must be ${expectedBand} for confidence ${fact.confidence}`,
      });
    }

    if (fact.confidenceBand === "low" && fact.recommendationEligible) {
      ctx.addIssue({
        code: "custom",
        path: ["recommendationEligible"],
        message: "low-confidence facts are not recommendation-eligible by default",
      });
    }

    if (fact.sourceMatchStatus !== "matched" && fact.recommendationEligible) {
      ctx.addIssue({
        code: "custom",
        path: ["recommendationEligible"],
        message: "ambiguous or unmatched source items are not recommendation-eligible by default",
      });
    }
  });

export const extractedFactListSchema = z.array(extractedFactSchema);

const nullableDateSchema = z.coerce.date().nullable();

export const extractionSourceItemSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    occurredAt: nullableDateSchema.optional(),
    ingestedAt: z.coerce.date().optional(),
    matchStatus: sourceItemMatchStatusSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const extractionContactSchema = z
  .object({
    id: z.string().optional(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    fullName: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    opportunityRole: z.string().nullable().optional(),
    isPrimary: z.boolean().optional(),
  })
  .passthrough();

export const extractionOpportunitySchema = z
  .object({
    id: z.string().optional(),
    name: z.string().nullable().optional(),
    stage: z.string().nullable().optional(),
    forecastCategory: z.string().nullable().optional(),
    closeDate: nullableDateSchema.optional(),
    ownerName: z.string().nullable().optional(),
  })
  .passthrough();

export const extractionContextSchema = z
  .object({
    opportunity: extractionOpportunitySchema.optional(),
    contacts: z.array(extractionContactSchema).default([]),
    sourceItems: z.array(extractionSourceItemSchema).default([]),
  })
  .passthrough();
