import { extractedFactListSchema, extractionContextSchema } from "./schemas";
import type { AIModelProvider } from "./provider";
import type { ExtractedFact, ExtractedFactType, ExtractionContext, ExtractionSourceItem, SourceItemMatchStatus } from "./types";

type FactCandidate = {
  factType: ExtractedFactType;
  rawValue: string;
  normalizedValue?: string;
  confidence: number;
  startIndex?: number;
};

const FACT_MAPPINGS: Record<ExtractedFactType, { objectName: string; fieldName: string; fieldLabel: string }> = {
  next_step: { objectName: "Opportunity", fieldName: "NextStep", fieldLabel: "Next Step" },
  next_step_owner: { objectName: "Opportunity", fieldName: "NextStepOwner__c", fieldLabel: "Next-Step Owner" },
  next_step_due_date: { objectName: "Opportunity", fieldName: "NextStepDueDate__c", fieldLabel: "Next-Step Due Date" },
  decision_maker: { objectName: "Opportunity", fieldName: "DecisionMaker__c", fieldLabel: "Decision Maker" },
  approver: { objectName: "Opportunity", fieldName: "Approver__c", fieldLabel: "Approver" },
  champion: { objectName: "Opportunity", fieldName: "Champion__c", fieldLabel: "Champion" },
  risk: { objectName: "Opportunity", fieldName: "Risk__c", fieldLabel: "Risk" },
  risk_severity: { objectName: "Opportunity", fieldName: "RiskSeverity__c", fieldLabel: "Risk Severity" },
  timeline_signal: { objectName: "Opportunity", fieldName: "TimelineSignal__c", fieldLabel: "Timeline Signal" },
  close_date_risk: { objectName: "Opportunity", fieldName: "CloseDateRisk__c", fieldLabel: "Close Date Risk" },
  stage_signal: { objectName: "Opportunity", fieldName: "StageSignal__c", fieldLabel: "Stage Signal" },
  forecast_signal: { objectName: "Opportunity", fieldName: "ForecastSignal__c", fieldLabel: "Forecast Signal" },
  procurement_status: { objectName: "Opportunity", fieldName: "ProcurementStatus__c", fieldLabel: "Procurement Status" },
  legal_status: { objectName: "Opportunity", fieldName: "LegalStatus__c", fieldLabel: "Legal Status" },
  security_status: { objectName: "Opportunity", fieldName: "SecurityStatus__c", fieldLabel: "Security Status" },
  internal_owner_needed: { objectName: "Opportunity", fieldName: "InternalOwnerNeeded__c", fieldLabel: "Internal Owner Needed" },
};

const STATUS_PATTERNS: Array<{ factType: ExtractedFactType; pattern: RegExp; confidence: number }> = [
  { factType: "procurement_status", pattern: /procurement\s+(?:is\s+)?(?:status\s*[:=-]\s*)?([^.;\n]+)/gi, confidence: 0.82 },
  { factType: "legal_status", pattern: /legal\s+(?:is\s+)?(?:status\s*[:=-]\s*)?([^.;\n]+)/gi, confidence: 0.82 },
  { factType: "security_status", pattern: /security\s+(?:is\s+)?(?:status\s*[:=-]\s*)?([^.;\n]+)/gi, confidence: 0.82 },
];

export class MockModelProvider implements AIModelProvider {
  async extractDealFacts(contextInput: ExtractionContext): Promise<ExtractedFact[]> {
    const context = extractionContextSchema.parse(contextInput);
    const facts: ExtractedFact[] = [];

    for (const sourceItem of context.sourceItems) {
      const text = sourceText(sourceItem);
      const timestamp = sourceTimestamp(sourceItem);
      if (!text || !timestamp) {
        continue;
      }

      for (const candidate of extractCandidates(text)) {
        facts.push(buildFact(candidate, text, sourceItem, timestamp));
      }
    }

    return extractedFactListSchema.parse(dedupeFacts(facts));
  }
}

function extractCandidates(text: string): FactCandidate[] {
  return [
    ...extractLabeledFacts(text),
    ...extractStatusFacts(text),
    ...extractKeywordFacts(text),
  ];
}

function extractLabeledFacts(text: string): FactCandidate[] {
  const candidates: FactCandidate[] = [];
  const labeledPatterns: Array<{ factType: ExtractedFactType; pattern: RegExp; confidence: number; normalize?: (value: string) => string }> = [
    { factType: "next_step", pattern: /next\s*step\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.9 },
    { factType: "next_step_owner", pattern: /next[-\s]*step\s*owner\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.9 },
    { factType: "next_step_due_date", pattern: /next[-\s]*step\s*due(?:\s*date)?\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.88, normalize: normalizeDateLike },
    { factType: "decision_maker", pattern: /decision[-\s]*maker\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.88 },
    { factType: "approver", pattern: /approver\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.88 },
    { factType: "champion", pattern: /champion\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.88 },
    { factType: "risk", pattern: /risk\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.84 },
    { factType: "risk_severity", pattern: /risk\s*severity\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.88, normalize: normalizeSeverity },
    { factType: "timeline_signal", pattern: /timeline\s*signal\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.84 },
    { factType: "close_date_risk", pattern: /close\s*date\s*risk\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.86 },
    { factType: "stage_signal", pattern: /stage\s*signal\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.84 },
    { factType: "forecast_signal", pattern: /forecast\s*signal\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.84 },
    { factType: "internal_owner_needed", pattern: /internal\s*owner\s*needed\s*[:=-]\s*([^.;\n]+)/gi, confidence: 0.86 },
  ];

  for (const item of labeledPatterns) {
    item.pattern.lastIndex = 0;
    for (const match of text.matchAll(item.pattern)) {
      const rawValue = cleanValue(match[1]);
      if (rawValue) {
        candidates.push({
          factType: item.factType,
          rawValue,
          normalizedValue: item.normalize ? item.normalize(rawValue) : normalizeValue(rawValue),
          confidence: item.confidence,
          startIndex: valueIndex(match),
        });
      }
    }
  }

  return candidates;
}

function extractStatusFacts(text: string): FactCandidate[] {
  const candidates: FactCandidate[] = [];
  for (const item of STATUS_PATTERNS) {
    item.pattern.lastIndex = 0;
    for (const match of text.matchAll(item.pattern)) {
      const rawValue = cleanValue(match[1]);
      if (rawValue) {
        candidates.push({
          factType: item.factType,
          rawValue,
          normalizedValue: normalizeValue(rawValue),
          confidence: item.confidence,
          startIndex: valueIndex(match),
        });
      }
    }
  }
  return candidates;
}

function extractKeywordFacts(text: string): FactCandidate[] {
  const candidates: FactCandidate[] = [];
  addKeywordFact(candidates, text, "risk", /\b(blocked|blocker|at risk|concern|delay|delayed|slipping|stalled)\b/i, 0.68);
  addKeywordFact(candidates, text, "risk", /\b(?:budget\s+pushed|competitor\s+mentioned|discount\s+requested)\b/i, 0.68);
  addKeywordFact(candidates, text, "risk_severity", /\b(critical|high|medium|low)\s+risk\b/i, 0.7, (match) => normalizeSeverity(match[1]));
  addKeywordFact(candidates, text, "timeline_signal", /\b(this quarter|next quarter|end of month|by (?:monday|tuesday|wednesday|thursday|friday)|go-live|launch)\b/i, 0.66);
  addKeywordFact(candidates, text, "close_date_risk", /\b(close date|closing)\s+(?:is\s+)?(?:at risk|slipping|pushed|delayed)\b/i, 0.72);
  addKeywordFact(candidates, text, "stage_signal", /\b(?:ready for|moving to|moved to|exit criteria for)\s+([A-Za-z][A-Za-z\s-]{2,40})\b/i, 0.64, (match) => normalizeValue(match[1]));
  addKeywordFact(candidates, text, "decision_maker", /\b(CFO|CEO|CIO|CTO|COO|CISO)\b(?=\s+approval\s+required)/i, 0.7);
  addKeywordFact(candidates, text, "next_step", /\bfollow\s+up\s+soon\b/i, 0.45);
  addKeywordFact(candidates, text, "procurement_status", /\brequested\s+by\s+procurement\b/i, 0.68);
  addKeywordFact(candidates, text, "internal_owner_needed", /\bneed(?:s|ed)?\s+(?:an?\s+)?internal\s+owner\b/i, 0.76, () => "true");
  return candidates;
}

function addKeywordFact(candidates: FactCandidate[], text: string, factType: ExtractedFactType, pattern: RegExp, confidence: number, normalize?: (match: RegExpMatchArray) => string): void {
  const match = text.match(pattern);
  if (!match || match.index === undefined) {
    return;
  }
  const rawValue = cleanValue(match[0]);
  const normalizedValue = normalize ? normalize(match) : normalizeValue(rawValue);
  candidates.push({
    factType,
    rawValue,
    normalizedValue,
    confidence,
    startIndex: match.index,
  });
}

function buildFact(candidate: FactCandidate, text: string, sourceItem: ExtractionSourceItem, timestamp: Date): ExtractedFact {
  const sourceMatchStatus = getSourceMatchStatus(sourceItem);
  const confidenceBand = confidenceBandFor(candidate.confidence);
  const mapping = FACT_MAPPINGS[candidate.factType];
  return {
    factType: candidate.factType,
    rawValue: candidate.rawValue,
    normalizedValue: candidate.normalizedValue ?? normalizeValue(candidate.rawValue),
    evidenceText: evidenceSnippet(text, candidate.startIndex ?? text.indexOf(candidate.rawValue), candidate.rawValue.length),
    sourceId: sourceItem.id,
    sourceTimestamp: timestamp,
    confidence: roundConfidence(candidate.confidence),
    confidenceBand,
    suggestedCrmFieldMapping: {
      objectName: mapping.objectName,
      fieldName: mapping.fieldName,
      fieldLabel: mapping.fieldLabel,
      confidence: 1,
    },
    recommendationEligible: confidenceBand !== "low" && sourceMatchStatus === "matched",
    sourceMatchStatus,
  };
}

function sourceText(sourceItem: ExtractionSourceItem): string {
  return normalizeWhitespace([sourceItem.title, sourceItem.body].filter(Boolean).join(". "));
}

function sourceTimestamp(sourceItem: ExtractionSourceItem): Date | undefined {
  return sourceItem.occurredAt ?? sourceItem.ingestedAt ?? undefined;
}

function getSourceMatchStatus(sourceItem: ExtractionSourceItem): SourceItemMatchStatus {
  if (sourceItem.matchStatus) {
    return sourceItem.matchStatus;
  }
  const metadataStatus = sourceItem.metadata?.matchStatus;
  if (metadataStatus === "matched" || metadataStatus === "ambiguous" || metadataStatus === "unmatched") {
    return metadataStatus;
  }
  return "matched";
}

function valueIndex(match: RegExpMatchArray): number {
  const fullIndex = match.index ?? 0;
  return fullIndex + match[0].lastIndexOf(match[1]);
}

function evidenceSnippet(text: string, index: number, length: number): string {
  const safeIndex = Math.max(0, index);
  const start = Math.max(0, safeIndex - 60);
  const end = Math.min(text.length, safeIndex + length + 60);
  return normalizeWhitespace(`${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`);
}

function dedupeFacts(facts: ExtractedFact[]): ExtractedFact[] {
  const byKey = new Map<string, ExtractedFact>();
  for (const fact of facts) {
    const key = [fact.sourceId, fact.factType, fact.normalizedValue.toLowerCase()].join("|");
    const existing = byKey.get(key);
    if (!existing || fact.confidence > existing.confidence) {
      byKey.set(key, fact);
    }
  }
  return [...byKey.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.factType.localeCompare(right.factType) || right.confidence - left.confidence);
}

function cleanValue(value: string): string {
  return normalizeWhitespace(value.replace(/^[\s:=-]+|[\s.;,]+$/g, ""));
}

function normalizeValue(value: string): string {
  return cleanValue(value).toLowerCase();
}

function normalizeDateLike(value: string): string {
  return cleanValue(value).replace(/\s+/g, " ");
}

function normalizeSeverity(value: string): string {
  const normalized = normalizeValue(value);
  if (normalized.includes("critical")) {
    return "critical";
  }
  if (normalized.includes("high")) {
    return "high";
  }
  if (normalized.includes("medium")) {
    return "medium";
  }
  if (normalized.includes("low")) {
    return "low";
  }
  return normalized;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function confidenceBandFor(confidence: number): "low" | "medium" | "high" {
  if (confidence < 0.5) {
    return "low";
  }
  if (confidence < 0.75) {
    return "medium";
  }
  return "high";
}

function roundConfidence(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}
