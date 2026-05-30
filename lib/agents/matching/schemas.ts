import { SourceVisibility } from "@prisma/client";
import { z } from "zod";

const nullableDateSchema = z.date().nullable();

export const sourceMatchStatusSchema = z.enum(["matched", "ambiguous", "unmatched"]);

export const matchingContactSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  fullName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

export const matchingOpportunitySchema = z.object({
  id: z.string(),
  externalId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  accountName: z.string().nullable().optional(),
  accountWebsite: z.string().nullable().optional(),
  name: z.string(),
  ownerName: z.string().nullable().optional(),
  teamNames: z.array(z.string()).default([]),
  stage: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  createdAt: nullableDateSchema.optional(),
  updatedAt: nullableDateSchema.optional(),
  closeDate: nullableDateSchema.optional(),
  contacts: z.array(matchingContactSchema).default([]),
  keywords: z.array(z.string()).default([]),
});

export const matchingSourceMetadataSchema = z
  .object({
    author: z.string().optional(),
    authorEmail: z.string().optional(),
    ownerName: z.string().optional(),
    teamName: z.string().optional(),
    participants: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    matchedText: z.string().optional(),
    linkedRecord: z
      .object({
        type: z.string().optional(),
        externalId: z.string().optional(),
        id: z.string().optional(),
      })
      .passthrough()
      .optional(),
    authorization: z
      .object({
        authorized: z.boolean().optional(),
        scope: z.string().optional(),
      })
      .passthrough()
      .optional(),
    authorized: z.boolean().optional(),
  })
  .passthrough();

export const matchingSourceItemSchema = z.object({
  id: z.string(),
  accountId: z.string().nullable().optional(),
  opportunityId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  visibility: z.nativeEnum(SourceVisibility),
  title: z.string(),
  body: z.string().nullable().optional(),
  occurredAt: nullableDateSchema.optional(),
  ingestedAt: z.date().optional(),
  metadata: matchingSourceMetadataSchema.default({}),
});

export const sourceMatchSchema = z.object({
  sourceItemId: z.string(),
  opportunityId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  status: sourceMatchStatusSchema,
});

export const matchingOptionsSchema = z.object({
  minimumMatchConfidence: z.number().min(0).max(1).default(0.62),
  ambiguityConfidenceDelta: z.number().min(0).max(1).default(0.12),
  oldSourceAgeDays: z.number().int().positive().default(180),
  referenceDate: z.date().optional(),
});
