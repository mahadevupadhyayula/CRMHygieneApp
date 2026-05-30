# Stage 05 — Structured Extraction Agent

## Goal

Extract structured deal intelligence from the matched source context so downstream stages can reason over grounded, schema-validated facts. This stage converts the matched deal context package, source items, and optional resolved entities into normalized extracted facts without validating them against CRM fields, scoring hygiene, recommending changes, or writing back to any system.

## Inputs

The structured extraction agent accepts:

- `matchedDealContextPackage`: the Stage 03 matched deal context package that identifies the opportunity and bounded source context eligible for extraction.
- `sourceItems`: the source records to inspect for deal intelligence, including their identifiers, timestamps, visibility, and source metadata.
- `resolvedEntities`: optional Stage 04 resolved entities that can help ground people, roles, dates, organizations, products, documents, and risk signals found in the source context.
- `modelProvider`: the configured model provider used by the extraction service.

## Output

The agent returns schema-validated extracted facts:

```ts
ExtractedFact[]
```

Each extracted fact must include the normalized field name, extracted value, evidence, source metadata, confidence or status information required by the extraction schema, and enough deal context to keep the fact attributable to the matched opportunity.

## Provider Abstraction

Structured extraction must call models only through a provider abstraction so production model behavior remains isolated from deterministic tests:

- `AIModelProvider`: the production provider interface for model-backed structured extraction.
- `MockModelProvider`: the deterministic test provider that returns fixture-backed responses and never performs live model calls.

The extraction service depends on the provider interface rather than a concrete hosted model SDK. Tests must inject `MockModelProvider` or another deterministic fake.

## Extracted Fields

The extraction scope includes these deal intelligence fields:

- next step
- owner
- due date
- decision-maker
- champion
- risk
- timeline
- stage and forecast signal
- procurement/legal/security status
- internal owner needed

## Invariants

- Every extracted fact has supporting evidence.
- Every extracted fact has source metadata that identifies where the evidence came from.
- Deterministic tests must not make live model calls.
- No fact may be marked recommendation-eligible unless it has evidence.

## Out of Scope

Stage 05 does not implement:

- Validation agent.
- CRM field comparison.
- Hygiene scoring.
- Recommendations.
- Writeback.
