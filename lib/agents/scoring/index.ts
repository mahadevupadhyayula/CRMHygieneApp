import {
  dimensionScoreSchema,
  forecastRiskLevelSchema,
  hygieneDimensionSchema,
  hygieneScoreResultSchema,
  scoringContextSchema,
  scoringCrmSnapshotSchema,
  scoringEvidenceSchema,
  scoringOptionsSchema,
  scoringOpportunitySchema,
} from "./schemas";
import type { DimensionScore, HygieneDimension, HygieneScoreResult, ScoringContext, ScoringEvidence } from "./types";
import type { FieldComparison } from "../comparison";
import type { ValidationFact, ValidationResult } from "../validation";

const DIMENSIONS: HygieneDimension[] = [
  "completeness",
  "freshness",
  "consistency",
  "forecast_support",
  "risk_visibility",
  "next_step_clarity",
  "stakeholder_clarity",
  "coordination_readiness",
];

const DEFAULT_WEIGHTS: Record<HygieneDimension, number> = {
  completeness: 1,
  freshness: 1,
  consistency: 1.25,
  forecast_support: 1.25,
  risk_visibility: 1,
  next_step_clarity: 1,
  stakeholder_clarity: 1,
  coordination_readiness: 1,
};

type MutableDimension = {
  dimension: HygieneDimension;
  score: number;
  weight: number;
  evidence: ScoringEvidence[];
  penaltyKeys: Set<string>;
};

type ParsedContext = ReturnType<typeof scoringContextSchema.parse>;

type RiskContribution = { key: string; points: number; message: string; evidence?: ScoringEvidence };

export class ScoringAgent {
  scoreOpportunity(input: ScoringContext): HygieneScoreResult {
    const context = scoringContextSchema.parse(input);
    const options = scoringOptionsSchema.parse(context.options ?? {});
    const snapshots = latestSnapshots(context.crmSnapshot);
    const dimensions = buildDimensions(options.weights);
    const evidence: ScoringEvidence[] = [];

    applyBaselineCompleteness(context, snapshots, dimensions, evidence);
    applyFreshness(context, snapshots, dimensions, evidence, options.referenceDate, options.staleActivityDays);
    applyFactSupport(context, snapshots, dimensions, evidence);
    applyComparisons(context.comparisons, dimensions, evidence);
    applyValidationResults(context.facts, context.validationResults, dimensions, evidence);
    applyCloseDatePressure(context, dimensions, evidence, options.referenceDate, options.urgentCloseWindowDays);

    const dimensionScores = DIMENSIONS.map((dimension) => finalizeDimension(dimensions[dimension]));
    const score = clampScore(Math.round(weightedAverage(dimensionScores)));
    const risk = forecastRisk(context, snapshots, evidence, options.referenceDate, options.urgentCloseWindowDays);
    const explanation = explain(score, risk.level, dimensionScores, risk.contributions);

    return hygieneScoreResultSchema.parse({
      score,
      riskLevel: risk.level,
      riskPoints: risk.points,
      dimensions: dimensionScores,
      explanation,
      evidence,
    });
  }
}

export function scoreOpportunity(input: ScoringContext): HygieneScoreResult {
  return new ScoringAgent().scoreOpportunity(input);
}

function buildDimensions(weights: Partial<Record<HygieneDimension, number>>): Record<HygieneDimension, MutableDimension> {
  const dimensions = {} as Record<HygieneDimension, MutableDimension>;
  for (const dimension of DIMENSIONS) {
    dimensions[dimension] = { dimension, score: 100, weight: weights[dimension] ?? DEFAULT_WEIGHTS[dimension], evidence: [], penaltyKeys: new Set<string>() };
  }
  return dimensions;
}

function applyBaselineCompleteness(context: ParsedContext, snapshots: Map<string, { value?: string | null; capturedAt?: Date }>, dimensions: Record<HygieneDimension, MutableDimension>, allEvidence: ScoringEvidence[]): void {
  const required = [
    { field: "StageName", value: snapshotValue(snapshots, "StageName") ?? context.opportunity?.stage ?? null, label: "stage" },
    { field: "ForecastCategoryName", value: snapshotValue(snapshots, "ForecastCategoryName") ?? context.opportunity?.forecastCategory ?? null, label: "forecast category" },
    { field: "Amount", value: snapshotValue(snapshots, "Amount") ?? valueToString(context.opportunity?.amount), label: "amount" },
    { field: "CloseDate", value: snapshotValue(snapshots, "CloseDate") ?? dateOnly(context.opportunity?.closeDate), label: "close date" },
    { field: "OwnerName", value: context.opportunity?.ownerName ?? null, label: "owner" },
  ];

  for (const item of required) {
    if (isBlank(item.value)) {
      addPenalty(dimensions.completeness, `missing:${item.field}`, 12, evidence("completeness", "medium", `CRM ${item.label} is missing, reducing completeness.`, item.field, item.value));
    } else {
      addPositive(dimensions.completeness, evidence("completeness", "positive", `CRM ${item.label} is present.`, item.field, item.value));
    }
  }

  if (context.contacts.length === 0) {
    addPenalty(dimensions.stakeholder_clarity, "missing:contacts", 20, evidence("stakeholder_clarity", "medium", "No opportunity contacts are available for stakeholder validation."));
  }

  if (isBlank(context.opportunity?.ownerName)) {
    const item = evidence("coordination_readiness", "high", "Opportunity has no owner, so coordination readiness is reduced.", "OwnerName", context.opportunity?.ownerName ?? null);
    addPenalty(dimensions.coordination_readiness, "missing:owner", 35, item);
    addPenalty(dimensions.completeness, "missing:owner", 12, item);
  }

  flushEvidence(dimensions, allEvidence);
}

function applyFreshness(context: ParsedContext, snapshots: Map<string, { value?: string | null; capturedAt?: Date }>, dimensions: Record<HygieneDimension, MutableDimension>, allEvidence: ScoringEvidence[], referenceDate: Date, staleActivityDays: number): void {
  const latestActivity = latestDate([
    ...context.sourceItems.map((source) => source.occurredAt ?? source.ingestedAt),
    parseDate(snapshotValue(snapshots, "LastActivityDate")),
  ]);

  if (!latestActivity) {
    addPenalty(dimensions.freshness, "missing:activity", 20, evidence("freshness", "medium", "No authorized source activity is available; freshness is uncertain but no unsupported risk is inferred."));
  } else {
    const age = ageDays(latestActivity, referenceDate);
    if (age > staleActivityDays) {
      addPenalty(dimensions.freshness, "stale:activity", Math.min(35, 10 + age - staleActivityDays), evidence("freshness", "medium", `Latest activity is ${age} days old, older than the ${staleActivityDays}-day freshness window.`, undefined, dateOnly(latestActivity)));
    } else {
      addPositive(dimensions.freshness, evidence("freshness", "positive", `Latest activity is current (${age} days old).`, undefined, dateOnly(latestActivity)));
    }
  }

  flushEvidence(dimensions, allEvidence);
}

function applyFactSupport(context: ParsedContext, snapshots: Map<string, { value?: string | null; capturedAt?: Date }>, dimensions: Record<HygieneDimension, MutableDimension>, allEvidence: ScoringEvidence[]): void {
  const factsByType = new Map<string, ValidationFact[]>();
  for (const fact of context.facts) {
    const list = factsByType.get(fact.factType) ?? [];
    list.push(fact);
    factsByType.set(fact.factType, list);
  }

  if (!hasValue(snapshots, "NextStep") && !factsByType.has("next_step")) {
    addPenalty(dimensions.next_step_clarity, "missing:next-step", 35, evidence("next_step_clarity", "high", "No CRM next step or extracted next-step evidence is available.", "NextStep", snapshotValue(snapshots, "NextStep") ?? null));
    addPenalty(dimensions.completeness, "missing:next-step", 10, evidence("completeness", "medium", "Next step is missing from both CRM fields and source evidence.", "NextStep", snapshotValue(snapshots, "NextStep") ?? null));
  } else {
    const fact = factsByType.get("next_step")?.[0];
    addPositive(dimensions.next_step_clarity, evidence("next_step_clarity", "positive", "Next-step evidence is available.", "NextStep", snapshotValue(snapshots, "NextStep") ?? null, fact?.normalizedValue, fact));
  }

  if (!hasValue(snapshots, "NextStepDueDate__c") && !factsByType.has("next_step_due_date") && factsByType.has("next_step")) {
    addPenalty(dimensions.next_step_clarity, "missing:next-step-due", 12, evidence("next_step_clarity", "medium", "Next step exists but no due date is captured in CRM or extracted evidence.", "NextStepDueDate__c", snapshotValue(snapshots, "NextStepDueDate__c") ?? null));
  }

  const stakeholder = stakeholderEvidence(context, snapshots, factsByType);
  if (!stakeholder.hasDecisionMaker) {
    addPenalty(dimensions.stakeholder_clarity, "missing:decision-maker", 30, evidence("stakeholder_clarity", "high", stakeholder.reason, "DecisionMaker__c", snapshotValue(snapshots, "DecisionMaker__c") ?? null));
  } else {
    addPositive(dimensions.stakeholder_clarity, evidence("stakeholder_clarity", "positive", stakeholder.reason, "DecisionMaker__c", snapshotValue(snapshots, "DecisionMaker__c") ?? null));
  }

  if (!hasForecastSupport(context, snapshots, factsByType)) {
    addPenalty(dimensions.forecast_support, "weak:forecast-support", 12, evidence("forecast_support", "low", "Forecast has CRM support but no direct source forecast signal; no contradiction is inferred from missing evidence alone.", "ForecastCategoryName", snapshotValue(snapshots, "ForecastCategoryName") ?? context.opportunity?.forecastCategory ?? null));
  }

  for (const fact of context.facts) {
    if (isBlockerFact(fact) && isOpenBlocker(normalized(fact.normalizedValue || fact.rawValue))) {
      addPenalty(dimensions.risk_visibility, `blocker:${fact.factType}`, 12, evidence("risk_visibility", "high", `${fact.factType} evidence indicates an open blocker: ${fact.evidenceText}`, fact.suggestedCrmFieldMapping?.fieldName, undefined, fact.normalizedValue, fact));
    }
  }

  flushEvidence(dimensions, allEvidence);
}

function applyComparisons(comparisons: FieldComparison[], dimensions: Record<HygieneDimension, MutableDimension>, allEvidence: ScoringEvidence[]): void {
  for (const comparison of comparisons) {
    const mapped = dimensionsForComparison(comparison);
    for (const item of mapped) {
      addPenalty(dimensions[item.dimension], `comparison:${comparison.crmField}:${comparison.issueType}`, item.penalty, evidenceFromComparison(item.dimension, comparison));
    }
  }
  flushEvidence(dimensions, allEvidence);
}

function applyValidationResults(facts: ValidationFact[], results: ValidationResult[], dimensions: Record<HygieneDimension, MutableDimension>, allEvidence: ScoringEvidence[]): void {
  const factById = factIdMap(facts);
  for (const result of results) {
    if (result.evidenceStatus !== "contradictory") continue;
    const fact = factById.get(result.factId);
    const item = evidence("consistency", "high", `Contradictory source evidence detected for ${fact?.factType ?? "a field"}: ${result.reasons.join(" ")}`, fact?.suggestedCrmFieldMapping?.fieldName, undefined, fact?.normalizedValue, fact);
    addPenalty(dimensions.consistency, `validation-contradiction:${fact?.factType ?? result.factId}`, 22, item);
    if (fact?.factType === "forecast_signal" || fact?.factType === "timeline_signal" || fact?.factType === "close_date_risk") {
      addPenalty(dimensions.forecast_support, `validation-contradiction:${fact.factType}`, 22, item);
    }
  }
  flushEvidence(dimensions, allEvidence);
}

function applyCloseDatePressure(context: ParsedContext, dimensions: Record<HygieneDimension, MutableDimension>, allEvidence: ScoringEvidence[], referenceDate: Date, urgentWindowDays: number): void {
  const closeDate = context.opportunity?.closeDate;
  if (!closeDate) return;
  const days = daysUntil(closeDate, referenceDate);
  if (days >= 0 && days <= urgentWindowDays && hasOpenBlocker(context.facts)) {
    const item = evidence("forecast_support", "high", `Close date is in ${days} days while blocker evidence is still open.`, "CloseDate", dateOnly(closeDate));
    addPenalty(dimensions.forecast_support, "urgent-close:blocker", 18, item);
    addPenalty(dimensions.risk_visibility, "urgent-close:blocker", 10, item);
  }
  flushEvidence(dimensions, allEvidence);
}

function forecastRisk(context: ParsedContext, snapshots: Map<string, { value?: string | null; capturedAt?: Date }>, allEvidence: ScoringEvidence[], referenceDate: Date, urgentCloseWindowDays: number): { level: "Low" | "Medium" | "High" | "Critical"; points: number; contributions: RiskContribution[] } {
  const contributions = new Map<string, RiskContribution>();
  const add = (key: string, points: number, message: string, item?: ScoringEvidence) => {
    const existing = contributions.get(key);
    if (!existing || points > existing.points) contributions.set(key, { key, points, message, evidence: item });
  };

  for (const comparison of context.comparisons) {
    const points = comparison.severity === "high" ? 28 : comparison.severity === "medium" ? 14 : 6;
    if (["forecast_mismatch", "timeline_mismatch", "stage_mismatch"].includes(comparison.issueType)) {
      add(`comparison:${comparison.crmField}:${comparison.issueType}`, points, `${comparison.issueType} on ${comparison.crmField}.`, evidenceFromComparison("forecast_support", comparison));
    }
    if (comparison.issueType === "hidden_risk") {
      add(`hidden-risk:${comparison.crmField}`, Math.max(points, 10), `Hidden risk evidence is not reflected in ${comparison.crmField}.`, evidenceFromComparison("risk_visibility", comparison));
    }
  }

  for (const fact of context.facts) {
    const value = normalized(fact.normalizedValue || fact.rawValue);
    if (isBlockerFact(fact) && isOpenBlocker(value)) {
      const base = fact.factType === "procurement_status" || fact.factType === "legal_status" || fact.factType === "security_status" ? 22 : 14;
      add(`blocker:${fact.factType}`, base, `${fact.factType} indicates an open blocker: ${fact.normalizedValue || fact.rawValue}.`, evidence("risk_visibility", "high", `${fact.factType} blocker evidence: ${fact.evidenceText}`, fact.suggestedCrmFieldMapping?.fieldName, undefined, fact.normalizedValue, fact));
    }
  }

  for (const result of context.validationResults) {
    if (result.evidenceStatus === "contradictory") {
      const fact = factIdMap(context.facts).get(result.factId);
      add(`contradiction:${fact?.factType ?? result.factId}`, fact?.factType === "forecast_signal" ? 28 : 16, `Contradictory evidence requires review for ${fact?.factType ?? result.factId}.`);
    }
  }

  const openOperationalBlockerTypes = new Set(context.facts.filter((fact) => ["procurement_status", "legal_status", "security_status"].includes(fact.factType) && isOpenBlocker(normalized(fact.normalizedValue || fact.rawValue))).map((fact) => fact.factType));
  if (openOperationalBlockerTypes.size >= 3) add("blocker:multi-operational", 25, "Procurement, legal, and security blockers are all open.");

  const closeDate = context.opportunity?.closeDate;
  if (closeDate) {
    const days = daysUntil(closeDate, referenceDate);
    if (days < 0) add("close:past", 30, "Close date is in the past.");
    if (days >= 0 && days <= urgentCloseWindowDays && hasOpenBlocker(context.facts)) add("close:urgent-blocker", 24, `Close date is within ${urgentCloseWindowDays} days while blockers remain open.`);
  }

  if (!hasValue(snapshots, "NextStep") && !context.facts.some((fact) => fact.factType === "next_step")) add("missing:next-step", 10, "Missing next step creates execution risk.");
  if (isBlank(context.opportunity?.ownerName)) add("missing:owner", 12, "Missing owner creates coordination risk.");
  if (context.sourceItems.length === 0) add("missing:sources", 20, "No authorized notes/source items are available, so risk is medium-confidence rather than critical.");

  let points = [...contributions.values()].reduce((sum, contribution) => sum + contribution.points, 0);
  if (openOperationalBlockerTypes.size === 1) points = Math.min(points, 84);
  const onlyUnsupportedMissingData = context.comparisons.length === 0 && context.facts.length === 0 && context.sourceItems.length === 0;
  if (onlyUnsupportedMissingData) points = Math.min(points, 35);

  for (const contribution of contributions.values()) {
    if (contribution.evidence) allEvidence.push(contribution.evidence);
  }

  return { level: riskLevel(points), points, contributions: [...contributions.values()].sort((a, b) => b.points - a.points) };
}

function dimensionsForComparison(comparison: FieldComparison): Array<{ dimension: HygieneDimension; penalty: number }> {
  const penalty = comparison.severity === "high" ? 28 : comparison.severity === "medium" ? 16 : 8;
  switch (comparison.issueType) {
    case "forecast_mismatch": return [{ dimension: "forecast_support", penalty }, { dimension: "consistency", penalty: Math.round(penalty * 0.9) }];
    case "stage_mismatch": return [{ dimension: "consistency", penalty }, { dimension: "forecast_support", penalty: Math.round(penalty * 0.7) }];
    case "timeline_mismatch": return [{ dimension: "forecast_support", penalty }, { dimension: "freshness", penalty: 10 }];
    case "hidden_risk": return [{ dimension: "risk_visibility", penalty }, { dimension: "forecast_support", penalty: 10 }];
    case "missing_task": return [{ dimension: "next_step_clarity", penalty }, { dimension: "coordination_readiness", penalty: 8 }];
    case "missing_stakeholder": return [{ dimension: "stakeholder_clarity", penalty }, { dimension: "completeness", penalty: 8 }];
    case "missing_owner": return [{ dimension: "coordination_readiness", penalty }, { dimension: "completeness", penalty: 8 }];
    case "stale_field": {
      const items: Array<{ dimension: HygieneDimension; penalty: number }> = [{ dimension: "freshness", penalty }];
      if (comparison.crmField.toLowerCase().includes("next")) items.push({ dimension: "next_step_clarity", penalty: 12 });
      return items;
    }
    case "contradiction": return [{ dimension: "consistency", penalty }, { dimension: fieldDimension(comparison.crmField), penalty: 10 }];
    case "empty_field": return [{ dimension: "completeness", penalty }, { dimension: fieldDimension(comparison.crmField), penalty: 10 }];
  }
}

function fieldDimension(field: string): HygieneDimension {
  if (/next/i.test(field)) return "next_step_clarity";
  if (/decision|approver|champion/i.test(field)) return "stakeholder_clarity";
  if (/owner/i.test(field)) return "coordination_readiness";
  if (/risk|legal|security|procurement/i.test(field)) return "risk_visibility";
  if (/forecast|close|stage/i.test(field)) return "forecast_support";
  return "completeness";
}

function addPenalty(dimension: MutableDimension, key: string, amount: number, item: ScoringEvidence): void {
  if (dimension.penaltyKeys.has(key)) return;
  dimension.penaltyKeys.add(key);
  dimension.score = clampScore(dimension.score - amount);
  dimension.evidence.push(item);
}

function addPositive(dimension: MutableDimension, item: ScoringEvidence): void {
  if (dimension.evidence.length < 3) dimension.evidence.push(item);
}

function flushEvidence(dimensions: Record<HygieneDimension, MutableDimension>, allEvidence: ScoringEvidence[]): void {
  for (const dimension of Object.values(dimensions)) {
    for (const item of dimension.evidence) {
      if (!allEvidence.some((existing) => existing.dimension === item.dimension && existing.message === item.message && existing.crmField === item.crmField)) allEvidence.push(item);
    }
  }
}

function finalizeDimension(dimension: MutableDimension): DimensionScore {
  const score = clampScore(Math.round(dimension.score));
  const explanation = dimension.evidence.find((item) => item.severity !== "positive")?.message ?? `${humanDimension(dimension.dimension)} is healthy based on available CRM fields and evidence.`;
  return dimensionScoreSchema.parse({ dimension: dimension.dimension, score, weight: dimension.weight, explanation, evidence: dimension.evidence });
}

function weightedAverage(dimensions: DimensionScore[]): number {
  const totalWeight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  return dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) / totalWeight;
}

function explain(score: number, level: string, dimensions: DimensionScore[], contributions: RiskContribution[]): string {
  const weakest = [...dimensions].sort((a, b) => a.score - b.score).slice(0, 2).map((dimension) => `${humanDimension(dimension.dimension)} ${dimension.score}`).join(", ");
  const riskText = contributions.length ? contributions.slice(0, 3).map((item) => item.message).join(" ") : "No supported forecast-risk evidence was found.";
  return `Hygiene score ${score}/100 with ${level} forecast risk. Weakest dimensions: ${weakest}. ${riskText}`;
}

function evidence(dimension: HygieneDimension, severity: ScoringEvidence["severity"], message: string, crmField?: string, currentValue?: string | null, extractedValue?: string, fact?: ValidationFact): ScoringEvidence {
  return {
    dimension,
    severity,
    message,
    crmField,
    currentValue,
    extractedValue,
    sourceId: fact?.sourceId,
    factId: fact?.factId,
    evidenceText: fact?.evidenceText || undefined,
  };
}

function evidenceFromComparison(dimension: HygieneDimension, comparison: FieldComparison): ScoringEvidence {
  return {
    dimension,
    severity: comparison.severity,
    message: `${comparison.issueType} on ${comparison.crmField}: CRM value ${display(comparison.currentValue)} differs from evidence ${display(comparison.extractedValue)}. Evidence: ${comparison.evidence.evidenceText}`,
    crmField: comparison.crmField,
    currentValue: comparison.currentValue,
    extractedValue: comparison.extractedValue,
    sourceId: comparison.evidence.sourceId,
    factId: comparison.evidence.factId,
    evidenceText: comparison.evidence.evidenceText,
    comparisonIssueType: comparison.issueType,
  };
}

function stakeholderEvidence(context: ParsedContext, snapshots: Map<string, { value?: string | null }>, factsByType: Map<string, ValidationFact[]>): { hasDecisionMaker: boolean; reason: string } {
  if (hasValue(snapshots, "DecisionMaker__c") || factsByType.has("decision_maker")) return { hasDecisionMaker: true, reason: "Decision-maker is present in CRM or extracted evidence." };
  const dmContact = context.contacts.find((contact) => /economic buyer|decision maker|owner|cfo|ceo|coo|cio|cto|vp/i.test(`${contact.opportunityRole ?? ""} ${contact.title ?? ""}`));
  if (dmContact) return { hasDecisionMaker: true, reason: `Stakeholder contact ${contactName(dmContact)} has role/title evidence for decision-maker coverage.` };
  return { hasDecisionMaker: false, reason: "No decision-maker is present in CRM fields, extracted facts, or opportunity contact roles." };
}

function hasForecastSupport(context: ParsedContext, snapshots: Map<string, { value?: string | null }>, factsByType: Map<string, ValidationFact[]>): boolean {
  return hasValue(snapshots, "ForecastCategoryName") || Boolean(context.opportunity?.forecastCategory) || factsByType.has("forecast_signal") || factsByType.has("stage_signal");
}

function hasOpenBlocker(facts: ValidationFact[]): boolean {
  return facts.some((fact) => isBlockerFact(fact) && isOpenBlocker(normalized(fact.normalizedValue || fact.rawValue)));
}

function isBlockerFact(fact: ValidationFact): boolean {
  return ["risk", "risk_severity", "procurement_status", "legal_status", "security_status", "close_date_risk"].includes(fact.factType);
}

function isOpenBlocker(value: string): boolean {
  return /block|cannot|pending|not approved|not started|not reviewed|delay|delayed|stalled|redline|open|at risk|critical|high|slip|complete/.test(value);
}

function latestSnapshots(snapshots: ParsedContext["crmSnapshot"]): Map<string, { value?: string | null; capturedAt?: Date }> {
  const byName = new Map<string, { value?: string | null; capturedAt?: Date }>();
  for (const snapshot of snapshots) {
    const existing = byName.get(snapshot.fieldName);
    if (!existing || (snapshot.capturedAt?.getTime() ?? 0) >= (existing.capturedAt?.getTime() ?? 0)) byName.set(snapshot.fieldName, snapshot);
  }
  return byName;
}

function snapshotValue(snapshots: Map<string, { value?: string | null }>, field: string): string | null | undefined { return snapshots.get(field)?.value; }
function hasValue(snapshots: Map<string, { value?: string | null }>, field: string): boolean { return !isBlank(snapshotValue(snapshots, field)); }
function isBlank(value: unknown): boolean { return value === null || value === undefined || (typeof value === "string" && value.trim() === ""); }
function normalized(value: string): string { return value.toLowerCase().replace(/[_-]/g, " ").replace(/[^a-z0-9]+/g, " ").trim(); }
function clampScore(value: number): number { return Math.max(0, Math.min(100, value)); }
function riskLevel(points: number): "Low" | "Medium" | "High" | "Critical" { if (points >= 85) return "Critical"; if (points >= 45) return "High"; if (points >= 20) return "Medium"; return "Low"; }
function dateOnly(value: Date | string | null | undefined): string | null { if (!value) return null; const date = typeof value === "string" ? new Date(value) : value; return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10); }
function parseDate(value: string | null | undefined): Date | undefined { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date; }
function latestDate(values: Array<Date | null | undefined>): Date | undefined { return values.filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime())).sort((a, b) => b.getTime() - a.getTime())[0]; }
function ageDays(value: Date, reference: Date): number { return Math.max(0, Math.floor((reference.getTime() - value.getTime()) / 86_400_000)); }
function daysUntil(value: Date, reference: Date): number { return Math.ceil((value.getTime() - reference.getTime()) / 86_400_000); }
function valueToString(value: number | null | undefined): string | null { return value === null || value === undefined ? null : String(value); }
function display(value: string | null | undefined): string { return value === null || value === undefined || value === "" ? "<empty>" : `"${value}"`; }
function humanDimension(dimension: HygieneDimension): string { return dimension.replace(/_/g, " "); }
function contactName(contact: { fullName?: string | null; firstName?: string | null; lastName?: string | null }): string { return contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "unknown contact"; }
function factIdMap(facts: ValidationFact[]): Map<string, ValidationFact> { return new Map(facts.map((fact, index) => [fact.factId ?? [fact.sourceId, fact.factType, fact.normalizedValue.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), index].join(":"), fact])); }

export {
  dimensionScoreSchema,
  forecastRiskLevelSchema,
  hygieneDimensionSchema,
  hygieneScoreResultSchema,
  scoringContextSchema,
  scoringCrmSnapshotSchema,
  scoringEvidenceSchema,
  scoringOptionsSchema,
  scoringOpportunitySchema,
} from "./schemas";
export type {
  DimensionScore,
  ForecastRiskLevel,
  HygieneDimension,
  HygieneScoreResult,
  ScoringContext,
  ScoringCRMSnapshot,
  ScoringEvidence,
  ScoringOptions,
  ScoringOpportunity,
} from "./types";
