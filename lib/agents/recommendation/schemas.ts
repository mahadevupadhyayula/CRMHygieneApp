import { z } from "zod";

import { fieldComparisonSchema } from "../comparison/schemas";
import { validationFactSchema, validationResultSchema } from "../validation/schemas";

export const recommendationActionTypeSchema = z.enum([
  "update_crm_field",
  "create_task",
  "add_risk_tag",
  "add_note_summary",
  "request_manager_review",
  "assign_internal_owner",
  "draft_internal_message",
  "snooze_reminder",
]);

export const recommendationRiskLevelSchema = z.enum(["low", "medium", "high"]);
export const approvalPolicySchema = z.enum(["none", "draft_only", "standard_approval", "strict_approval", "blocked"]);
export const approvalCardStatusSchema = z.enum(["draft", "ready", "pending_approval", "blocked", "snoozed"]);

export const recommendationEvidenceSchema = z
  .object({
    factId: z.string().min(1),
    sourceId: z.string().min(1),
    sourceTimestamp: z.coerce.date().optional(),
    evidenceText: z.string().min(1),
    crmField: z.string().min(1).optional(),
    issueType: z.string().min(1).optional(),
    validationStatus: z.enum(["valid", "needs_review"]),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const recommendationApprovalLevelSchema = z
  .object({
    level: z.number().int().positive(),
    approverRole: z.string().min(1),
    approverId: z.string().min(1).optional(),
    approverName: z.string().min(1).optional(),
    required: z.boolean().default(true),
  })
  .strict();

export const recommendationCardSchema = z
  .object({
    id: z.string().min(1),
    opportunityId: z.string().min(1).optional(),
    actionType: recommendationActionTypeSchema,
    proposedAction: z.string().min(1),
    crmField: z.string().min(1).optional(),
    currentCrmValue: z.string().nullable(),
    suggestedValue: z.string().nullable(),
    reason: z.string().min(1),
    evidence: z.array(recommendationEvidenceSchema).min(1),
    confidence: z.number().min(0).max(1),
    riskLevel: recommendationRiskLevelSchema,
    requiredApprover: z.string().min(1).nullable(),
    approvalPolicy: approvalPolicySchema,
    approvalLevels: z.array(recommendationApprovalLevelSchema),
    status: approvalCardStatusSchema,
    missingRequiredApprover: z.boolean().default(false),
    duplicateKey: z.string().min(1),
    blockedReason: z.string().min(1).optional(),
    createdFrom: z.enum(["comparison", "risk_finding", "system_gap"]),
  })
  .strict()
  .superRefine((card, ctx) => {
    if (card.evidence.length === 0) {
      ctx.addIssue({ code: "custom", path: ["evidence"], message: "recommendations require evidence" });
    }

    if (card.actionType === "draft_internal_message" && (card.approvalPolicy !== "draft_only" || card.status !== "draft")) {
      ctx.addIssue({ code: "custom", path: ["approvalPolicy"], message: "internal messages must remain draft-only" });
    }

    if (card.riskLevel === "high" && card.approvalPolicy !== "strict_approval" && card.approvalPolicy !== "blocked") {
      ctx.addIssue({ code: "custom", path: ["approvalPolicy"], message: "high-risk recommendations require strict approval or a blocked policy" });
    }
  });

export const existingRecommendationSchema = z
  .object({
    id: z.string().min(1).optional(),
    actionType: recommendationActionTypeSchema.optional(),
    crmField: z.string().min(1).optional(),
    suggestedValue: z.string().nullable().optional(),
    duplicateKey: z.string().min(1).optional(),
    status: z.enum(["draft", "ready", "pending_approval", "blocked", "snoozed", "approved", "rejected", "applied", "dismissed"]).optional(),
  })
  .passthrough();

export const recommendationApproverDirectorySchema = z
  .object({
    manager: z.string().min(1).optional(),
    dealOwner: z.string().min(1).optional(),
    revOps: z.string().min(1).optional(),
    finance: z.string().min(1).optional(),
    legal: z.string().min(1).optional(),
    security: z.string().min(1).optional(),
    procurement: z.string().min(1).optional(),
  })
  .default({});

export const recommendationOptionsSchema = z.object({
  minimumConfidence: z.number().min(0).max(1).default(0.7),
  includeDraftInternalMessages: z.boolean().default(false),
  amountUpdatePolicy: z.enum(["strict_approval", "blocked"]).default("strict_approval"),
  approvers: recommendationApproverDirectorySchema.optional(),
});

export const recommendationContextSchema = z
  .object({
    opportunity: z.object({ id: z.string().optional(), ownerName: z.string().nullable().optional() }).passthrough().optional(),
    comparisons: z.array(fieldComparisonSchema).default([]),
    facts: z.array(validationFactSchema).default([]),
    validationResults: z.array(validationResultSchema).default([]),
    existingRecommendations: z.array(existingRecommendationSchema).default([]),
    snoozedRecommendations: z.array(existingRecommendationSchema).default([]),
    options: recommendationOptionsSchema.optional(),
  })
  .strict();

export const recommendationCardListSchema = z.array(recommendationCardSchema);
