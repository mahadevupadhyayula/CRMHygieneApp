import {
  coordinationActionListSchema,
  coordinationActionSchema,
  coordinationContextSchema,
  coordinationOptionsSchema,
} from "./schemas";
import type { CoordinationAction, CoordinationActionStatus, CoordinationActionType, CoordinationContext, CoordinationEvidence, CoordinationOwnerRole } from "./types";
import type { FieldComparison } from "../comparison";
import type { ValidationFact, ValidationResult } from "../validation";

export * from "./schemas";
export * from "./types";

type ParsedContext = ReturnType<typeof coordinationContextSchema.parse>;
type ParsedOptions = ReturnType<typeof coordinationOptionsSchema.parse>;
type OwnerDirectory = NonNullable<ParsedOptions["owners"]>;
type ActionDraft = Omit<CoordinationAction, "id" | "duplicateKey"> & { duplicateKey?: string };

type TriggerConfig = {
  type: CoordinationActionType;
  ownerRole: CoordinationOwnerRole;
  trigger: string;
  customerFacing?: boolean;
};

const FACT_TRIGGERS: Partial<Record<ValidationFact["factType"], TriggerConfig>> = {
  legal_status: { type: "notify_legal_owner", ownerRole: "legal", trigger: "Legal pending" },
  security_status: { type: "assign_security_task", ownerRole: "security", trigger: "Security questionnaire" },
  procurement_status: { type: "request_manager_review", ownerRole: "manager", trigger: "Procurement delay" },
  next_step: { type: "create_follow_up_task", ownerRole: "opportunity_owner", trigger: "No activity" },
  internal_owner_needed: { type: "assign_ae_multithread_task", ownerRole: "account_executive", trigger: "CFO not engaged" },
};

const COMPARISON_TRIGGERS: Partial<Record<string, TriggerConfig>> = {
  NextStep: { type: "create_follow_up_task", ownerRole: "opportunity_owner", trigger: "No activity" },
  NextStepDueDate__c: { type: "create_follow_up_task", ownerRole: "opportunity_owner", trigger: "No activity" },
  DecisionMaker__c: { type: "assign_ae_multithread_task", ownerRole: "account_executive", trigger: "CFO not engaged" },
  Stakeholder__c: { type: "assign_ae_multithread_task", ownerRole: "account_executive", trigger: "CFO not engaged" },
  Amount: { type: "assign_deal_desk_task", ownerRole: "deal_desk", trigger: "Pricing approval" },
};

const OPEN_BLOCKER_PATTERN = /\b(block|blocked|blocker|pending|delay|delayed|stuck|not started|not reviewed|unresolved|questionnaire|approval|approve|review|risk|redline|msa|dpa|security|legal|procurement)\b/i;
const TECHNICAL_PATTERN = /\b(technical|integration|api|sso|saml|scim|architecture|sandbox|poc|proof of concept|implementation|migration|data sync|webhook)\b/i;
const PRICING_PATTERN = /\b(pricing|discount|quote|cpq|approval|commercial|finance|deal desk|procurement price)\b/i;
const CFO_PATTERN = /\b(cfo|finance buyer|economic buyer|exec sponsor|executive sponsor|multi[- ]?thread|not engaged|missing stakeholder)\b/i;
const CUSTOMER_DOCUMENT_PATTERN = /\b(send|share|provide|asked|request(?:ed)?|needs?)\b.*\b(document|doc|msa|dpa|security packet|soc ?2|order form|quote|case study|proposal|redline|questionnaire)\b/i;
const SENSITIVE_PATTERN = /\b(ssn|social security|credit card|password|token|secret|private key|api key|confidential|nda-only|medical|phi|salary)\b/i;

export class CoordinationAgent {
  generateCoordinationActions(input: CoordinationContext): CoordinationAction[] {
    const context = coordinationContextSchema.parse(input);
    const options = coordinationOptionsSchema.parse(context.options ?? {});
    const resultByFactId = new Map(context.validationResults.map((result) => [result.factId, result]));
    const actions: CoordinationAction[] = [];

    for (const fact of context.facts) {
      const factId = stableFactId(fact);
      const validation = resultByFactId.get(factId);
      if (!isEligibleFact(fact, validation, options.minimumConfidence)) continue;
      actions.push(...actionsFromFact(fact, validation, context, options));
    }

    for (const comparison of context.comparisons) {
      const validation = resultByFactId.get(comparison.evidence.factId);
      if (!comparison.recommendationEligible || !isEligibleEvidence(comparison.evidence.confidence, validation, options.minimumConfidence)) continue;
      actions.push(...actionsFromComparison(comparison, context, options));
    }

    return coordinationActionListSchema.parse(suppressExistingAndDuplicateActions(actions, context).sort((left, right) => left.type.localeCompare(right.type) || left.ownerRole.localeCompare(right.ownerRole) || left.duplicateKey.localeCompare(right.duplicateKey)));
  }
}

export function generateCoordinationActions(input: CoordinationContext): CoordinationAction[] {
  return new CoordinationAgent().generateCoordinationActions(input);
}

function actionsFromFact(fact: ValidationFact, validation: ValidationResult | undefined, context: ParsedContext, options: ParsedOptions): CoordinationAction[] {
  const value = fact.normalizedValue || fact.rawValue;
  const evidence = evidenceFromFact(fact, validation, triggerForFact(fact));
  const actions: CoordinationAction[] = [];

  if (TECHNICAL_PATTERN.test(`${fact.factType} ${value} ${fact.evidenceText}`) && isOpenBlocker(value)) {
    actions.push(finalizeAction(buildAction({ type: "assign_se_task", ownerRole: "sales_engineer", trigger: "Technical blocker", value, evidence, context, options })));
  }

  if (PRICING_PATTERN.test(`${value} ${fact.evidenceText}`) && isOpenBlocker(value)) {
    actions.push(finalizeAction(buildAction({ type: "assign_deal_desk_task", ownerRole: "deal_desk", trigger: "Pricing approval", value, evidence: { ...evidence, trigger: "Pricing approval" }, context, options })));
  }

  if (CFO_PATTERN.test(`${value} ${fact.evidenceText}`)) {
    actions.push(finalizeAction(buildAction({ type: "assign_ae_multithread_task", ownerRole: "account_executive", trigger: "CFO not engaged", value, evidence: { ...evidence, trigger: "CFO not engaged" }, context, options })));
  }

  if (CUSTOMER_DOCUMENT_PATTERN.test(`${value} ${fact.evidenceText}`)) {
    actions.push(finalizeAction(buildAction({ type: "draft_customer_follow_up", ownerRole: "opportunity_owner", trigger: "Customer asked for document", value, evidence: { ...evidence, trigger: "Customer asked for document" }, context, options, customerFacing: true })));
  }

  const config = FACT_TRIGGERS[fact.factType];
  if (config && (fact.factType === "next_step" || fact.factType === "internal_owner_needed" || isOpenBlocker(value))) {
    actions.push(finalizeAction(buildAction({ ...config, value, evidence: { ...evidence, trigger: config.trigger }, context, options })));
  }

  return actions;
}

function actionsFromComparison(comparison: FieldComparison, context: ParsedContext, options: ParsedOptions): CoordinationAction[] {
  const config = COMPARISON_TRIGGERS[comparison.crmField];
  if (!config && comparison.issueType !== "missing_task" && comparison.issueType !== "missing_stakeholder") return [];
  const trigger = config ?? (comparison.issueType === "missing_stakeholder" ? { type: "assign_ae_multithread_task", ownerRole: "account_executive", trigger: "CFO not engaged" } : { type: "create_follow_up_task", ownerRole: "opportunity_owner", trigger: "No activity" } satisfies TriggerConfig);
  const evidence = evidenceFromComparison(comparison, trigger.trigger);
  return [finalizeAction(buildAction({ ...trigger, value: comparison.extractedValue, evidence, context, options }))];
}

function buildAction(input: TriggerConfig & { value: string; evidence: CoordinationEvidence; context: ParsedContext; options: ParsedOptions }): ActionDraft {
  const ownerName = suggestedOwner(input.ownerRole, input.context, input.options.owners ?? {});
  const customerFacing = input.customerFacing ?? false;
  const approvalRequired = customerFacing || input.options.requireInternalMessageReview;
  let status: CoordinationActionStatus = customerFacing ? "draft" : input.options.requireInternalMessageReview ? "requires_review" : "ready";
  let blockedReason: string | undefined;

  if (!ownerName) {
    status = "blocked";
    blockedReason = `No available ${input.ownerRole.replace(/_/g, " ")} owner is configured.`;
  }

  return {
    opportunityId: input.context.opportunity?.id,
    type: input.type,
    ownerRole: input.ownerRole,
    suggestedOwner: ownerName,
    draftMessage: draftMessage(input.type, input.ownerRole, input.value, input.evidence, customerFacing, approvalRequired),
    evidence: [input.evidence],
    approvalRequired,
    status,
    blockedReason,
    customerFacing,
  };
}

function finalizeAction(draft: ActionDraft): CoordinationAction {
  const duplicateKey = draft.duplicateKey ?? buildDuplicateKey(draft.type, draft.ownerRole, draft.evidence[0]?.factId, draft.opportunityId);
  return coordinationActionSchema.parse({ ...draft, duplicateKey, id: `coord_${hash(duplicateKey)}` });
}

function suppressExistingAndDuplicateActions(actions: CoordinationAction[], context: ParsedContext): CoordinationAction[] {
  const activeKeys = new Set([...context.existingActions, ...context.existingTasks].filter((item) => item.status === undefined || ["draft", "ready", "requires_review", "blocked"].includes(item.status)).map((item) => item.duplicateKey ?? buildDuplicateKey(item.type, item.ownerRole, undefined, context.opportunity?.id)));
  const byKey = new Map<string, CoordinationAction>();

  for (const action of actions) {
    if (activeKeys.has(action.duplicateKey)) continue;
    const existing = byKey.get(action.duplicateKey);
    if (!existing || action.evidence[0].confidence > existing.evidence[0].confidence) byKey.set(action.duplicateKey, action);
  }

  return [...byKey.values()];
}

function draftMessage(type: CoordinationActionType, ownerRole: CoordinationOwnerRole, value: string, evidence: CoordinationEvidence, customerFacing: boolean, approvalRequired: boolean): string {
  const safeEvidence = evidence.sensitive ? "Sensitive evidence is available in the audit trail and was omitted from this draft." : `Evidence: ${evidence.evidenceText}`;
  if (customerFacing) return `Draft only — do not auto-send. Please follow up with the customer about ${value}. ${safeEvidence}`;
  const reviewPrefix = approvalRequired ? "Please review before posting. " : "";
  return `${reviewPrefix}${labelForType(type)} for ${ownerRole.replace(/_/g, " ")}: ${value}. ${safeEvidence}`;
}

function evidenceFromFact(fact: ValidationFact, validation: ValidationResult | undefined, trigger: string): CoordinationEvidence {
  const sensitive = isSensitive(fact.evidenceText, fact.metadata);
  return {
    factId: stableFactId(fact),
    sourceId: fact.sourceId,
    sourceTimestamp: fact.sourceTimestamp,
    evidenceText: sensitive ? redactEvidence(fact.evidenceText) : fact.evidenceText,
    crmField: fact.suggestedCrmFieldMapping?.fieldName,
    trigger,
    confidence: Math.min(fact.confidence, validation?.confidence ?? fact.confidence),
    sensitive,
  };
}

function evidenceFromComparison(comparison: FieldComparison, trigger: string): CoordinationEvidence {
  const sensitive = isSensitive(comparison.evidence.evidenceText);
  return {
    factId: comparison.evidence.factId,
    sourceId: comparison.evidence.sourceId,
    sourceTimestamp: comparison.evidence.sourceTimestamp,
    evidenceText: sensitive ? redactEvidence(comparison.evidence.evidenceText) : comparison.evidence.evidenceText,
    crmField: comparison.crmField,
    trigger,
    confidence: comparison.evidence.confidence,
    sensitive,
  };
}

function triggerForFact(fact: ValidationFact): string {
  return FACT_TRIGGERS[fact.factType]?.trigger ?? "Validated risk";
}

function suggestedOwner(role: CoordinationOwnerRole, context: ParsedContext, owners: OwnerDirectory): string | null {
  if (role === "opportunity_owner") return firstOwner(owners.opportunity_owner) ?? context.opportunity?.ownerName ?? null;
  if (role === "account_executive") return firstOwner(owners.account_executive) ?? context.opportunity?.ownerName ?? null;
  if (role === "manager") return firstOwner(owners.manager) ?? context.opportunity?.managerName ?? null;
  if (role === "deal_desk") return firstOwner(owners.deal_desk) ?? firstOwner(owners.finance);
  if (role === "finance") return firstOwner(owners.finance) ?? firstOwner(owners.deal_desk);
  return firstOwner(owners[role]);
}

function firstOwner(owner: string | string[] | undefined): string | null {
  if (Array.isArray(owner)) return owner[0] ?? null;
  return owner ?? null;
}

function isEligibleFact(fact: ValidationFact, validation: ValidationResult | undefined, minimumConfidence: number): boolean {
  return Boolean(fact.recommendationEligible && fact.evidenceText.trim() && fact.confidence >= minimumConfidence && validation && isEligibleEvidence(validation.confidence, validation, minimumConfidence));
}

function isEligibleEvidence(confidence: number, validation: ValidationResult | undefined, minimumConfidence: number): boolean {
  return confidence >= minimumConfidence && validation?.status !== "rejected" && validation?.evidenceStatus !== "missing" && validation?.evidenceStatus !== "inference_only" && validation?.evidenceStatus !== "unauthorized";
}

function isOpenBlocker(value: string): boolean {
  return OPEN_BLOCKER_PATTERN.test(value);
}

function isSensitive(text: string, metadata?: Record<string, unknown>): boolean {
  return SENSITIVE_PATTERN.test(text) || metadata?.sensitive === true;
}

function redactEvidence(text: string): string {
  return SENSITIVE_PATTERN.test(text) ? "[Sensitive evidence redacted]" : "[Sensitive evidence omitted]";
}

function labelForType(type: CoordinationActionType): string {
  const labels: Record<CoordinationActionType, string> = {
    assign_se_task: "Assign SE task",
    notify_legal_owner: "Notify legal owner",
    assign_security_task: "Assign security task",
    assign_deal_desk_task: "Assign deal desk task",
    assign_ae_multithread_task: "Assign AE multi-thread task",
    create_follow_up_task: "Create follow-up task",
    request_manager_review: "Request manager review",
    draft_customer_follow_up: "Draft customer follow-up",
  };
  return labels[type];
}

function buildDuplicateKey(type?: CoordinationActionType, ownerRole?: CoordinationOwnerRole, factId?: string, opportunityId?: string): string {
  return [type ?? "unknown", ownerRole ?? "unknown", opportunityId ?? "none", factId ?? "none"].join("|");
}

function stableFactId(fact: ValidationFact): string {
  return fact.factId ?? [fact.sourceId, fact.factType, normalize(fact.normalizedValue || fact.rawValue)].join(":");
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function hash(value: string): string {
  let hashValue = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hashValue ^= value.charCodeAt(index);
    hashValue = Math.imul(hashValue, 0x01000193);
  }
  return (hashValue >>> 0).toString(16);
}
