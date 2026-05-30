import {
  validationContextSchema,
  validationOptionsSchema,
  validationResultListSchema,
  validationResultSchema,
} from "./schemas";
import type {
  ValidationActionRisk,
  ValidationContext,
  ValidationEvidenceStatus,
  ValidationFact,
  ValidationResult,
  ValidationSource,
  ValidationStatus,
} from "./types";

export class ValidationAgent {
  validateFacts(input: ValidationContext): ValidationResult[] {
    const context = validationContextSchema.parse(input);
    const options = validationOptionsSchema.parse(context.options ?? {});
    const sourceById = new Map(context.sources.map((source) => [source.id, source]));
    const contradictions = contradictionKeys(context.facts);

    const results = context.facts.map((fact, index) => {
      const source = sourceById.get(fact.sourceId);
      return validateFact(fact, index, source, contradictions, {
        referenceDate: options.referenceDate,
        maxFactAgeDays: options.maxFactAgeDays,
        minimumConfidence: options.minimumConfidence,
        strictRecommendationEligibility: options.strictRecommendationEligibility,
      });
    });

    return validationResultListSchema.parse(results);
  }
}

export function validateFacts(input: ValidationContext): ValidationResult[] {
  return new ValidationAgent().validateFacts(input);
}

function validateFact(
  fact: ValidationFact,
  index: number,
  source: ValidationSource | undefined,
  contradictions: Set<string>,
  options: { referenceDate: Date; maxFactAgeDays: number; minimumConfidence: number; strictRecommendationEligibility: boolean },
): ValidationResult {
  const reasons: string[] = [];
  let status: ValidationStatus = "valid";
  let evidenceStatus: ValidationEvidenceStatus = "present";

  if (!fact.evidenceText?.trim()) {
    reasons.push("EVIDENCE_MISSING: extracted fact has no supporting evidence text.");
    status = "rejected";
    evidenceStatus = "missing";
  }

  if (!fact.sourceTimestamp || Number.isNaN(fact.sourceTimestamp.getTime())) {
    reasons.push("SOURCE_TIMESTAMP_MISSING: fact cannot be validated without source time metadata.");
    status = "rejected";
    evidenceStatus = prioritizeEvidenceStatus(evidenceStatus, "missing_timestamp");
  }

  if (!isSourceAuthorized(fact, source)) {
    reasons.push("SOURCE_UNAUTHORIZED: private or unauthorized source evidence cannot influence CRM recommendations.");
    status = "rejected";
    evidenceStatus = "unauthorized";
  }

  if (fact.confidence < options.minimumConfidence) {
    reasons.push(`LOW_CONFIDENCE: confidence ${fact.confidence} is below validation threshold ${options.minimumConfidence}.`);
    status = downgradeToReview(status);
  }

  if (options.strictRecommendationEligibility && !fact.recommendationEligible) {
    reasons.push("NOT_RECOMMENDATION_ELIGIBLE: extraction marked this fact review-only.");
    status = downgradeToReview(status);
  }

  if (isStale(fact, options.referenceDate, options.maxFactAgeDays)) {
    reasons.push(`STALE_SOURCE: source evidence is older than ${options.maxFactAgeDays} days.`);
    status = downgradeToReview(status);
    evidenceStatus = prioritizeEvidenceStatus(evidenceStatus, "stale");
  }

  const contradictionKey = factKey(fact, index);
  if (contradictions.has(contradictionKey)) {
    reasons.push("CONTRADICTION_DETECTED: another valid-looking fact for this field has a different normalized value.");
    status = downgradeToReview(status);
    evidenceStatus = prioritizeEvidenceStatus(evidenceStatus, "contradictory");
  }

  if (isIncompleteRoleOnlyStakeholder(fact)) {
    reasons.push("INCOMPLETE_STAKEHOLDER: role-only stakeholder needs human review before CRM use.");
    status = downgradeToReview(status);
  }

  if (isAmbiguousDate(fact)) {
    reasons.push("AMBIGUOUS_DATE: date-like value is not precise enough for automatic CRM use.");
    status = downgradeToReview(status);
  }

  if (isInference(fact)) {
    reasons.push("INFERENCE_ONLY: fact is marked as an inference rather than direct source evidence.");
    status = fact.evidenceText?.trim() ? downgradeToReview(status) : "rejected";
    evidenceStatus = prioritizeEvidenceStatus(evidenceStatus, "inference_only");
  }

  if (status === "valid") {
    reasons.push("VALID: evidence, source authorization, timestamp, recency, confidence, and completeness checks passed.");
  }

  return validationResultSchema.parse({
    factId: fact.factId ?? deterministicFactId(fact, index),
    status,
    reasons,
    confidence: fact.confidence,
    actionRisk: actionRiskFor(fact),
    evidenceStatus,
  });
}

function isSourceAuthorized(fact: ValidationFact, source: ValidationSource | undefined): boolean {
  const metadata = source?.metadata ?? fact.metadata;
  const visibility = (source?.visibility ?? metadataString(metadata, "visibility") ?? "").toLowerCase();
  if (visibility === "private") {
    return false;
  }

  const authorization = metadata?.authorization;
  if (isRecord(authorization) && authorization.authorized === false) {
    return false;
  }

  if (fact.metadata?.authorized === false) {
    return false;
  }

  return true;
}

function isStale(fact: ValidationFact, referenceDate: Date, maxFactAgeDays: number): boolean {
  if (!fact.sourceTimestamp || Number.isNaN(fact.sourceTimestamp.getTime())) {
    return false;
  }
  const ageMs = referenceDate.getTime() - fact.sourceTimestamp.getTime();
  return ageMs > maxFactAgeDays * 24 * 60 * 60 * 1000;
}

function contradictionKeys(facts: ValidationFact[]): Set<string> {
  const groups = new Map<string, Map<string, number[]>>();
  facts.forEach((fact, index) => {
    if (!fact.evidenceText?.trim() || !isComparableForContradiction(fact)) {
      return;
    }
    const fieldKey = fact.factType;
    const valueKey = fact.normalizedValue.trim().toLowerCase();
    const values = groups.get(fieldKey) ?? new Map<string, number[]>();
    const indexes = values.get(valueKey) ?? [];
    indexes.push(index);
    values.set(valueKey, indexes);
    groups.set(fieldKey, values);
  });

  const keys = new Set<string>();
  for (const [, values] of groups) {
    if (values.size <= 1) {
      continue;
    }
    for (const indexes of values.values()) {
      for (const index of indexes) {
        keys.add(`${facts[index].sourceId}|${facts[index].factType}|${index}`);
      }
    }
  }
  return keys;
}

function factKey(fact: ValidationFact, index: number): string {
  return `${fact.sourceId}|${fact.factType}|${index}`;
}

function isComparableForContradiction(fact: ValidationFact): boolean {
  return [
    "next_step_due_date",
    "decision_maker",
    "approver",
    "champion",
    "risk_severity",
    "timeline_signal",
    "close_date_risk",
    "stage_signal",
    "forecast_signal",
    "procurement_status",
    "legal_status",
    "security_status",
    "internal_owner_needed",
  ].includes(fact.factType);
}

function isIncompleteRoleOnlyStakeholder(fact: ValidationFact): boolean {
  if (!["decision_maker", "approver", "champion"].includes(fact.factType)) {
    return false;
  }
  const normalized = fact.normalizedValue.toLowerCase();
  return /^(cfo|ceo|cio|cto|coo|ciso|procurement|legal|security|finance|economic buyer)$/.test(normalized);
}

function isAmbiguousDate(fact: ValidationFact): boolean {
  if (!["next_step_due_date", "timeline_signal", "close_date_risk"].includes(fact.factType)) {
    return false;
  }
  const value = `${fact.rawValue} ${fact.normalizedValue}`.toLowerCase();
  return /\b(soon|next week|end of quarter|eoq|end of month|later|tbd|unknown)\b/.test(value);
}

function isInference(fact: ValidationFact): boolean {
  const factKind = metadataString(fact.metadata, "factKind") ?? metadataString(fact.metadata, "kind");
  return fact.isInference === true || factKind === "inference";
}

function actionRiskFor(fact: ValidationFact): ValidationActionRisk {
  if (["close_date_risk", "stage_signal", "forecast_signal"].includes(fact.factType)) {
    return "high";
  }
  if (["decision_maker", "approver", "champion", "risk", "risk_severity", "procurement_status", "legal_status", "security_status", "internal_owner_needed"].includes(fact.factType)) {
    return "medium";
  }
  return "low";
}

function downgradeToReview(status: ValidationStatus): ValidationStatus {
  return status === "rejected" ? "rejected" : "needs_review";
}

const evidencePriority: Record<ValidationEvidenceStatus, number> = {
  present: 0,
  stale: 1,
  contradictory: 2,
  inference_only: 3,
  missing_timestamp: 4,
  missing: 5,
  unauthorized: 6,
};

function prioritizeEvidenceStatus(current: ValidationEvidenceStatus, candidate: ValidationEvidenceStatus): ValidationEvidenceStatus {
  return evidencePriority[candidate] > evidencePriority[current] ? candidate : current;
}

function deterministicFactId(fact: ValidationFact, index: number): string {
  return [fact.sourceId, fact.factType, fact.normalizedValue.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), index].join(":");
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value.toLowerCase() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export {
  validationActionRiskSchema,
  validationContextSchema,
  validationEvidenceStatusSchema,
  validationFactSchema,
  validationOptionsSchema,
  validationResultListSchema,
  validationResultSchema,
  validationSourceSchema,
  validationStatusSchema,
} from "./schemas";

export type {
  ValidationActionRisk,
  ValidationContext,
  ValidationEvidenceStatus,
  ValidationFact,
  ValidationOptions,
  ValidationResult,
  ValidationResultList,
  ValidationSource,
  ValidationStatus,
} from "./types";
