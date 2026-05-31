import {
  approvalActorSchema,
  approvalAuditEventSchema,
  approvalFeedbackEventSchema,
  approvalPolicyOptionsSchema,
  approvalRecommendationSchema,
  approvalWorkflowActionSchema,
  approvalWorkflowStatusSchema,
} from "./schemas";
import type { ApprovalActor, ApprovalAuditEvent, ApprovalFeedbackEvent, ApprovalPolicyOptions, ApprovalRecommendation, ApprovalTransitionInput, ApprovalTransitionResult, ApprovalWorkflowAction, ApprovalWorkflowStatus } from "./types";

export * from "./schemas";
export * from "./types";

const FORECAST_FIELDS = new Set(["ForecastCategoryName", "StageName", "CloseDate", "Amount"]);
const TERMINAL_STATUSES = new Set<ApprovalWorkflowStatus>(["rejected", "executed", "failed", "cancelled"]);
const FEEDBACK_ACTIONS = new Set<ApprovalWorkflowAction>(["approve", "edit", "reject", "snooze"]);

export class ApprovalWorkflowError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ApprovalWorkflowError";
  }
}

export function transitionRecommendation(input: ApprovalTransitionInput): ApprovalTransitionResult {
  const actor = approvalActorSchema.parse(input.actor);
  const action = approvalWorkflowActionSchema.parse(input.action);
  const options = approvalPolicyOptionsSchema.parse(input.options ?? {});
  const now = options.now ?? new Date();
  const recommendation = approvalRecommendationSchema.parse(input.recommendation);

  assertVersion(recommendation, options);
  assertRecommendationUsable(recommendation, action, now, options);
  assertActorCanAct(actor);

  const fromStatus = recommendation.status;
  const toStatus = nextStatus(recommendation, action);
  assertTransitionAllowed(recommendation, action, toStatus);
  assertPermission(recommendation, actor, action, options);

  const updated: ApprovalRecommendation = approvalRecommendationSchema.parse({
    ...recommendation,
    status: toStatus,
    editedValue: action === "edit" ? normalizedEditedValue(input.editedValue) : recommendation.editedValue,
    suggestedValue: action === "edit" ? normalizedEditedValue(input.editedValue) : recommendation.suggestedValue,
    rejectionReason: action === "reject" ? normalizedReason(input.rejectionReason, "Rejection reason is required") : recommendation.rejectionReason,
    snoozedUntil: action === "snooze" ? normalizedSnoozeDate(input.snoozedUntil, now) : recommendation.snoozedUntil,
    updatedAt: now,
    version: recommendation.version + 1,
  });

  const auditEvent = buildAuditEvent(updated, actor, action, fromStatus, toStatus, now, input);
  const feedbackEvent = FEEDBACK_ACTIONS.has(action) ? buildFeedbackEvent(updated, actor, action, now, input) : undefined;

  return { recommendation: updated, auditEvent, feedbackEvent };
}

export function visibleRecommendations(recommendations: ApprovalRecommendation[], nowInput: Date | string = new Date()): ApprovalRecommendation[] {
  const now = new Date(nowInput);
  return recommendations.map((item) => approvalRecommendationSchema.parse(item)).filter((item) => item.status !== "snoozed" || (item.snoozedUntil !== undefined && item.snoozedUntil <= now));
}

export function canApproveRecommendation(recommendation: ApprovalRecommendation, actor: ApprovalActor, options?: ApprovalPolicyOptions): boolean {
  try {
    assertActorCanAct(actor);
    assertPermission(approvalRecommendationSchema.parse(recommendation), approvalActorSchema.parse(actor), "approve", approvalPolicyOptionsSchema.parse(options ?? {}));
    return true;
  } catch {
    return false;
  }
}

function assertVersion(recommendation: ApprovalRecommendation, options: ReturnType<typeof approvalPolicyOptionsSchema.parse>): void {
  if (options.expectedVersion !== undefined && recommendation.version !== options.expectedVersion) {
    throw new ApprovalWorkflowError("VERSION_CONFLICT", `Recommendation version ${recommendation.version} does not match expected version ${options.expectedVersion}.`);
  }
}

function assertRecommendationUsable(recommendation: ApprovalRecommendation, action: ApprovalWorkflowAction, now: Date, options: ReturnType<typeof approvalPolicyOptionsSchema.parse>): void {
  if (recommendation.deletedAt) throw new ApprovalWorkflowError("RECOMMENDATION_DELETED", "Deleted recommendations cannot be changed.");
  if (recommendation.evidence.some((item) => !item.available)) throw new ApprovalWorkflowError("EVIDENCE_REMOVED", "Recommendation evidence is no longer available.");
  if (options.staleRecommendationPolicy === "block" && recommendation.staleAt && recommendation.staleAt <= now && action !== "cancel") throw new ApprovalWorkflowError("RECOMMENDATION_STALE", "Stale recommendations require regeneration before approval workflow actions.");
}

function assertActorCanAct(actor: ApprovalActor): void {
  if (actor.role === "readonly") throw new ApprovalWorkflowError("READ_ONLY_ACTOR", "Read-only users cannot perform approval actions.");
  if (actor.role === "auditor") throw new ApprovalWorkflowError("AUDITOR_VIEW_ONLY", "Auditors can view approval history but cannot perform approval actions.");
}

function nextStatus(recommendation: ApprovalRecommendation, action: ApprovalWorkflowAction): ApprovalWorkflowStatus {
  if (action === "approve") return "approved";
  if (action === "edit") return "edited";
  if (action === "reject") return "rejected";
  if (action === "snooze") return "snoozed";
  if (action === "execute") return "executed";
  if (action === "fail") return "failed";
  if (action === "cancel") return "cancelled";
  return recommendation.status;
}

function assertTransitionAllowed(recommendation: ApprovalRecommendation, action: ApprovalWorkflowAction, toStatus: ApprovalWorkflowStatus): void {
  const fromStatus = recommendation.status;
  if (fromStatus === toStatus) throw new ApprovalWorkflowError("DUPLICATE_TRANSITION", `Recommendation is already ${toStatus}.`);
  if (TERMINAL_STATUSES.has(fromStatus)) throw new ApprovalWorkflowError("TERMINAL_STATUS", `Recommendations in ${fromStatus} status cannot transition to ${toStatus}.`);

  const allowed: Record<ApprovalWorkflowAction, ApprovalWorkflowStatus[]> = {
    approve: ["pending", "snoozed"],
    edit: ["pending", "snoozed"],
    reject: ["pending", "snoozed"],
    snooze: ["pending"],
    execute: ["approved", "edited"],
    fail: ["approved", "edited"],
    cancel: ["pending", "approved", "edited", "snoozed"],
  };

  if (!allowed[action].includes(fromStatus)) throw new ApprovalWorkflowError("INVALID_TRANSITION", `Cannot ${action} a recommendation in ${fromStatus} status.`);
}

function assertPermission(recommendation: ApprovalRecommendation, actor: ApprovalActor, action: ApprovalWorkflowAction, options: ReturnType<typeof approvalPolicyOptionsSchema.parse>): void {
  if (action !== "approve" && action !== "edit") return;
  if (actor.role === "manager") return;

  const field = recommendation.crmField;
  if (recommendation.riskLevel === "high") throw new ApprovalWorkflowError("MANAGER_REQUIRED", "High-risk recommendations require a manager approval.");
  if (field && FORECAST_FIELDS.has(field) && actor.role === "ae") throw new ApprovalWorkflowError("FORECAST_APPROVAL_FORBIDDEN", "AEs cannot approve forecast-changing recommendations.");
  if (!field && recommendation.riskLevel === "low" && (actor.role === "ae" || actor.role === "revops")) return;
  if (actor.role === "revops" && field && options.revOpsApprovableFields.includes(field)) return;
  if (actor.role === "ae" && field && options.aeApprovableFields.includes(field)) return;

  throw new ApprovalWorkflowError("APPROVER_LACKS_PERMISSION", `${actor.role} cannot ${action} this recommendation.`);
}

function normalizedEditedValue(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim().length === 0) throw new ApprovalWorkflowError("EDIT_VALUE_REQUIRED", "Edited recommendations require a non-empty suggested value.");
  return value.trim();
}

function normalizedReason(value: string | undefined, message: string): string {
  if (value === undefined || value.trim().length === 0) throw new ApprovalWorkflowError("REJECTION_REASON_REQUIRED", message);
  return value.trim();
}

function normalizedSnoozeDate(value: Date | string | undefined, now: Date): Date {
  if (value === undefined) throw new ApprovalWorkflowError("SNOOZE_DATE_REQUIRED", "Snoozed recommendations require a due date.");
  const due = new Date(value);
  if (Number.isNaN(due.valueOf()) || due <= now) throw new ApprovalWorkflowError("INVALID_SNOOZE_DATE", "Snooze date must be a valid future date.");
  return due;
}

function buildAuditEvent(recommendation: ApprovalRecommendation, actor: ApprovalActor, action: ApprovalWorkflowAction, fromStatus: ApprovalWorkflowStatus, toStatus: ApprovalWorkflowStatus, now: Date, input: ApprovalTransitionInput): ApprovalAuditEvent {
  return approvalAuditEventSchema.parse({
    id: stableEventId("audit", recommendation.id, recommendation.version),
    recommendationId: recommendation.id,
    opportunityId: recommendation.opportunityId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    fromStatus,
    toStatus,
    message: `${actor.role} ${action} transitioned recommendation ${recommendation.id} from ${fromStatus} to ${toStatus}.`,
    metadata: {
      crmField: recommendation.crmField,
      currentValue: recommendation.currentValue,
      suggestedValue: recommendation.suggestedValue,
      editedValue: recommendation.editedValue,
      rejectionReason: recommendation.rejectionReason,
      snoozedUntil: recommendation.snoozedUntil?.toISOString(),
      failureReason: input.failureReason,
      cancelReason: input.cancelReason,
    },
    createdAt: now,
  });
}

function buildFeedbackEvent(recommendation: ApprovalRecommendation, actor: ApprovalActor, action: ApprovalWorkflowAction, now: Date, input: ApprovalTransitionInput): ApprovalFeedbackEvent {
  const signal = action === "approve" ? "approved" : action === "edit" ? "edited" : action === "reject" ? "rejected" : "snoozed";
  return approvalFeedbackEventSchema.parse({
    id: stableEventId("feedback", recommendation.id, recommendation.version),
    recommendationId: recommendation.id,
    opportunityId: recommendation.opportunityId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    signal,
    comment: input.comment ?? input.rejectionReason,
    createdAt: now,
  });
}

function stableEventId(prefix: string, recommendationId: string, version: number): string {
  return `${prefix}-${recommendationId}-${version}`;
}
