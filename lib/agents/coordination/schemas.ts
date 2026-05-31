import { z } from "zod";

import { fieldComparisonSchema } from "../comparison/schemas";
import { validationFactSchema, validationResultSchema } from "../validation/schemas";

export const coordinationActionTypeSchema = z.enum([
  "assign_se_task",
  "notify_legal_owner",
  "assign_security_task",
  "assign_deal_desk_task",
  "assign_ae_multithread_task",
  "create_follow_up_task",
  "request_manager_review",
  "draft_customer_follow_up",
]);

export const coordinationOwnerRoleSchema = z.enum([
  "sales_engineer",
  "legal",
  "security",
  "deal_desk",
  "finance",
  "account_executive",
  "manager",
  "opportunity_owner",
]);

export const coordinationActionStatusSchema = z.enum(["draft", "ready", "requires_review", "blocked"]);

export const coordinationEvidenceSchema = z
  .object({
    factId: z.string().min(1),
    sourceId: z.string().min(1),
    sourceTimestamp: z.coerce.date().optional(),
    evidenceText: z.string().min(1),
    crmField: z.string().min(1).optional(),
    trigger: z.string().min(1),
    confidence: z.number().min(0).max(1),
    sensitive: z.boolean().default(false),
  })
  .strict();

export const coordinationActionSchema = z
  .object({
    id: z.string().min(1),
    opportunityId: z.string().min(1).optional(),
    type: coordinationActionTypeSchema,
    ownerRole: coordinationOwnerRoleSchema,
    suggestedOwner: z.string().min(1).nullable(),
    draftMessage: z.string().min(1),
    evidence: z.array(coordinationEvidenceSchema).min(1),
    approvalRequired: z.boolean(),
    status: coordinationActionStatusSchema,
    duplicateKey: z.string().min(1),
    blockedReason: z.string().min(1).optional(),
    customerFacing: z.boolean().default(false),
  })
  .strict()
  .superRefine((action, ctx) => {
    if (action.customerFacing && action.status !== "draft") {
      ctx.addIssue({ code: "custom", path: ["status"], message: "customer-facing coordination messages must remain draft-only" });
    }

    if (action.customerFacing && !action.approvalRequired) {
      ctx.addIssue({ code: "custom", path: ["approvalRequired"], message: "customer-facing drafts require approval before sending" });
    }
  });

export const existingCoordinationActionSchema = z
  .object({
    id: z.string().min(1).optional(),
    type: coordinationActionTypeSchema.optional(),
    ownerRole: coordinationOwnerRoleSchema.optional(),
    duplicateKey: z.string().min(1).optional(),
    status: z.enum(["draft", "ready", "requires_review", "blocked", "completed", "dismissed"]).optional(),
  })
  .passthrough();

export const coordinationOwnerDirectorySchema = z
  .object({
    sales_engineer: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
    legal: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
    security: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
    deal_desk: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
    finance: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
    account_executive: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
    manager: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
    opportunity_owner: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  })
  .default({});

export const coordinationOptionsSchema = z.object({
  minimumConfidence: z.number().min(0).max(1).default(0.7),
  requireInternalMessageReview: z.boolean().default(false),
  owners: coordinationOwnerDirectorySchema.optional(),
});

export const coordinationContextSchema = z
  .object({
    opportunity: z
      .object({
        id: z.string().optional(),
        ownerName: z.string().nullable().optional(),
        managerName: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
    facts: z.array(validationFactSchema).default([]),
    comparisons: z.array(fieldComparisonSchema).default([]),
    validationResults: z.array(validationResultSchema).default([]),
    existingActions: z.array(existingCoordinationActionSchema).default([]),
    existingTasks: z.array(existingCoordinationActionSchema).default([]),
    options: coordinationOptionsSchema.optional(),
  })
  .strict();

export const coordinationActionListSchema = z.array(coordinationActionSchema);
