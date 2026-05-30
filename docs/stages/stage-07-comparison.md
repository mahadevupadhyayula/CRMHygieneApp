# Stage 7 — CRM Field Comparison Engine

Stage 7 compares validated extracted facts with the latest CRM field snapshots for an opportunity. The engine is deterministic and schema-validated. It does not persist `FieldComparison` rows or generate recommendations; downstream stages can decide which comparisons become recommendations.

## Scope

The comparison engine lives in `lib/agents/comparison` and accepts:

- current opportunity metadata such as stage, forecast category, close date, and owner;
- latest CRM field snapshots;
- extracted facts from Stage 5;
- validation results from Stage 6.

It excludes rejected facts, stale-source validation results, and facts from ambiguous or unmatched source records.

## Supported Issue Types

The engine emits the Stage 7 `FieldComparison` shape for these issue types:

- `empty_field`
- `stale_field`
- `contradiction`
- `timeline_mismatch`
- `missing_task`
- `hidden_risk`
- `stage_mismatch`
- `forecast_mismatch`
- `missing_stakeholder`
- `missing_owner`

## Output Shape

```ts
type FieldComparison = {
  crmField: string;
  currentValue: string | null;
  extractedValue: string;
  issueType: ComparisonIssueType;
  severity: "low" | "medium" | "high";
  evidence: {
    factId: string;
    sourceId: string;
    sourceTimestamp: Date;
    evidenceText: string;
    validationStatus: "valid" | "needs_review";
    confidence: number;
  };
  recommendationEligible: boolean;
};
```

## Guardrails

- Rejected facts never create comparisons.
- Ambiguous and unmatched source matches never create comparisons.
- Stale source evidence is ignored so old notes do not create fresh CRM conflicts.
- Low-confidence or review-only facts may be surfaced, but severity is capped below `high` and `recommendationEligible` is false.
- For multiple facts targeting the same CRM field, the newest validated fact wins. This lets resolved newer notes override older notes.
- Incomplete stakeholder evidence such as a role-only `CFO` does not populate an empty decision-maker field.

## Heuristics

- `StageName` mismatches are inferred from stage signals such as discovery requirements, proposal readiness, quote language, discounting, redlines, and procurement/commercial negotiation terms.
- `ForecastCategoryName` mismatches are inferred from commit, best-case, not-commit-ready, slip, and closed/signed language.
- `CloseDate` timeline mismatches are emitted when evidence gives a conflicting date or when close is within the urgent window while legal has not started or is still pending.
- Hidden risks are emitted when risk/process evidence mentions blockers, delays, pending legal/security/procurement work, redlines, or stalled activity while `Risk__c` is empty.
- Next-step comparisons detect stale CRM dates and missing due dates.
