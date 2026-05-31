import { z } from "zod";

export const approvalWorkflowStatusSchema = z.enum(["pending", "approved", "edited", "rejected", "snoozed", "executed", "failed", "cancelled"]);
export const approvalWorkflowActionSchema = z.enum(["approve", "edit", "reject", "snooze", "execute", "fail", "cancel"]);
export const approvalActorRoleSchema = z.enum(["ae", "manager", "revops", "readonly", "auditor"]);
export const approvalFeedbackSignalSchema = z.enum(["approved", "edited", "rejected", "snoozed"]);

export const approvalActorSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    role: approvalActorRoleSchema,
  })
  .strict();

export const approvalEvidenceSchema = z
  .object({
    sourceId: z.string().min(1),
    factId: z.string().min(1).optional(),
    evidenceText: z.string().min(1).optional(),
    available: z.boolean().default(true),
  })
  .strict();

export const approvalRecommendationSchema = z
  .object({
    id: z.string().min(1),
    opportunityId: z.string().min(1),
    actionType: z.string().min(1),
    crmField: z.string().min(1).optional(),
    riskLevel: z.enum(["low", "medium", "high"]),
    status: approvalWorkflowStatusSchema.default("pending"),
    currentValue: z.string().nullable().optional(),
    suggestedValue: z.string().nullable().optional(),
    editedValue: z.string().nullable().optional(),
    rejectionReason: z.string().min(1).optional(),
    snoozedUntil: z.coerce.date().optional(),
    evidence: z.array(approvalEvidenceSchema).min(1),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    staleAt: z.coerce.date().optional(),
    deletedAt: z.coerce.date().optional(),
    version: z.number().int().nonnegative().default(0),
  })
  .strict();

export const approvalAuditEventSchema = z
  .object({
    id: z.string().min(1),
    recommendationId: z.string().min(1),
    opportunityId: z.string().min(1),
    actorId: z.string().min(1),
    actorName: z.string().min(1).optional(),
    actorRole: approvalActorRoleSchema,
    action: approvalWorkflowActionSchema,
    fromStatus: approvalWorkflowStatusSchema,
    toStatus: approvalWorkflowStatusSchema,
    message: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdAt: z.coerce.date(),
  })
  .strict();

export const approvalFeedbackEventSchema = z
  .object({
    id: z.string().min(1),
    recommendationId: z.string().min(1),
    opportunityId: z.string().min(1),
    actorId: z.string().min(1),
    actorName: z.string().min(1).optional(),
    actorRole: approvalActorRoleSchema,
    signal: approvalFeedbackSignalSchema,
    comment: z.string().min(1).optional(),
    createdAt: z.coerce.date(),
  })
  .strict();

export const approvalPolicyOptionsSchema = z
  .object({
    now: z.coerce.date().optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
    revOpsApprovableFields: z.array(z.string().min(1)).default(["NextStep", "NextStepDueDate__c", "Risk__c", "DecisionMaker__c", "ProcurementStatus__c", "LegalStatus__c", "SecurityStatus__c", "OwnerName"]),
    aeApprovableFields: z.array(z.string().min(1)).default(["NextStep", "NextStepDueDate__c"]),
    staleRecommendationPolicy: z.enum(["block", "allow"]).default("block"),
  })
  .strict();
