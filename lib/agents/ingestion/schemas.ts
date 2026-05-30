import { ForecastCategory, OpportunityStage, SourceType, SourceVisibility } from "@prisma/client";
import { z } from "zod";

export const ingestionWarningSeveritySchema = z.enum(["info", "warning", "error"]);

export const ingestionWarningCodeSchema = z.enum([
  "MISSING_OPPORTUNITY",
  "MISSING_ACCOUNT",
  "MISSING_CRM_SNAPSHOT",
  "MISSING_CONTACTS",
  "MISSING_AUTHORIZED_SOURCE_ITEMS",
  "MISSING_SOURCE_TIMESTAMP",
  "MISSING_SOURCE_AUTHOR_METADATA",
  "UNSUPPORTED_SOURCE_METADATA",
  "INCOMPLETE_SOURCE_METADATA",
  "UNPARSABLE_SOURCE_METADATA",
  "PRIVATE_SOURCE_EXCLUDED",
  "UNAUTHORIZED_SOURCE_EXCLUDED",
  "DUPLICATE_SOURCE_SUPPRESSED",
]);

export const ingestionWarningSchema = z.object({
  code: ingestionWarningCodeSchema,
  severity: ingestionWarningSeveritySchema,
  message: z.string(),
  recordIds: z.array(z.string()).default([]),
  details: z.record(z.string(), z.unknown()).optional(),
});

const dateSchema = z.date();
const nullableDateSchema = z.date().nullable();

export const sourceMetadataSchema = z
  .object({
    author: z.string().optional(),
    externalId: z.string().optional(),
    sourceSystem: z.string().optional(),
    linkedRecord: z
      .object({
        type: z.string().optional(),
        externalId: z.string().optional(),
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
    authorizationScope: z.string().optional(),
    duplicateOf: z.string().optional(),
    matchedText: z.string().optional(),
  })
  .passthrough();

export const accountContextSchema = z.object({
  id: z.string(),
  externalId: z.string().nullable(),
  name: z.string(),
  website: z.string().nullable(),
  industry: z.string().nullable(),
  segment: z.string().nullable(),
  ownerName: z.string().nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const opportunityContextSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  externalId: z.string().nullable(),
  name: z.string(),
  stage: z.nativeEnum(OpportunityStage),
  forecastCategory: z.nativeEnum(ForecastCategory),
  amount: z.number().nullable(),
  closeDate: nullableDateSchema,
  ownerName: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const contactContextSchema = z.object({
  id: z.string(),
  accountId: z.string().nullable(),
  externalId: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  title: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  opportunityRole: z.string().nullable(),
  isPrimary: z.boolean(),
});

export const crmSnapshotContextSchema = z.object({
  id: z.string(),
  opportunityId: z.string(),
  fieldName: z.string(),
  fieldLabel: z.string().nullable(),
  dataType: z.string().nullable(),
  value: z.string().nullable(),
  sourceSystem: z.string(),
  capturedAt: dateSchema,
});

export const sourceItemContextSchema = z.object({
  id: z.string(),
  accountId: z.string().nullable(),
  opportunityId: z.string(),
  contactId: z.string().nullable(),
  type: z.nativeEnum(SourceType),
  visibility: z.nativeEnum(SourceVisibility),
  title: z.string(),
  uri: z.string().nullable(),
  body: z.string().nullable(),
  occurredAt: nullableDateSchema,
  ingestedAt: dateSchema,
  metadata: sourceMetadataSchema,
});

export const activityHistoryItemSchema = z.object({
  id: z.string(),
  sourceItemId: z.string(),
  type: z.nativeEnum(SourceType),
  title: z.string(),
  occurredAt: nullableDateSchema,
  ingestedAt: dateSchema,
  author: z.string().nullable(),
  contactId: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  visibility: z.nativeEnum(SourceVisibility),
});

export const ingestionMetadataSchema = z.object({
  opportunityId: z.string(),
  generatedAt: dateSchema,
  sourceItemCount: z.number().int().nonnegative(),
  excludedSourceItemCount: z.number().int().nonnegative(),
  duplicateSourceItemCount: z.number().int().nonnegative(),
});

export const dealContextPackageSchema = z.object({
  opportunity: opportunityContextSchema,
  account: accountContextSchema,
  contacts: z.array(contactContextSchema),
  crmSnapshot: z.array(crmSnapshotContextSchema),
  sourceItems: z.array(sourceItemContextSchema),
  activityHistory: z.array(activityHistoryItemSchema),
  metadata: ingestionMetadataSchema,
  warnings: z.array(ingestionWarningSchema),
});
