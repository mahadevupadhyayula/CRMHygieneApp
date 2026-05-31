# Stage 14 — Evaluation Harness and Regression Suite

## Scope

Stage 14 adds a durable eval harness under `tests/evals` that exercises the full quality path for deal hygiene analysis:

1. deterministic extraction with the mock structured extraction provider,
2. validation of evidence, authorization, recency, ambiguity, and contradictions,
3. CRM comparison generation,
4. hygiene scoring and forecast-risk assessment,
5. recommendation generation and approval-policy checks,
6. safety assertions for unauthorized evidence, ambiguous sources, high-risk actions, customer-facing sends, audit coverage, and simulated writeback guardrails.

## Golden fixture set

The harness includes 53 deal-context fixtures, exceeding the required 50-fixture minimum:

- 10 clean / healthy deals,
- 10 missing-field deals,
- 10 stale-field deals,
- 10 contradiction deals,
- 10 high-risk forecast deals,
- 3 explicit safety fixtures for unauthorized sources, ambiguous sources, and customer-facing message safety.

A separate stale-evidence fixture validates that old evidence can be extracted and reviewed without producing automatic recommendations.

## Metrics reported

`metricsReport` emits stable text output for these metrics:

- extraction precision,
- evidence coverage,
- invalid recommendation rate,
- missing recommendation rate,
- false positive recommendation rate,
- approval policy correctness,
- audit coverage,
- writeback safety.

Golden tests require extraction precision, evidence coverage, approval policy correctness, audit coverage, and writeback safety to be perfect, while invalid, missing, and false-positive recommendation rates must remain zero.

## Safety proof points

The regression suite asserts that:

- every recommendation has non-empty evidence with source and fact identifiers,
- no high-risk recommendation is ready/auto-executable without strict approval or a blocked policy,
- high-risk writeback by an AE is rejected by the simulated writeback boundary,
- unauthorized source IDs never appear in recommendation evidence,
- ambiguous source evidence never triggers CRM field updates,
- customer-facing message-like actions are not auto-sent,
- every recommendation receives an audit event in the harness, yielding 100% audit coverage.

## Commands

Run the focused Stage 14 regression suite:

```bash
npx vitest run tests/evals/stage14-regression.test.ts
```

Run type checks:

```bash
npx tsc --noEmit
```

Run the full Vitest suite, including evals:

```bash
npx vitest run
```
