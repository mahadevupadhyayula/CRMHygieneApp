# Stage 06 — Validation Agent

## Goal

Validate extracted facts before they can influence CRM comparison, hygiene scoring, recommendations, approvals, or writeback.

## Scope

Stage 6 implements a deterministic Validation Agent that consumes Stage 5 `ExtractedFact`-shaped records and source authorization metadata. It decides whether each fact is safe to use, needs human review, or must be rejected.

## Input

- Extracted facts with fact type, values, evidence text, source ID, source timestamp, confidence, recommendation eligibility, and match status.
- Optional source metadata keyed by source ID, including visibility and authorization scope.
- Validation options for reference date, freshness window, confidence threshold, and strict recommendation-eligibility enforcement.

## Output

```ts
type ValidationResult = {
  factId: string;
  status: "valid" | "needs_review" | "rejected";
  reasons: string[];
  confidence: number;
  actionRisk: "low" | "medium" | "high";
  evidenceStatus:
    | "present"
    | "missing"
    | "unauthorized"
    | "missing_timestamp"
    | "stale"
    | "contradictory"
    | "inference_only";
};
```

## Validation Checks

- Evidence exists.
- Source is authorized and not private.
- Source timestamp is available.
- Fact is recent enough for the configured freshness window.
- Confidence meets the configured threshold.
- Contradictory facts are flagged for review.
- Role-only stakeholders and ambiguous dates are incomplete enough to require review.
- Action risk is assigned deterministically from fact type.
- Facts marked as inference are separated from directly evidenced facts.

## Invariants

- Evidence-free facts are rejected.
- Private or unauthorized facts are rejected even when confidence is high.
- Low-confidence or stale facts are never treated as fully valid.
- Contradictions are preserved as reviewable evidence rather than being silently resolved.
- Validation does not extract facts, compare CRM fields, score hygiene, create recommendations, create approvals, write audit records, or write back to CRM.

## Tests

- Unit tests cover every validation check and requested edge case.
- Fixture-backed tests run Stage 5 deterministic extraction output through the Stage 6 validator.
