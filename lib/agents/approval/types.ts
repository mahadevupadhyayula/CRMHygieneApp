import type { z } from "zod";

import type {
  approvalActorRoleSchema,
  approvalActorSchema,
  approvalAuditEventSchema,
  approvalEvidenceSchema,
  approvalFeedbackEventSchema,
  approvalPolicyOptionsSchema,
  approvalRecommendationSchema,
  approvalWorkflowActionSchema,
  approvalWorkflowStatusSchema,
} from "./schemas";

export type ApprovalWorkflowStatus = z.infer<typeof approvalWorkflowStatusSchema>;
export type ApprovalWorkflowAction = z.infer<typeof approvalWorkflowActionSchema>;
export type ApprovalActorRole = z.infer<typeof approvalActorRoleSchema>;
export type ApprovalActor = z.infer<typeof approvalActorSchema>;
export type ApprovalEvidence = z.infer<typeof approvalEvidenceSchema>;
export type ApprovalRecommendation = z.infer<typeof approvalRecommendationSchema>;
export type ApprovalAuditEvent = z.infer<typeof approvalAuditEventSchema>;
export type ApprovalFeedbackEvent = z.infer<typeof approvalFeedbackEventSchema>;
export type ApprovalPolicyOptions = z.input<typeof approvalPolicyOptionsSchema>;

export type ApprovalTransitionInput = {
  recommendation: ApprovalRecommendation;
  actor: ApprovalActor;
  action: ApprovalWorkflowAction;
  editedValue?: string | null;
  rejectionReason?: string;
  snoozedUntil?: Date | string;
  failureReason?: string;
  cancelReason?: string;
  comment?: string;
  options?: ApprovalPolicyOptions;
};

export type ApprovalTransitionResult = {
  recommendation: ApprovalRecommendation;
  auditEvent: ApprovalAuditEvent;
  feedbackEvent?: ApprovalFeedbackEvent;
};
