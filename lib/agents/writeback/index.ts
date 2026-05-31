import {
  executeWritebackInputSchema,
  rollbackWritebackInputSchema,
  simulatedCrmSnapshotSchema,
  writebackAttemptSchema,
  writebackOptionsSchema,
} from "./schemas";
import type { CrmFieldDataType, CrmFieldValue, SimulatedCrmSnapshot, WritebackApiErrorCode, WritebackApprovalRequirement, WritebackAttempt, WritebackChange, WritebackResult } from "./types";
import { approvalAuditEventSchema, type ApprovalActor, type ApprovalAuditEvent, type ApprovalRecommendation } from "../approval";

export * from "./schemas";
export * from "./types";

const SUPPORTED_ACTIONS = new Set(["update_crm_field", "create_task", "add_risk_tag", "add_note_summary", "assign_internal_owner"]);
const FORECAST_FIELDS = new Set(["ForecastCategoryName", "StageName", "CloseDate", "Amount"]);
const STAGE_FORECAST_FIELDS = new Set(["ForecastCategoryName", "StageName"]);
const OUT_OF_SCOPE_TERMINAL_VALUES = new Set(["closed won", "closedwon", "closed-won", "closed lost", "closedlost", "closed-lost"]);

type ParsedOptions = ReturnType<typeof writebackOptionsSchema.parse>;

export class WritebackError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "WritebackError";
  }
}

export function executeWriteback(input: unknown): WritebackResult {
  const parsed = executeWritebackInputSchema.parse(input);
  const options = writebackOptionsSchema.parse(parsed.options ?? {});
  const now = options.now ?? new Date();
  let snapshot = cloneSnapshot(parsed.snapshot);

  try {
    assertWritable(parsed.recommendation, parsed.actor, options, now);

    const duplicate = findSuccessfulDuplicate(snapshot, options.idempotencyKey ?? defaultIdempotencyKey(parsed.recommendation));
    if (duplicate) {
      const attempt = appendAttempt(snapshot, {
        id: stableAttemptId("duplicate", parsed.recommendation.id, snapshot.writebackAttempts.length + 1),
        idempotencyKey: duplicate.idempotencyKey,
        recommendationId: parsed.recommendation.id,
        opportunityId: parsed.recommendation.opportunityId,
        actorId: parsed.actor.id,
        actorRole: parsed.actor.role,
        actionType: parsed.recommendation.actionType as WritebackAttempt["actionType"],
        status: "duplicate",
        message: `Duplicate writeback skipped for recommendation ${parsed.recommendation.id}.`,
        change: duplicate.change,
        createdAt: now,
        retryCount: 0,
        approvalRequirement: approvalRequirementFor(parsed.recommendation),
      });
      const auditEvent = appendAuditEvent(snapshot, parsed.recommendation, parsed.actor, "execute", "approved", "executed", now, attempt.message, { writebackAttemptId: attempt.id, duplicateOfAttemptId: duplicate.id });
      return { snapshot, attempt, auditEvent };
    }

    const apiCheck = simulateAdapterPreflight(snapshot, parsed.recommendation, options);
    if (!apiCheck.success) throw new WritebackError(apiCheck.code, apiCheck.message);

    const change = applyAction(snapshot, parsed.recommendation, options, now);
    const attempt = appendAttempt(snapshot, {
      id: stableAttemptId("writeback", parsed.recommendation.id, snapshot.writebackAttempts.length + 1),
      idempotencyKey: options.idempotencyKey ?? defaultIdempotencyKey(parsed.recommendation),
      recommendationId: parsed.recommendation.id,
      opportunityId: parsed.recommendation.opportunityId,
      actorId: parsed.actor.id,
      actorRole: parsed.actor.role,
      actionType: parsed.recommendation.actionType as WritebackAttempt["actionType"],
      status: "success",
      message: `Live ${parsed.recommendation.actionType} writeback succeeded for recommendation ${parsed.recommendation.id}.`,
      change,
      createdAt: now,
      retryCount: apiCheck.retryCount,
      approvalRequirement: approvalRequirementFor(parsed.recommendation),
    });
    const auditEvent = appendAuditEvent(snapshot, parsed.recommendation, parsed.actor, "execute", "approved", "executed", now, attempt.message, { writebackAttemptId: attempt.id, approvalRequirement: attempt.approvalRequirement, beforeValue: change.beforeValue, afterValue: change.afterValue, change });
    return { snapshot, attempt, auditEvent };
  } catch (error) {
    const writebackError = normalizeError(error);
    const attempt = appendAttempt(snapshot, {
      id: stableAttemptId("failed", parsed.recommendation.id, snapshot.writebackAttempts.length + 1),
      idempotencyKey: options.idempotencyKey ?? defaultIdempotencyKey(parsed.recommendation),
      recommendationId: parsed.recommendation.id,
      opportunityId: parsed.recommendation.opportunityId,
      actorId: parsed.actor.id,
      actorRole: parsed.actor.role,
      actionType: SUPPORTED_ACTIONS.has(parsed.recommendation.actionType) ? (parsed.recommendation.actionType as WritebackAttempt["actionType"]) : "update_crm_field",
      status: "failed",
      message: `Simulated writeback failed for recommendation ${parsed.recommendation.id}.`,
      errorCode: writebackError.code,
      errorMessage: writebackError.message,
      createdAt: now,
      retryCount: attemptedRetryCount(parsed.recommendation, options),
      approvalRequirement: approvalRequirementFor(parsed.recommendation),
    });
    const auditEvent = appendAuditEvent(snapshot, parsed.recommendation, parsed.actor, "fail", parsed.recommendation.status, "failed", now, writebackError.message, { writebackAttemptId: attempt.id, errorCode: writebackError.code });
    return { snapshot, attempt, auditEvent };
  }
}


export function exportWritebackAuditEvents(snapshotInput: SimulatedCrmSnapshot): ApprovalAuditEvent[] {
  const snapshot = cloneSnapshot(snapshotInput);
  return snapshot.auditEvents.map((event) => approvalAuditEventSchema.parse(event));
}

export function rollbackWriteback(input: unknown): WritebackResult {
  const parsed = rollbackWritebackInputSchema.parse(input);
  const now = parsed.now ?? new Date();
  const snapshot = cloneSnapshot(parsed.snapshot);
  const original = snapshot.writebackAttempts.find((attempt) => attempt.id === parsed.attemptId);

  if (!original) throw new WritebackError("ATTEMPT_NOT_FOUND", `Writeback attempt ${parsed.attemptId} was not found.`);
  if (original.status !== "success" || !original.change) throw new WritebackError("ATTEMPT_NOT_ROLLBACKABLE", `Writeback attempt ${parsed.attemptId} cannot be rolled back.`);
  if (snapshot.writebackAttempts.some((attempt) => attempt.rollbackOfAttemptId === original.id && attempt.status === "rolled_back")) {
    throw new WritebackError("ROLLBACK_ALREADY_APPLIED", `Writeback attempt ${parsed.attemptId} has already been rolled back.`);
  }

  applyRollback(snapshot, original.change, now, original.recommendationId);
  const attempt = appendAttempt(snapshot, {
    id: stableAttemptId("rollback", original.recommendationId, snapshot.writebackAttempts.length + 1),
    idempotencyKey: `rollback:${original.id}`,
    recommendationId: original.recommendationId,
    opportunityId: original.opportunityId,
    actorId: parsed.actor.id,
    actorRole: parsed.actor.role,
    actionType: original.actionType,
    status: "rolled_back",
    message: `Rolled back simulated writeback attempt ${original.id}.`,
    change: {
      ...original.change,
      beforeValue: original.change.afterValue,
      afterValue: original.change.beforeValue,
    },
    createdAt: now,
    rolledBackAt: now,
    rollbackOfAttemptId: original.id,
    retryCount: 0,
    approvalRequirement: original.approvalRequirement,
  });
  const auditEvent = approvalAuditEventSchema.parse({
    id: `audit-${attempt.id}`,
    recommendationId: original.recommendationId,
    opportunityId: original.opportunityId,
    actorId: parsed.actor.id,
    actorName: parsed.actor.name,
    actorRole: parsed.actor.role,
    action: "cancel",
    fromStatus: "executed",
    toStatus: "cancelled",
    message: attempt.message,
    metadata: { writebackAttemptId: attempt.id, rollbackOfAttemptId: original.id, change: attempt.change },
    createdAt: now,
  });
  snapshot.auditEvents.push(auditEvent);
  return { snapshot, attempt, auditEvent };
}

function assertWritable(recommendation: ApprovalRecommendation, actor: ApprovalActor, options: ParsedOptions, now: Date): void {
  if (options.readOnlyMode) throw new WritebackError("READ_ONLY_WRITE_FORBIDDEN", "Read-only mode blocks all CRM writebacks.");
  if (options.requireAuditExport && !options.auditExporterAvailable) throw new WritebackError("AUDIT_EXPORT_REQUIRED", "Audit export must be available before live writeback.");
  if (recommendation.status !== "approved") throw new WritebackError("RECOMMENDATION_NOT_APPROVED", "Only approved recommendations may be written to the CRM.");
  if (recommendation.deletedAt) throw new WritebackError("RECOMMENDATION_DELETED", "Deleted recommendations cannot be written back.");
  if (recommendation.staleAt && recommendation.staleAt <= now && options.staleSourcePolicy === "block") throw new WritebackError("SOURCE_STALE", "Writeback is blocked because the source recommendation is stale.");
  if (!SUPPORTED_ACTIONS.has(recommendation.actionType)) throw new WritebackError("UNSUPPORTED_ACTION", `Action ${recommendation.actionType} is not supported by live writeback.`);

  const requirement = approvalRequirementFor(recommendation);
  if (requirement === "out_of_scope") throw new WritebackError("CLOSED_WON_LOST_OUT_OF_SCOPE", "Closed-won/lost transitions are out of scope for live writeback.");
  if (recommendation.riskLevel === "high" && actor.role !== "manager") throw new WritebackError("HIGH_RISK_MANAGER_REQUIRED", "High-risk writebacks require manager approval and manager execution.");
  if (recommendation.crmField === "Amount" && options.amountWritePolicy === "disabled") throw new WritebackError("AMOUNT_WRITEBACK_DISABLED", "Amount changes are disabled unless a future admin-only path is explicitly configured.");
  if (recommendation.crmField === "Amount" && options.amountWritePolicy === "admin_only" && actor.role !== "manager") throw new WritebackError("AMOUNT_WRITEBACK_ADMIN_ONLY", "Amount changes require a strict admin-only executor.");
  if (requirement === "manager_approval" && actor.role !== "manager") throw new WritebackError("HIGH_RISK_MANAGER_REQUIRED", "High-risk writebacks require manager approval and manager execution.");
  if (STAGE_FORECAST_FIELDS.has(recommendation.crmField ?? "") && actor.role === "ae") throw new WritebackError("FORECAST_PERMISSION_DENIED", "AEs cannot write stage or forecast recommendations.");
}

function applyAction(snapshot: SimulatedCrmSnapshot, recommendation: ApprovalRecommendation, options: ParsedOptions, now: Date): WritebackChange {
  const opportunity = snapshot.opportunities[recommendation.opportunityId];
  if (!opportunity) throw new WritebackError("OPPORTUNITY_NOT_FOUND", `Opportunity ${recommendation.opportunityId} was not found in the CRM snapshot.`);
  if (options.expectedOpportunityVersion !== undefined && opportunity.version !== options.expectedOpportunityVersion) throw new WritebackError("VERSION_CONFLICT", `Opportunity version ${opportunity.version} does not match expected version ${options.expectedOpportunityVersion}.`);

  switch (recommendation.actionType) {
    case "update_crm_field":
      return applyFieldUpdate(snapshot, recommendation, options, now);
    case "create_task":
      return applyTaskCreate(snapshot, recommendation, now);
    case "add_risk_tag":
      return applyRiskTag(snapshot, recommendation, now);
    case "add_note_summary":
      return applyNoteSummary(snapshot, recommendation, now);
    case "assign_internal_owner":
      return applyOwnerAssignment(snapshot, recommendation, now);
    default:
      throw new WritebackError("UNSUPPORTED_ACTION", `Action ${recommendation.actionType} is not supported by simulated writeback.`);
  }
}

function applyFieldUpdate(snapshot: SimulatedCrmSnapshot, recommendation: ApprovalRecommendation, options: ParsedOptions, now: Date): WritebackChange {
  const opportunity = snapshot.opportunities[recommendation.opportunityId];
  const fieldName = mapField(recommendation, options);
  const field = opportunity.fields[fieldName];
  if (!field) throw new WritebackError("CRM_FIELD_MISSING", `CRM field ${fieldName} is missing from opportunity ${recommendation.opportunityId}.`);
  if (options.deniedFields.includes(fieldName)) throw new WritebackError("FIELD_PERMISSION_DENIED", `CRM field-level permissions deny writes to ${fieldName}.`);
  if (!options.writableFields.includes(fieldName) && fieldName !== "Amount") throw new WritebackError("FIELD_PERMISSION_DENIED", `CRM field ${fieldName} is not in the writeback allowlist.`);
  const beforeValue = field.value;
  if (options.enforceCurrentValueMatch && recommendation.currentValue !== undefined && recommendation.currentValue !== null && String(beforeValue) !== recommendation.currentValue) {
    throw new WritebackError("WRITEBACK_CONFLICT", `CRM value for ${fieldName} changed after approval.`);
  }
  const afterValue = coerceValue(recommendation.suggestedValue, field.dataType, fieldName);

  opportunity.fields[fieldName] = { ...field, value: afterValue, updatedAt: now };
  opportunity.version += 1;
  opportunity.updatedAt = now;

  return { targetType: "opportunity_field", targetId: recommendation.opportunityId, fieldName, beforeValue, afterValue };
}

function applyTaskCreate(snapshot: SimulatedCrmSnapshot, recommendation: ApprovalRecommendation, now: Date): WritebackChange {
  const subject = requireSuggestedValue(recommendation, "Task subject is required.");
  const existing = snapshot.tasks.find((task) => task.opportunityId === recommendation.opportunityId && task.recommendationId === recommendation.id && task.subject === subject);
  if (existing) return { targetType: "task", targetId: existing.id, beforeValue: null, afterValue: existing };

  const task = { id: `task-${recommendation.id}`, opportunityId: recommendation.opportunityId, recommendationId: recommendation.id, subject, status: "open" as const, createdAt: now };
  snapshot.tasks.push(task);
  snapshot.opportunities[recommendation.opportunityId].version += 1;
  return { targetType: "task", targetId: task.id, beforeValue: null, afterValue: task };
}

function applyRiskTag(snapshot: SimulatedCrmSnapshot, recommendation: ApprovalRecommendation, now: Date): WritebackChange {
  const tag = requireSuggestedValue(recommendation, "Risk tag is required.");
  const riskTag = { id: `risk-${recommendation.id}`, opportunityId: recommendation.opportunityId, recommendationId: recommendation.id, tag, createdAt: now };
  snapshot.riskTags.push(riskTag);
  snapshot.opportunities[recommendation.opportunityId].version += 1;
  return { targetType: "risk_tag", targetId: riskTag.id, beforeValue: null, afterValue: riskTag };
}

function applyNoteSummary(snapshot: SimulatedCrmSnapshot, recommendation: ApprovalRecommendation, now: Date): WritebackChange {
  const body = requireSuggestedValue(recommendation, "Note summary is required.");
  const note = { id: `note-${recommendation.id}`, opportunityId: recommendation.opportunityId, recommendationId: recommendation.id, body, createdAt: now };
  snapshot.noteSummaries.push(note);
  snapshot.opportunities[recommendation.opportunityId].version += 1;
  return { targetType: "note_summary", targetId: note.id, beforeValue: null, afterValue: note };
}

function applyOwnerAssignment(snapshot: SimulatedCrmSnapshot, recommendation: ApprovalRecommendation, now: Date): WritebackChange {
  const ownerId = requireSuggestedValue(recommendation, "Internal owner ID is required.");
  const beforeValue = snapshot.ownerAssignments[recommendation.opportunityId] ?? null;
  const assignment = { opportunityId: recommendation.opportunityId, ownerId, recommendationId: recommendation.id, assignedAt: now };
  snapshot.ownerAssignments[recommendation.opportunityId] = assignment;
  snapshot.opportunities[recommendation.opportunityId].version += 1;
  return { targetType: "owner_assignment", targetId: recommendation.opportunityId, beforeValue, afterValue: assignment };
}

function applyRollback(snapshot: SimulatedCrmSnapshot, change: WritebackChange, now: Date, recommendationId: string): void {
  const opportunity = snapshot.opportunities[change.targetId] ?? (change.targetType === "opportunity_field" ? undefined : snapshot.opportunities[String((change.afterValue as { opportunityId?: string } | null)?.opportunityId)]);

  switch (change.targetType) {
    case "opportunity_field": {
      const target = snapshot.opportunities[change.targetId];
      if (!target || !change.fieldName || !target.fields[change.fieldName]) throw new WritebackError("ROLLBACK_TARGET_MISSING", "Rollback target field is missing.");
      target.fields[change.fieldName] = { ...target.fields[change.fieldName], value: change.beforeValue as CrmFieldValue, updatedAt: now };
      target.version += 1;
      return;
    }
    case "task":
      snapshot.tasks = snapshot.tasks.filter((task) => task.id !== change.targetId);
      break;
    case "risk_tag":
      snapshot.riskTags = snapshot.riskTags.filter((tag) => tag.id !== change.targetId);
      break;
    case "note_summary":
      snapshot.noteSummaries = snapshot.noteSummaries.filter((note) => note.id !== change.targetId);
      break;
    case "owner_assignment":
      if (change.beforeValue === null || change.beforeValue === undefined) delete snapshot.ownerAssignments[change.targetId];
      else snapshot.ownerAssignments[change.targetId] = change.beforeValue as SimulatedCrmSnapshot["ownerAssignments"][string];
      break;
  }

  if (opportunity) opportunity.version += 1;
  const original = snapshot.writebackAttempts.find((attempt) => attempt.recommendationId === recommendationId && attempt.change?.targetId === change.targetId && attempt.status === "success");
  if (original) original.status = "rolled_back";
}


function approvalRequirementFor(recommendation: ApprovalRecommendation): WritebackApprovalRequirement {
  if (recommendation.crmField === "Amount") return "disabled_admin_only";
  if (isClosedWonLostTransition(recommendation)) return "out_of_scope";
  if (recommendation.riskLevel === "high" || STAGE_FORECAST_FIELDS.has(recommendation.crmField ?? "")) return "manager_approval";
  if (recommendation.riskLevel === "medium" || recommendation.crmField === "CloseDate") return "approval_required";
  return "approval_light";
}

function isClosedWonLostTransition(recommendation: ApprovalRecommendation): boolean {
  if (recommendation.crmField !== "StageName") return false;
  const value = recommendation.suggestedValue?.trim().toLowerCase();
  return value !== undefined && OUT_OF_SCOPE_TERMINAL_VALUES.has(value);
}

function simulateAdapterPreflight(snapshot: SimulatedCrmSnapshot, recommendation: ApprovalRecommendation, options: ParsedOptions): { success: true; retryCount: number } | { success: false; retryCount: number; code: WritebackApiErrorCode | "SIMULATED_WRITEBACK_FAILURE"; message: string } {
  if (options.validationFailureRecommendationIds.includes(recommendation.id)) {
    return { success: false, retryCount: 0, code: "CRM_VALIDATION_ERROR", message: `CRM validation rejected recommendation ${recommendation.id}.` };
  }
  if (options.failRecommendationIds.includes(recommendation.id)) {
    return { success: false, retryCount: 0, code: "SIMULATED_WRITEBACK_FAILURE", message: `Simulated writeback failure for recommendation ${recommendation.id}.` };
  }
  if (options.timeoutRecommendationIds.includes(recommendation.id)) {
    return { success: false, retryCount: options.maxRetries, code: "API_TIMEOUT", message: `CRM API timed out for recommendation ${recommendation.id}.` };
  }
  if (options.retryableFailureRecommendationIds.includes(recommendation.id)) {
    const previousFailures = snapshot.writebackAttempts.filter((attempt) => attempt.recommendationId === recommendation.id && attempt.status === "failed" && attempt.errorCode === "API_ERROR").length;
    if (previousFailures === 0 && options.maxRetries === 0) {
      return { success: false, retryCount: 0, code: "API_ERROR", message: `Retryable CRM API error for recommendation ${recommendation.id}.` };
    }
    return { success: true, retryCount: previousFailures === 0 ? 1 : 0 };
  }
  return { success: true, retryCount: 0 };
}

function attemptedRetryCount(recommendation: ApprovalRecommendation, options: ParsedOptions): number {
  if (options.timeoutRecommendationIds.includes(recommendation.id)) return options.maxRetries;
  return 0;
}

function mapField(recommendation: ApprovalRecommendation, options: ParsedOptions): string {
  if (!recommendation.crmField) throw new WritebackError("CRM_FIELD_REQUIRED", "CRM field is required for field update writebacks.");
  const mapped = options.fieldMapping[recommendation.crmField] ?? recommendation.crmField;
  if (mapped.trim().length === 0) throw new WritebackError("INVALID_FIELD_MAPPING", `Invalid field mapping for ${recommendation.crmField}.`);
  return mapped;
}

function coerceValue(value: string | null | undefined, dataType: CrmFieldDataType, fieldName: string): CrmFieldValue {
  if (value === undefined) return null;
  if (value === null) return null;

  switch (dataType) {
    case "number": {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new WritebackError("VALUE_TYPE_MISMATCH", `Value for ${fieldName} must be numeric.`);
      return parsed;
    }
    case "boolean": {
      const normalized = value.toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
      throw new WritebackError("VALUE_TYPE_MISMATCH", `Value for ${fieldName} must be boolean.`);
    }
    case "date": {
      if (Number.isNaN(Date.parse(value))) throw new WritebackError("VALUE_TYPE_MISMATCH", `Value for ${fieldName} must be a valid date.`);
      return value;
    }
    case "string":
    case "picklist":
      return value;
  }
}

function requireSuggestedValue(recommendation: ApprovalRecommendation, message: string): string {
  if (recommendation.suggestedValue === null || recommendation.suggestedValue === undefined || recommendation.suggestedValue.trim().length === 0) throw new WritebackError("SUGGESTED_VALUE_REQUIRED", message);
  return recommendation.suggestedValue.trim();
}

function findSuccessfulDuplicate(snapshot: SimulatedCrmSnapshot, idempotencyKey: string): WritebackAttempt | undefined {
  return snapshot.writebackAttempts.find((attempt) => attempt.idempotencyKey === idempotencyKey && attempt.status === "success");
}

function appendAttempt(snapshot: SimulatedCrmSnapshot, raw: WritebackAttempt): WritebackAttempt {
  const attempt = writebackAttemptSchema.parse(raw);
  snapshot.writebackAttempts.push(attempt);
  return attempt;
}

function appendAuditEvent(snapshot: SimulatedCrmSnapshot, recommendation: ApprovalRecommendation, actor: ApprovalActor, action: ApprovalAuditEvent["action"], fromStatus: ApprovalAuditEvent["fromStatus"], toStatus: ApprovalAuditEvent["toStatus"], now: Date, message: string, metadata: Record<string, unknown>): ApprovalAuditEvent {
  const auditEvent = approvalAuditEventSchema.parse({
    id: `audit-${action}-${recommendation.id}-${snapshot.auditEvents.length + 1}`,
    recommendationId: recommendation.id,
    opportunityId: recommendation.opportunityId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    fromStatus,
    toStatus,
    message,
    metadata,
    createdAt: now,
  });
  snapshot.auditEvents.push(auditEvent);
  return auditEvent;
}

function cloneSnapshot(snapshot: SimulatedCrmSnapshot): SimulatedCrmSnapshot {
  return simulatedCrmSnapshotSchema.parse(structuredClone(snapshot));
}

function defaultIdempotencyKey(recommendation: ApprovalRecommendation): string {
  return `${recommendation.id}:${recommendation.actionType}:${recommendation.crmField ?? "none"}`;
}

function stableAttemptId(prefix: string, recommendationId: string, ordinal: number): string {
  return `${prefix}-${recommendationId}-${ordinal}`;
}

function normalizeError(error: unknown): WritebackError {
  if (error instanceof WritebackError) return error;
  if (error instanceof Error) return new WritebackError("WRITEBACK_ERROR", error.message);
  return new WritebackError("WRITEBACK_ERROR", "Unknown writeback error.");
}
