# Stage 8 — Hygiene Score and Forecast Risk Engine

Stage 8 adds the deterministic scoring layer in `lib/agents/scoring`. It consumes CRM context, extracted facts, Stage 6 validation results, and Stage 7 field comparisons to produce a bounded opportunity hygiene score, forecast risk level, and evidence-backed explanation.

## Scope

The scoring engine accepts:

- opportunity metadata, including owner, stage, forecast category, amount, and close date;
- latest CRM field snapshots;
- contacts and source activity from ingestion;
- extracted facts and validation results;
- field comparisons emitted by Stage 7;
- optional admin-configured dimension weights.

It returns a pure, schema-validated result. Stage 8 does not persist `HygieneScore` rows, generate recommendations, request approvals, or write back to CRM.

## Hygiene Dimensions

Each opportunity is scored from 0 to 100 across eight PRD dimensions:

- `completeness`
- `freshness`
- `consistency`
- `forecast_support`
- `risk_visibility`
- `next_step_clarity`
- `stakeholder_clarity`
- `coordination_readiness`

The overall score is a weighted average of these dimension scores. Defaults emphasize consistency and forecast support slightly more than other dimensions. Callers can override weights through `options.weights`, which supports admin-configured weighting without changing rule code.

## Forecast Risk Levels

The engine emits one of four risk levels:

- `Low`
- `Medium`
- `High`
- `Critical`

Risk is driven only by supported evidence: Stage 7 comparisons, validated contradictory evidence, explicit blocker facts, urgent close-date pressure, and missing execution basics such as no next step or no owner. Missing source data alone is capped so the engine does not hallucinate unsupported critical risk.

## Evidence and Explanation

Every negative dimension movement produces an evidence item that identifies the underlying CRM field, comparison issue, fact, source, and evidence text where available. The top-level explanation summarizes:

- the overall score;
- the forecast risk level;
- the weakest hygiene dimensions;
- the strongest risk contributions.

This keeps score outputs auditable and tied to underlying comparisons rather than opaque model judgments.

## Guardrails

- Scores are clamped to the inclusive range 0–100.
- Duplicate comparison issues are keyed by field and issue type to avoid double-counting the same issue.
- Missing notes or facts can reduce freshness and clarity, but do not create unsupported blocker or contradiction risk.
- Procurement, legal, and security blockers increase forecast risk only when they appear in extracted fact evidence.
- A single operational blocker can make a deal high risk; critical risk requires broader compounding evidence.
- Admin weights affect the overall score but not the underlying dimension scores or evidence.

## Test Coverage

Stage 8 adds:

- exhaustive unit coverage for healthy scores, missing next steps, forecast contradictions, close-date pressure, procurement/legal/security blockers, missing decision makers, missing owners, issue resolution, score clamps, unsupported missing-data risk, duplicate issue handling, and admin weights;
- fixture-backed integration coverage for healthy deals, commit deals with procurement blockers, no-note deals with current CRM fields, and contradictory manager/customer notes.
