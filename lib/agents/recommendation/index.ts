import {
  approvalCardStatusSchema,
  approvalPolicySchema,
  recommendationActionTypeSchema,
  recommendationCardListSchema,
  recommendationCardSchema,
  recommendationContextSchema,
  recommendationOptionsSchema,
  recommendationRiskLevelSchema,
} from "./schemas";
import type { ApprovalPolicy, RecommendationActionType, RecommendationCard, RecommendationContext, RecommendationEvidence, RecommendationRiskLevel } from "./types";
import type { FieldComparison } from "../comparison";
import type { ValidationFact, ValidationResult } from "../validation";

type ParsedContext = ReturnType<typeof recommendationContextSchema.parse>;
type ParsedOptions = ReturnType<typeof recommendationOptionsSchema.parse>;

type CardDraft = Omit<RecommendationCard, "id" | "duplicateKey" | "missingRequiredApprover"> & { duplicateKey?: string; missingRequiredApprover?: boolean };

const LOW_RISK_FIELDS = new Set(["NextStep", "NextStepDueDate__c"]);
const MEDIUM_RISK_FIELDS = new Set(["Risk__c", "RiskSeverity__c", "DecisionMaker__c", "Stakeholder__c", "ProcurementStatus__c", "LegalStatus__c", "SecurityStatus__c", "OwnerName"]);
const HIGH_RISK_FIELDS = new Set(["CloseDate", "StageName", "ForecastCategoryName", "Amount"]);
const SUPPORTED_FIELDS = new Set([...LOW_RISK_FIELDS, ...MEDIUM_RISK_FIELDS, ...HIGH_RISK_FIELDS, "NextStepOwner__c", "Approver__c", "Champion__c"]);
const BLOCKER_FACT_TYPES = new Set<ValidationFact["factType"]>(["procurement_status", "legal_status", "security_status", "risk", "close_date_risk"]);

export class RecommendationAgent {
  generateRecommendations(input: RecommendationContext): RecommendationCard[] {
    const context = recommendationContextSchema.parse(input);
    const options = recommendationOptionsSchema.parse(context.options ?? {});
    const resultByFactId = new Map(context.validationResults.map((result) => [result.factId, result]));
    const cards: RecommendationCard[] = [];

    for (const comparison of context.comparisons) {
      if (!comparison.recommendationEligible || !SUPPORTED_FIELDS.has(comparison.crmField) || !hasComparisonEvidence(comparison)) continue;
      const validation = resultByFactId.get(comparison.evidence.factId);
      if (!isEligibleEvidence(comparison.evidence.confidence, validation, options.minimumConfidence)) continue;
      cards.push(...cardsFromComparison(comparison, context, options));
    }

    for (const fact of context.facts) {
      const factId = stableFactId(fact);
      const validation = resultByFactId.get(factId);
      if (!isEligibleFact(fact, validation, options.minimumConfidence)) continue;
      cards.push(...cardsFromRiskFact(fact, validation, context, options));
    }

    const deduped = suppressExistingAndDuplicateCards(cards, context);
    return recommendationCardListSchema.parse(deduped.sort((left, right) => left.riskLevel.localeCompare(right.riskLevel) || left.actionType.localeCompare(right.actionType) || left.duplicateKey.localeCompare(right.duplicateKey)));
  }
}

export function generateRecommendations(input: RecommendationContext): RecommendationCard[] {
  return new RecommendationAgent().generateRecommendations(input);
}

function cardsFromComparison(comparison: FieldComparison, context: ParsedContext, options: ParsedOptions): RecommendationCard[] {
  const evidence = [evidenceFromComparison(comparison)];
  const cards: RecommendationCard[] = [];

  if (comparison.issueType === "missing_task" || comparison.crmField === "NextStepDueDate__c") {
    cards.push(finalizeCard({
      opportunityId: context.opportunity?.id,
      actionType: "create_task",
      proposedAction: `Create a follow-up task for ${comparison.extractedValue}`,
      crmField: comparison.crmField,
      currentCrmValue: comparison.currentValue,
      suggestedValue: comparison.extractedValue,
      reason: `CRM next-step task data is missing or incomplete while evidence identifies ${comparison.extractedValue}.`,
      evidence,
      confidence: comparison.evidence.confidence,
      riskLevel: "low",
      requiredApprover: null,
      approvalPolicy: "none",
      approvalLevels: [],
      status: "ready",
      createdFrom: "comparison",
    }));
    return cards;
  }

  if (comparison.issueType === "hidden_risk" || comparison.crmField === "Risk__c") {
    cards.push(finalizeCard(withApproval({
      opportunityId: context.opportunity?.id,
      actionType: "add_risk_tag",
      proposedAction: `Add risk tag: ${comparison.extractedValue}`,
      crmField: comparison.crmField,
      currentCrmValue: comparison.currentValue,
      suggestedValue: comparison.extractedValue,
      reason: "Evidence shows a deal risk that is not reflected in CRM.",
      evidence,
      confidence: comparison.evidence.confidence,
      riskLevel: "medium",
      createdFrom: "comparison",
    }, options)));
  } else {
    const riskLevel = riskForField(comparison.crmField);
    const policy = comparison.crmField === "Amount" ? options.amountUpdatePolicy : undefined;
    cards.push(finalizeCard(withApproval({
      opportunityId: context.opportunity?.id,
      actionType: "update_crm_field",
      proposedAction: `Update ${comparison.crmField} to ${comparison.extractedValue}`,
      crmField: comparison.crmField,
      currentCrmValue: comparison.currentValue,
      suggestedValue: comparison.extractedValue,
      reason: reasonForComparison(comparison),
      evidence,
      confidence: comparison.evidence.confidence,
      riskLevel,
      createdFrom: "comparison",
    }, options, policy)));
  }

  if (requiresManagerReview(comparison)) {
    cards.push(finalizeCard(withApproval({
      opportunityId: context.opportunity?.id,
      actionType: "request_manager_review",
      proposedAction: `Request manager review for ${comparison.crmField}`,
      crmField: comparison.crmField,
      currentCrmValue: comparison.currentValue,
      suggestedValue: comparison.extractedValue,
      reason: `The ${comparison.issueType.replace(/_/g, " ")} affects forecast or close-plan accuracy.`,
      evidence,
      confidence: comparison.evidence.confidence,
      riskLevel: comparison.severity === "high" ? "high" : "medium",
      createdFrom: "comparison",
    }, options)));
  }

  if (options.includeDraftInternalMessages && comparison.severity === "high") {
    cards.push(finalizeCard({
      opportunityId: context.opportunity?.id,
      actionType: "draft_internal_message",
      proposedAction: `Draft internal message about ${comparison.crmField} conflict`,
      crmField: comparison.crmField,
      currentCrmValue: comparison.currentValue,
      suggestedValue: `Heads up: ${comparison.crmField} may need review because ${comparison.evidence.evidenceText}`,
      reason: "High-risk evidence should be communicated internally, but customer-facing or internal messages must remain drafts.",
      evidence,
      confidence: comparison.evidence.confidence,
      riskLevel: "low",
      requiredApprover: null,
      approvalPolicy: "draft_only",
      approvalLevels: [],
      status: "draft",
      createdFrom: "comparison",
    }));
  }

  return cards;
}

function cardsFromRiskFact(fact: ValidationFact, validation: ValidationResult | undefined, context: ParsedContext, options: ParsedOptions): RecommendationCard[] {
  if (!BLOCKER_FACT_TYPES.has(fact.factType) || !isOpenBlocker(fact.normalizedValue || fact.rawValue)) return [];
  const evidence = [evidenceFromFact(fact, validation)];
  const output: RecommendationCard[] = [];
  const field = fact.suggestedCrmFieldMapping?.fieldName ?? fieldForFact(fact.factType);

  if (fact.factType === "legal_status" || fact.factType === "security_status" || fact.factType === "procurement_status") {
    output.push(finalizeCard(withApproval({
      opportunityId: context.opportunity?.id,
      actionType: "assign_internal_owner",
      proposedAction: `Assign an internal owner for ${fact.factType.replace(/_/g, " ")}`,
      crmField: field,
      currentCrmValue: null,
      suggestedValue: ownerRoleForFact(fact.factType),
      reason: `${fact.factType.replace(/_/g, " ")} appears unresolved and needs an accountable internal owner.`,
      evidence,
      confidence: fact.confidence,
      riskLevel: "medium",
      createdFrom: "risk_finding",
    }, options)));
  }

  if (fact.factType === "procurement_status" || fact.factType === "risk" || fact.factType === "close_date_risk") {
    output.push(finalizeCard(withApproval({
      opportunityId: context.opportunity?.id,
      actionType: "request_manager_review",
      proposedAction: `Request manager review for ${fact.factType.replace(/_/g, " ")}`,
      crmField: field,
      currentCrmValue: null,
      suggestedValue: fact.normalizedValue || fact.rawValue,
      reason: "Blocker evidence may affect forecast confidence or deal execution.",
      evidence,
      confidence: fact.confidence,
      riskLevel: "medium",
      createdFrom: "risk_finding",
    }, options)));
  }

  return output;
}

function withApproval(draft: Omit<CardDraft, "requiredApprover" | "approvalPolicy" | "approvalLevels" | "status" | "missingRequiredApprover">, options: ParsedOptions, forcedPolicy?: ApprovalPolicy): CardDraft {
  const risk = draft.riskLevel;
  const policy: ApprovalPolicy = forcedPolicy ?? (risk === "high" ? "strict_approval" : risk === "medium" ? "standard_approval" : "none");
  const approverRoles = policy === "strict_approval" ? strictApproverRoles(draft.crmField) : policy === "standard_approval" ? standardApproverRoles(draft) : [];
  const levels = approverRoles.map((role, index) => ({ level: index + 1, approverRole: role, approverId: approverId(role, options), required: true }));
  const missingRequiredApprover = levels.some((level) => !level.approverId);

  return {
    ...draft,
    requiredApprover: approverRoles[0] ?? null,
    approvalPolicy: policy,
    approvalLevels: levels,
    missingRequiredApprover,
    status: policy === "blocked" ? "blocked" : policy === "none" ? "ready" : "pending_approval",
    blockedReason: policy === "blocked" ? `${draft.crmField ?? "This action"} is blocked by approval policy.` : undefined,
  };
}

function finalizeCard(draft: CardDraft): RecommendationCard {
  const duplicateKey = draft.duplicateKey ?? buildDuplicateKey(draft.actionType, draft.crmField, draft.suggestedValue);
  return recommendationCardSchema.parse({ ...draft, duplicateKey, id: `rec_${hash(duplicateKey)}` });
}

function suppressExistingAndDuplicateCards(cards: RecommendationCard[], context: ParsedContext): RecommendationCard[] {
  const blockedKeys = new Set([...context.existingRecommendations, ...context.snoozedRecommendations].filter((item) => item.status === undefined || ["draft", "ready", "pending_approval", "snoozed", "blocked"].includes(item.status)).map((item) => item.duplicateKey ?? buildDuplicateKey(item.actionType, item.crmField, item.suggestedValue ?? null)));
  const byKey = new Map<string, RecommendationCard>();

  for (const card of cards) {
    if (blockedKeys.has(card.duplicateKey)) continue;
    const existing = byKey.get(card.duplicateKey);
    if (!existing || card.confidence > existing.confidence || riskRank(card.riskLevel) > riskRank(existing.riskLevel)) byKey.set(card.duplicateKey, card);
  }

  return [...byKey.values()];
}

function evidenceFromComparison(comparison: FieldComparison): RecommendationEvidence {
  return {
    factId: comparison.evidence.factId,
    sourceId: comparison.evidence.sourceId,
    sourceTimestamp: comparison.evidence.sourceTimestamp,
    evidenceText: comparison.evidence.evidenceText,
    crmField: comparison.crmField,
    issueType: comparison.issueType,
    validationStatus: comparison.evidence.validationStatus,
    confidence: comparison.evidence.confidence,
  };
}

function evidenceFromFact(fact: ValidationFact, validation?: ValidationResult): RecommendationEvidence {
  return {
    factId: stableFactId(fact),
    sourceId: fact.sourceId,
    sourceTimestamp: fact.sourceTimestamp,
    evidenceText: fact.evidenceText,
    crmField: fact.suggestedCrmFieldMapping?.fieldName,
    validationStatus: validation?.status === "needs_review" ? "needs_review" : "valid",
    confidence: Math.min(fact.confidence, validation?.confidence ?? fact.confidence),
  };
}

function isEligibleEvidence(confidence: number, validation: ValidationResult | undefined, minimumConfidence: number): boolean {
  return confidence >= minimumConfidence && validation?.status !== "rejected" && validation?.evidenceStatus !== "missing" && validation?.evidenceStatus !== "inference_only" && validation?.evidenceStatus !== "unauthorized";
}

function isEligibleFact(fact: ValidationFact, validation: ValidationResult | undefined, minimumConfidence: number): boolean {
  return Boolean(fact.recommendationEligible && fact.evidenceText.trim() && fact.confidence >= minimumConfidence && validation && isEligibleEvidence(validation.confidence, validation, minimumConfidence));
}

function hasComparisonEvidence(comparison: FieldComparison): boolean {
  return Boolean(comparison.evidence.evidenceText.trim() && comparison.evidence.factId && comparison.evidence.sourceId);
}

function riskForField(field: string): RecommendationRiskLevel {
  if (HIGH_RISK_FIELDS.has(field)) return "high";
  if (MEDIUM_RISK_FIELDS.has(field)) return "medium";
  return "low";
}

function reasonForComparison(comparison: FieldComparison): string {
  return `CRM ${comparison.crmField} is ${display(comparison.currentValue)} but validated evidence supports ${display(comparison.extractedValue)} (${comparison.issueType.replace(/_/g, " ")}).`;
}

function requiresManagerReview(comparison: FieldComparison): boolean {
  return comparison.severity === "high" || ["ForecastCategoryName", "StageName", "CloseDate", "Amount"].includes(comparison.crmField);
}

function strictApproverRoles(field?: string): string[] {
  if (field === "Amount") return ["manager", "finance", "revOps"];
  return ["manager", "revOps"];
}

function standardApproverRoles(draft: Pick<CardDraft, "actionType" | "crmField">): string[] {
  if (draft.actionType === "request_manager_review") return ["manager"];
  if (draft.crmField === "LegalStatus__c") return ["legal"];
  if (draft.crmField === "SecurityStatus__c") return ["security"];
  if (draft.crmField === "ProcurementStatus__c") return ["procurement"];
  return ["dealOwner"];
}

function approverId(role: string, options: ParsedOptions): string | undefined {
  const approvers = options.approvers ?? {};
  if (role === "revOps") return approvers.revOps;
  if (role === "dealOwner") return approvers.dealOwner;
  return approvers[role as keyof typeof approvers];
}

function buildDuplicateKey(actionType?: RecommendationActionType, crmField?: string, suggestedValue?: string | null): string {
  return [actionType ?? "unknown", crmField ?? "none", normalize(suggestedValue ?? "")].join("|");
}

function stableFactId(fact: ValidationFact): string {
  return fact.factId ?? [fact.sourceId, fact.factType, normalize(fact.normalizedValue || fact.rawValue)].join(":");
}

function fieldForFact(factType: ValidationFact["factType"]): string | undefined {
  const fields: Partial<Record<ValidationFact["factType"], string>> = { procurement_status: "ProcurementStatus__c", legal_status: "LegalStatus__c", security_status: "SecurityStatus__c", risk: "Risk__c", close_date_risk: "CloseDate" };
  return fields[factType];
}

function ownerRoleForFact(factType: ValidationFact["factType"]): string {
  const roles: Partial<Record<ValidationFact["factType"], string>> = { procurement_status: "procurement owner", legal_status: "legal owner", security_status: "security owner" };
  return roles[factType] ?? "internal owner";
}

function isOpenBlocker(value: string): boolean {
  return /\b(block|blocked|blocker|pending|delay|delayed|stuck|not started|not reviewed|unresolved|risk)\b/i.test(value);
}

function riskRank(risk: RecommendationRiskLevel): number {
  return { low: 0, medium: 1, high: 2 }[risk];
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function display(value: string | null | undefined): string {
  return value === null || value === undefined || value === "" ? "<empty>" : `"${value}"`;
}

function hash(value: string): string {
  let hashValue = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hashValue ^= value.charCodeAt(index);
    hashValue = Math.imul(hashValue, 0x01000193);
  }
  return (hashValue >>> 0).toString(16);
}

export {
  approvalCardStatusSchema,
  approvalPolicySchema,
  existingRecommendationSchema,
  recommendationActionTypeSchema,
  recommendationApprovalLevelSchema,
  recommendationCardListSchema,
  recommendationCardSchema,
  recommendationContextSchema,
  recommendationEvidenceSchema,
  recommendationOptionsSchema,
  recommendationRiskLevelSchema,
} from "./schemas";
export type {
  ApprovalCardStatus,
  ApprovalPolicy,
  ExistingRecommendation,
  RecommendationActionType,
  RecommendationApprovalLevel,
  RecommendationCard,
  RecommendationCardList,
  RecommendationContext,
  RecommendationEvidence,
  RecommendationOptions,
  RecommendationRiskLevel,
} from "./types";
