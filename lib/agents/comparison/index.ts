import {
  comparisonContextSchema,
  comparisonOptionsSchema,
  fieldComparisonListSchema,
  fieldComparisonSchema,
} from "./schemas";
import type { ComparisonContext, ComparisonIssueType, ComparisonSeverity, FieldComparison } from "./types";
import type { ValidationFact, ValidationResult } from "../validation";

const FACT_CRM_FIELDS: Partial<Record<ValidationFact["factType"], string>> = {
  next_step: "NextStep",
  next_step_owner: "NextStepOwner__c",
  next_step_due_date: "NextStepDueDate__c",
  decision_maker: "DecisionMaker__c",
  approver: "Approver__c",
  champion: "Champion__c",
  risk: "Risk__c",
  risk_severity: "RiskSeverity__c",
  procurement_status: "ProcurementStatus__c",
  legal_status: "LegalStatus__c",
  security_status: "SecurityStatus__c",
  internal_owner_needed: "OwnerName",
};

export class ComparisonAgent {
  compareFields(input: ComparisonContext): FieldComparison[] {
    const context = comparisonContextSchema.parse(input);
    const options = comparisonOptionsSchema.parse(context.options ?? {});
    const snapshots = latestSnapshots(context.crmSnapshot);
    const facts = eligibleLatestFacts(context.facts, context.validationResults);
    const comparisons: FieldComparison[] = [];

    for (const fact of facts) {
      comparisons.push(...compareFact(fact.fact, fact.result, snapshots, context.opportunity, options));
    }

    return fieldComparisonListSchema.parse(dedupeComparisons(comparisons));
  }
}

export function compareFields(input: ComparisonContext): FieldComparison[] {
  return new ComparisonAgent().compareFields(input);
}

function compareFact(
  fact: ValidationFact,
  result: ValidationResult,
  snapshots: Map<string, { fieldName: string; value?: string | null }>,
  opportunity: ComparisonContext["opportunity"],
  options: { referenceDate: Date; staleNextStepDays: number; urgentCloseWindowDays: number; minimumHighSeverityConfidence: number },
): FieldComparison[] {
  const output: FieldComparison[] = [];
  const value = normalizedFactValue(fact);
  if (!value || isIncompleteFact(fact)) {
    return output;
  }

  if (fact.factType === "stage_signal") {
    const inferredStage = inferStage(value);
    const currentStage = snapshotValue(snapshots, "StageName") ?? opportunity?.stage ?? null;
    if (inferredStage && currentStage && normalizeToken(inferredStage) !== normalizeToken(currentStage)) {
      output.push(buildComparison("StageName", currentStage, inferredStage, "stage_mismatch", "high", fact, result, options));
    }
    return output;
  }

  if (fact.factType === "forecast_signal") {
    const inferredForecast = inferForecast(value);
    const currentForecast = snapshotValue(snapshots, "ForecastCategoryName") ?? opportunity?.forecastCategory ?? null;
    if (inferredForecast && currentForecast && normalizeToken(inferredForecast) !== normalizeToken(currentForecast)) {
      output.push(buildComparison("ForecastCategoryName", currentForecast, inferredForecast, "forecast_mismatch", "high", fact, result, options));
    }
    return output;
  }

  const opportunityCloseDate = opportunity?.closeDate as string | Date | null | undefined;

  if (fact.factType === "timeline_signal" || fact.factType === "close_date_risk") {
    const closeDate = snapshotValue(snapshots, "CloseDate") ?? toIsoDate(opportunityCloseDate) ?? null;
    if (closeDate && isTimelineMismatch(value, closeDate)) {
      output.push(buildComparison("CloseDate", closeDate, fact.normalizedValue, "timeline_mismatch", "high", fact, result, options));
    }
  }

  if (fact.factType === "legal_status" && isLegalNotStartedOrPending(value) && isCloseDateWithinWindow(opportunityCloseDate, options.referenceDate, options.urgentCloseWindowDays)) {
    output.push(buildComparison("CloseDate", toIsoDate(opportunityCloseDate), fact.normalizedValue, "timeline_mismatch", "high", fact, result, options));
  }

  if (fact.factType === "procurement_status" && isBlocker(value)) {
    const currentForecast = snapshotValue(snapshots, "ForecastCategoryName") ?? opportunity?.forecastCategory ?? null;
    if (normalizeToken(currentForecast) === "COMMIT") {
      output.push(buildComparison("ForecastCategoryName", currentForecast, fact.normalizedValue, "forecast_mismatch", "high", fact, result, options));
    }
  }

  if (isRiskFact(fact) && isRisky(value)) {
    const riskCurrent = snapshotValue(snapshots, "Risk__c") ?? null;
    if (isEmptyValue(riskCurrent)) {
      output.push(buildComparison("Risk__c", riskCurrent, fact.normalizedValue, "hidden_risk", "medium", fact, result, options));
    }
  }

  const crmField = FACT_CRM_FIELDS[fact.factType];
  if (!crmField) {
    return output;
  }

  const opportunityOwner = typeof opportunity?.ownerName === "string" ? opportunity.ownerName : null;
  const current = snapshotValue(snapshots, crmField) ?? (crmField === "OwnerName" ? opportunityOwner : null) ?? null;
  const genericIssue = compareGenericField(crmField, current, value, fact, options);
  if (genericIssue) {
    output.push(buildComparison(crmField, current, fact.normalizedValue, genericIssue.issueType, genericIssue.severity, fact, result, options));
  }

  if (fact.factType === "next_step" && !hasDueDate(fact.normalizedValue) && isEmptyValue(snapshotValue(snapshots, "NextStepDueDate__c"))) {
    output.push(buildComparison("NextStepDueDate__c", null, fact.normalizedValue, "missing_task", "medium", fact, result, options));
  }

  return output;
}

function compareGenericField(
  crmField: string,
  current: string | null,
  value: string,
  fact: ValidationFact,
  options: { referenceDate: Date; staleNextStepDays: number },
): { issueType: ComparisonIssueType; severity: ComparisonSeverity } | undefined {
  if (isEmptyValue(current)) {
    if (isRiskFact(fact)) {
      return undefined;
    }
    if (fact.factType === "decision_maker" || fact.factType === "approver" || fact.factType === "champion") {
      return { issueType: "missing_stakeholder", severity: "medium" };
    }
    if (fact.factType === "internal_owner_needed" || crmField === "OwnerName") {
      return { issueType: "missing_owner", severity: "medium" };
    }
    return { issueType: "empty_field", severity: "medium" };
  }

  const presentCurrent = current ?? "";

  if (fact.factType === "next_step" && isStaleNextStep(presentCurrent, options.referenceDate, options.staleNextStepDays)) {
    return { issueType: "stale_field", severity: "medium" };
  }

  if (!valuesAligned(presentCurrent, value, fact.factType)) {
    if (fact.factType === "next_step" || fact.factType === "next_step_due_date") {
      return { issueType: "stale_field", severity: "medium" };
    }
    return { issueType: "contradiction", severity: "medium" };
  }

  return undefined;
}

function eligibleLatestFacts(facts: ValidationFact[], results: ValidationResult[]): Array<{ fact: ValidationFact; result: ValidationResult }> {
  const resultsById = new Map(results.map((result) => [result.factId, result]));
  const candidates: Array<{ fact: ValidationFact; result: ValidationResult; index: number }> = [];

  facts.forEach((fact, index) => {
    const result = resultsById.get(fact.factId ?? deterministicFactId(fact, index));
    if (!result || result.status === "rejected" || result.evidenceStatus === "stale" || fact.sourceMatchStatus !== "matched") {
      return;
    }
    candidates.push({ fact, result, index });
  });

  const byField = new Map<string, { fact: ValidationFact; result: ValidationResult; index: number }>();
  for (const candidate of candidates) {
    const key = canonicalFactGroup(candidate.fact);
    const existing = byField.get(key);
    if (!existing || factTime(candidate.fact) > factTime(existing.fact) || (factTime(candidate.fact) === factTime(existing.fact) && candidate.fact.confidence > existing.fact.confidence)) {
      byField.set(key, candidate);
    }
  }

  return [...byField.values()].sort((left, right) => canonicalFactGroup(left.fact).localeCompare(canonicalFactGroup(right.fact))).map(({ fact, result }) => ({ fact, result }));
}

function buildComparison(
  crmField: string,
  currentValue: string | null | undefined,
  extractedValue: string,
  issueType: ComparisonIssueType,
  severity: ComparisonSeverity,
  fact: ValidationFact,
  result: ValidationResult,
  options: { minimumHighSeverityConfidence: number },
): FieldComparison {
  const cappedSeverity = result.status === "needs_review" || fact.confidence < options.minimumHighSeverityConfidence || !fact.recommendationEligible ? capSeverity(severity, "medium") : severity;
  return fieldComparisonSchema.parse({
    crmField,
    currentValue: currentValue ?? null,
    extractedValue,
    issueType,
    severity: cappedSeverity,
    evidence: {
      factId: result.factId,
      sourceId: fact.sourceId,
      sourceTimestamp: fact.sourceTimestamp,
      evidenceText: fact.evidenceText,
      validationStatus: result.status,
      confidence: fact.confidence,
    },
    recommendationEligible: result.status === "valid" && fact.recommendationEligible && fact.confidence >= 0.7,
  });
}

function latestSnapshots(snapshots: Array<{ fieldName: string; value?: string | null; capturedAt?: Date }>): Map<string, { fieldName: string; value?: string | null }> {
  const byName = new Map<string, { fieldName: string; value?: string | null; capturedAt?: Date }>();
  for (const snapshot of snapshots) {
    const existing = byName.get(snapshot.fieldName);
    if (!existing || (snapshot.capturedAt?.getTime() ?? 0) >= (existing.capturedAt?.getTime() ?? 0)) {
      byName.set(snapshot.fieldName, snapshot);
    }
  }
  return byName;
}

function snapshotValue(snapshots: Map<string, { value?: string | null }>, fieldName: string): string | null | undefined {
  return snapshots.get(fieldName)?.value;
}

function normalizedFactValue(fact: ValidationFact): string {
  return (fact.normalizedValue || fact.rawValue || "").trim();
}

function isIncompleteFact(fact: ValidationFact): boolean {
  const value = normalizedFactValue(fact);
  if (!value) {
    return true;
  }
  if ((fact.factType === "decision_maker" || fact.factType === "approver") && /^(cfo|ceo|cio|cto|coo|ciso|legal|procurement|budget owner|final signer)$/i.test(value)) {
    return true;
  }
  return false;
}

function canonicalFactGroup(fact: ValidationFact): string {
  if (fact.factType === "stage_signal") return "StageName";
  if (fact.factType === "forecast_signal") return "ForecastCategoryName";
  if (fact.factType === "timeline_signal" || fact.factType === "close_date_risk") return "CloseDate";
  return FACT_CRM_FIELDS[fact.factType] ?? fact.suggestedCrmFieldMapping?.fieldName ?? fact.factType;
}

function deterministicFactId(fact: ValidationFact, index: number): string {
  return [fact.sourceId, fact.factType, fact.normalizedValue.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), index].join(":");
}

function factTime(fact: ValidationFact): number {
  return fact.sourceTimestamp?.getTime() ?? 0;
}

function isEmptyValue(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

function valuesAligned(current: string, extracted: string, factType: ValidationFact["factType"]): boolean {
  if (factType === "next_step_due_date") {
    return toDateOnly(current) === toDateOnly(extracted);
  }
  const left = normalizePhrase(current);
  const right = normalizePhrase(extracted);
  return left === right || left.includes(right) || right.includes(left);
}

function normalizePhrase(value: string): string {
  return value.toLowerCase().replace(/[_-]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function inferStage(value: string): string | undefined {
  const normalized = normalizePhrase(value);
  if (/closed won|signature complete/.test(normalized)) return "CLOSED_WON";
  if (/closed lost/.test(normalized)) return "CLOSED_LOST";
  if (/negotiat|quote|discount|redline|procurement|commercial/.test(normalized)) return "NEGOTIATION";
  if (/proposal/.test(normalized) && !/not ready/.test(normalized)) return "PROPOSAL";
  if (/demo|discovery|requirements|not ready for.+proposal|not ready for.+commercial/.test(normalized)) return "DISCOVERY";
  if (/qualif/.test(normalized)) return "QUALIFICATION";
  return undefined;
}

function inferForecast(value: string): string | undefined {
  const normalized = normalizePhrase(value);
  if (/not commit ready|not commit|not ready|unlikely|slip|pushed|at risk/.test(normalized)) return "PIPELINE";
  if (/closed|signed/.test(normalized)) return "CLOSED";
  if (/commit|committed/.test(normalized)) return "COMMIT";
  if (/best case/.test(normalized)) return "BEST_CASE";
  if (/omit/.test(normalized)) return "OMITTED";
  return undefined;
}

function isRiskFact(fact: ValidationFact): boolean {
  return ["risk", "risk_severity", "procurement_status", "legal_status", "security_status", "close_date_risk"].includes(fact.factType);
}

function isRisky(value: string): boolean {
  return /risk|block|delay|delayed|cannot|pending|not started|not reviewed|redline|stalled|slip|concern|critical|high/.test(normalizePhrase(value));
}

function isBlocker(value: string): boolean {
  return /block|delay|delayed|cannot|pending|not started|stalled|complete/.test(normalizePhrase(value));
}

function isLegalNotStartedOrPending(value: string): boolean {
  return /legal|contract|terms|redline|not reviewed|not started|pending|review/.test(normalizePhrase(value));
}

function isTimelineMismatch(value: string, closeDate: string): boolean {
  const extractedDate = toDateOnly(value);
  const crmDate = toDateOnly(closeDate);
  if (extractedDate && crmDate) {
    return extractedDate !== crmDate;
  }
  return /slip|pushed|delay|next month|next quarter|at risk/.test(normalizePhrase(value));
}

function isStaleNextStep(current: string, referenceDate: Date, staleDays: number): boolean {
  const date = toDateOnly(current);
  if (!date) {
    return false;
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const ageMs = referenceDate.getTime() - parsed.getTime();
  return ageMs > staleDays * 24 * 60 * 60 * 1000;
}

function isCloseDateWithinWindow(closeDate: Date | string | null | undefined, referenceDate: Date, days: number): boolean {
  if (!closeDate) return false;
  const date = typeof closeDate === "string" ? new Date(closeDate) : closeDate;
  const diff = date.getTime() - referenceDate.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function hasDueDate(value: string): boolean {
  return /\b20\d{2}-\d{2}-\d{2}\b|\b(?:monday|tuesday|wednesday|thursday|friday|today|tomorrow)\b/i.test(value);
}

function toDateOnly(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return toIsoDate(value) ?? undefined;
  const match = value.match(/\b20\d{2}-\d{2}-\d{2}\b/);
  return match?.[0];
}

function toIsoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function capSeverity(severity: ComparisonSeverity, maxSeverity: ComparisonSeverity): ComparisonSeverity {
  const order: ComparisonSeverity[] = ["low", "medium", "high"];
  return order[Math.min(order.indexOf(severity), order.indexOf(maxSeverity))];
}

function dedupeComparisons(comparisons: FieldComparison[]): FieldComparison[] {
  const byKey = new Map<string, FieldComparison>();
  for (const comparison of comparisons) {
    const key = [comparison.crmField, comparison.issueType, comparison.evidence.factId].join("|");
    const existing = byKey.get(key);
    if (!existing || severityRank(comparison.severity) > severityRank(existing.severity)) {
      byKey.set(key, comparison);
    }
  }
  return [...byKey.values()].sort((left, right) => left.crmField.localeCompare(right.crmField) || left.issueType.localeCompare(right.issueType));
}

function severityRank(severity: ComparisonSeverity): number {
  return { low: 0, medium: 1, high: 2 }[severity];
}

export {
  comparisonContextSchema,
  comparisonEvidenceSchema,
  comparisonIssueTypeSchema,
  comparisonOptionsSchema,
  comparisonSeveritySchema,
  crmSnapshotForComparisonSchema,
  fieldComparisonListSchema,
  fieldComparisonSchema,
  opportunityForComparisonSchema,
} from "./schemas";
export type {
  ComparisonContext,
  ComparisonCRMField,
  ComparisonEvidence,
  ComparisonIssueType,
  ComparisonOptions,
  ComparisonOpportunity,
  ComparisonSeverity,
  FieldComparison,
  FieldComparisonList,
} from "./types";
