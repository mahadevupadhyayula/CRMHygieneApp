# Stage 04 — Entity Resolution Agent

## Goal

Extract and normalize entities from source item content before structured deal extraction runs. This stage turns unstructured references into schema-validated `ResolvedEntity` records that later stages can use as grounded context without performing fact extraction, scoring, CRM comparison, or recommendations.

## Inputs

The entity resolution agent accepts a bounded source context containing:

- `sourceItemText`: the authorized text content to scan for entity mentions.
- `sourceTimestamp`: the timestamp associated with the source item, used to normalize relative dates and preserve temporal context.
- `opportunityAccountContactContext`: the known opportunity, account, and contact context available for deterministic matching and normalization.

## Output

The agent returns an array of resolved entities:

```ts
ResolvedEntity[]
```

Each `ResolvedEntity` must preserve the originating `sourceItemId` and the evidence text that supports the resolved mention.

## Supported Entity Types

The entity resolution agent supports the following entity types:

- `account`
- `opportunity`
- `contact`
- `role`
- `internal owner`
- `competitor`
- `product/module`
- `document`
- `date`
- `amount`
- `risk keyword`

## Invariants

- Deterministic rules run before any model-assisted resolution path.
- Output is schema-validated before it is accepted by downstream stages.
- Tests must not make live model calls.
- Every resolved entity preserves the `sourceItemId` and the exact evidence text used for resolution.

## Out of Scope

Stage 04 does not implement:

- Structured fact extraction.
- Validation scoring.
- CRM comparison.
- Recommendations.
