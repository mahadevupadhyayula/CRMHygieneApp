import { z } from "zod";

const nullableDateSchema = z.date().nullable();

export const entityTypeSchema = z.enum([
  "account",
  "opportunity",
  "contact",
  "role",
  "internal owner",
  "competitor",
  "product/module",
  "document",
  "date",
  "amount",
  "risk keyword",
]);

export const resolvedEntitySchema = z.object({
  entityType: entityTypeSchema,
  rawText: z.string().min(1),
  normalizedValue: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sourceItemId: z.string().min(1),
  evidenceText: z.string().min(1),
});

export const entityResolutionContactSchema = z
  .object({
    id: z.string(),
    externalId: z.string().nullable().optional(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    fullName: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    opportunityRole: z.string().nullable().optional(),
    isPrimary: z.boolean().optional(),
  })
  .passthrough();

export const entityResolutionAccountSchema = z
  .object({
    id: z.string().optional(),
    externalId: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
  })
  .passthrough();

export const entityResolutionOpportunitySchema = z
  .object({
    id: z.string().optional(),
    externalId: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    closeDate: nullableDateSchema.optional(),
    amount: z.number().nullable().optional(),
    ownerName: z.string().nullable().optional(),
  })
  .passthrough();

export const entityResolutionSourceItemSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    occurredAt: nullableDateSchema.optional(),
    ingestedAt: z.date().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const entityResolutionContextSchema = z
  .object({
    account: entityResolutionAccountSchema.optional(),
    opportunity: entityResolutionOpportunitySchema.optional(),
    contacts: z.array(entityResolutionContactSchema).default([]),
    sourceItems: z.array(entityResolutionSourceItemSchema).default([]),
  })
  .passthrough();

export const entityResolutionOptionsSchema = z.object({
  referenceDate: z.date().optional(),
});

export const resolvedEntityListSchema = z.array(resolvedEntitySchema);
