import { z } from "zod";

export const crmProviderSchema = z.literal("hubspot");
export const crmObjectTypeSchema = z.enum(["deals", "companies", "contacts", "notes", "tasks", "owners", "emails"]);
export const crmSyncLogLevelSchema = z.enum(["info", "warning", "error"]);
export const crmSyncErrorCodeSchema = z.enum([
  "AUTH_EXPIRED",
  "RATE_LIMITED",
  "MISSING_PERMISSIONS",
  "API_ERROR",
  "MISSING_FIELD",
  "FIELD_TYPE_MISMATCH",
  "DELETED_RECORD",
  "DUPLICATE_RECORD",
  "PARTIAL_SYNC_FAILURE",
  "READ_ONLY_WRITE_FORBIDDEN",
]);

export const crmRawObjectSchema = z.object({
  id: z.string(),
  properties: z.record(z.string(), z.unknown()).default({}),
  archived: z.boolean().optional(),
  archivedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export const crmPageSchema = z.object({
  results: z.array(crmRawObjectSchema),
  paging: z.object({ next: z.object({ after: z.string() }).optional() }).optional(),
});

export const crmFieldSnapshotSchema = z.object({
  id: z.string(),
  provider: crmProviderSchema,
  objectType: crmObjectTypeSchema,
  objectId: z.string(),
  fieldName: z.string(),
  fieldLabel: z.string().nullable(),
  dataType: z.string().nullable(),
  value: z.string().nullable(),
  capturedAt: z.date(),
});

export const crmOwnerSchema = z.object({
  id: z.string(),
  provider: crmProviderSchema,
  externalId: z.string(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  name: z.string(),
  archived: z.boolean(),
  raw: z.record(z.string(), z.unknown()),
});

export const crmAccountSchema = z.object({
  id: z.string(),
  provider: crmProviderSchema,
  externalId: z.string(),
  name: z.string(),
  website: z.string().nullable(),
  industry: z.string().nullable(),
  ownerExternalId: z.string().nullable(),
  deleted: z.boolean(),
  updatedAt: z.date().nullable(),
  raw: z.record(z.string(), z.unknown()),
});

export const crmContactSchema = z.object({
  id: z.string(),
  provider: crmProviderSchema,
  externalId: z.string(),
  accountExternalId: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  title: z.string().nullable(),
  phone: z.string().nullable(),
  ownerExternalId: z.string().nullable(),
  deleted: z.boolean(),
  updatedAt: z.date().nullable(),
  raw: z.record(z.string(), z.unknown()),
});

export const crmDealSchema = z.object({
  id: z.string(),
  provider: crmProviderSchema,
  externalId: z.string(),
  accountExternalId: z.string().nullable(),
  name: z.string(),
  stage: z.string().nullable(),
  pipeline: z.string().nullable(),
  amount: z.number().nullable(),
  closeDate: z.date().nullable(),
  ownerExternalId: z.string().nullable(),
  deleted: z.boolean(),
  updatedAt: z.date().nullable(),
  raw: z.record(z.string(), z.unknown()),
});

export const crmActivitySchema = z.object({
  id: z.string(),
  provider: crmProviderSchema,
  externalId: z.string(),
  activityType: z.enum(["note", "task", "email"]),
  accountExternalId: z.string().nullable(),
  dealExternalId: z.string().nullable(),
  contactExternalId: z.string().nullable(),
  ownerExternalId: z.string().nullable(),
  title: z.string(),
  body: z.string().nullable(),
  status: z.string().nullable(),
  occurredAt: z.date().nullable(),
  deleted: z.boolean(),
  raw: z.record(z.string(), z.unknown()),
});

export const crmSyncLogSchema = z.object({
  level: crmSyncLogLevelSchema,
  code: crmSyncErrorCodeSchema,
  message: z.string(),
  objectType: crmObjectTypeSchema.optional(),
  recordId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.date(),
});

export const crmSnapshotSchema = z.object({
  provider: crmProviderSchema,
  capturedAt: z.date(),
  readOnly: z.literal(true),
  accounts: z.array(crmAccountSchema),
  contacts: z.array(crmContactSchema),
  deals: z.array(crmDealSchema),
  notes: z.array(crmActivitySchema),
  tasks: z.array(crmActivitySchema),
  emailActivities: z.array(crmActivitySchema),
  owners: z.array(crmOwnerSchema),
  fieldSnapshots: z.array(crmFieldSnapshotSchema),
  logs: z.array(crmSyncLogSchema),
});
