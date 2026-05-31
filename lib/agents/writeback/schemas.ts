import { z } from "zod";

import { approvalActorSchema, approvalAuditEventSchema, approvalRecommendationSchema } from "../approval/schemas";

export const crmFieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const crmFieldDataTypeSchema = z.enum(["string", "number", "boolean", "date", "picklist"]);

export const crmFieldSnapshotSchema = z
  .object({
    value: crmFieldValueSchema,
    dataType: crmFieldDataTypeSchema,
    label: z.string().min(1).optional(),
    updatedAt: z.coerce.date().optional(),
  })
  .strict();

export const simulatedCrmOpportunitySchema = z
  .object({
    id: z.string().min(1),
    fields: z.record(z.string().min(1), crmFieldSnapshotSchema),
    version: z.number().int().nonnegative().default(0),
    sourceCapturedAt: z.coerce.date().optional(),
    updatedAt: z.coerce.date().optional(),
  })
  .strict();

export const simulatedCrmTaskSchema = z
  .object({
    id: z.string().min(1),
    opportunityId: z.string().min(1),
    recommendationId: z.string().min(1),
    subject: z.string().min(1),
    status: z.enum(["open", "completed"]).default("open"),
    ownerId: z.string().min(1).optional(),
    createdAt: z.coerce.date(),
  })
  .strict();

export const simulatedRiskTagSchema = z
  .object({
    id: z.string().min(1),
    opportunityId: z.string().min(1),
    recommendationId: z.string().min(1),
    tag: z.string().min(1),
    createdAt: z.coerce.date(),
  })
  .strict();

export const simulatedNoteSummarySchema = z
  .object({
    id: z.string().min(1),
    opportunityId: z.string().min(1),
    recommendationId: z.string().min(1),
    body: z.string().min(1),
    createdAt: z.coerce.date(),
  })
  .strict();

export const simulatedOwnerAssignmentSchema = z
  .object({
    opportunityId: z.string().min(1),
    ownerId: z.string().min(1),
    recommendationId: z.string().min(1),
    assignedAt: z.coerce.date(),
  })
  .strict();

export const writebackActionSchema = z.enum(["update_crm_field", "create_task", "add_risk_tag", "add_note_summary", "assign_internal_owner"]);
export const writebackAttemptStatusSchema = z.enum(["success", "failed", "duplicate", "rolled_back"]);
export const writebackApprovalRequirementSchema = z.enum(["approval_light", "approval_required", "manager_approval", "disabled_admin_only", "out_of_scope"]);
export const writebackApiErrorCodeSchema = z.enum(["CRM_VALIDATION_ERROR", "FIELD_PERMISSION_DENIED", "API_TIMEOUT", "API_ERROR"]);

export const writebackChangeSchema = z
  .object({
    targetType: z.enum(["opportunity_field", "task", "risk_tag", "note_summary", "owner_assignment"]),
    targetId: z.string().min(1),
    fieldName: z.string().min(1).optional(),
    beforeValue: z.unknown(),
    afterValue: z.unknown(),
  })
  .strict();

export const writebackAttemptSchema = z
  .object({
    id: z.string().min(1),
    idempotencyKey: z.string().min(1),
    recommendationId: z.string().min(1),
    opportunityId: z.string().min(1),
    actorId: z.string().min(1),
    actorRole: z.string().min(1),
    actionType: writebackActionSchema,
    status: writebackAttemptStatusSchema,
    message: z.string().min(1),
    errorCode: z.string().min(1).optional(),
    errorMessage: z.string().min(1).optional(),
    change: writebackChangeSchema.optional(),
    createdAt: z.coerce.date(),
    rolledBackAt: z.coerce.date().optional(),
    rollbackOfAttemptId: z.string().min(1).optional(),
    retryCount: z.number().int().nonnegative().default(0),
    approvalRequirement: writebackApprovalRequirementSchema.optional(),
  })
  .strict();

export const simulatedCrmSnapshotSchema = z
  .object({
    opportunities: z.record(z.string().min(1), simulatedCrmOpportunitySchema),
    tasks: z.array(simulatedCrmTaskSchema).default([]),
    riskTags: z.array(simulatedRiskTagSchema).default([]),
    noteSummaries: z.array(simulatedNoteSummarySchema).default([]),
    ownerAssignments: z.record(z.string().min(1), simulatedOwnerAssignmentSchema).default({}),
    writebackAttempts: z.array(writebackAttemptSchema).default([]),
    auditEvents: z.array(approvalAuditEventSchema).default([]),
  })
  .strict();

export const fieldMappingSchema = z.record(z.string().min(1), z.string());

export const writebackOptionsSchema = z
  .object({
    now: z.coerce.date().optional(),
    idempotencyKey: z.string().min(1).optional(),
    fieldMapping: fieldMappingSchema.default({}),
    expectedOpportunityVersion: z.number().int().nonnegative().optional(),
    staleSourcePolicy: z.enum(["block", "allow"]).default("block"),
    readOnlyMode: z.boolean().default(false),
    amountWritePolicy: z.enum(["disabled", "admin_only"]).default("disabled"),
    enforceCurrentValueMatch: z.boolean().default(true),
    maxRetries: z.number().int().nonnegative().default(1),
    writableFields: z.array(z.string().min(1)).default(["NextStep", "NextStepDueDate__c", "Risk__c", "DecisionMaker__c", "CloseDate", "StageName", "ForecastCategoryName"]),
    deniedFields: z.array(z.string().min(1)).default([]),
    validationFailureRecommendationIds: z.array(z.string().min(1)).default([]),
    timeoutRecommendationIds: z.array(z.string().min(1)).default([]),
    retryableFailureRecommendationIds: z.array(z.string().min(1)).default([]),
    failRecommendationIds: z.array(z.string().min(1)).default([]),
    requireAuditExport: z.boolean().default(false),
    auditExporterAvailable: z.boolean().default(true),
  })
  .strict();

export const executeWritebackInputSchema = z
  .object({
    snapshot: simulatedCrmSnapshotSchema,
    recommendation: approvalRecommendationSchema,
    actor: approvalActorSchema,
    options: writebackOptionsSchema.optional(),
  })
  .strict();

export const rollbackWritebackInputSchema = z
  .object({
    snapshot: simulatedCrmSnapshotSchema,
    attemptId: z.string().min(1),
    actor: approvalActorSchema,
    now: z.coerce.date().optional(),
  })
  .strict();
