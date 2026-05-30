# Stage Handoff

## Current Stage Completed

Stage 6 — Validation Agent

Stage 6 is complete because the repository now has a deterministic Validation Agent that accepts Stage 5 extracted facts and source metadata, validates evidence and authorization safety, assigns review/rejection statuses, classifies action risk, detects contradictions, and preserves structured reasons for downstream CRM comparison and recommendation gates.

## Stage 6 — Validation Agent

### Summary of Implementation

Stage 6 adds a pure validation boundary that decides whether extracted facts are safe to use before any CRM recommendation path. The validation agent:

- Exposes `validateFacts(context)` and `ValidationAgent.validateFacts(context)` for deterministic validation.
- Validates inputs and outputs with Zod schemas.
- Rejects facts without evidence text.
- Rejects facts from private or unauthorized sources even when confidence is high.
- Rejects facts with missing source timestamps.
- Flags stale evidence as `needs_review` using a configurable reference date and freshness window.
- Flags confidence below the configured threshold as `needs_review`.
- Preserves low-confidence or extraction-ineligible facts for review instead of treating them as valid.
- Detects contradictory fact values for CRM-impacting fact types and marks all conflicting evidence as reviewable.
- Flags role-only stakeholders and ambiguous dates as incomplete enough to require review.
- Separates inference-only facts from directly evidenced facts.
- Assigns deterministic action risk: low for next-step style facts, medium for stakeholder/risk/process-status facts, and high for forecast/stage/close-date facts.
- Does not implement CRM field comparison, hygiene scoring, recommendations, approvals, audit persistence, or writeback.

### Files Changed

- `lib/agents/validation/index.ts` — Stage 6 Validation Agent implementation, validation checks, contradiction detection, action-risk mapping, and public exports.
- `lib/agents/validation/schemas.ts` — Zod schemas for validation contexts, source metadata, facts, options, result statuses, evidence statuses, and validation results.
- `lib/agents/validation/types.ts` — TypeScript types inferred from validation schemas.
- `tests/unit/stage6-validation.test.ts` — unit tests for all requested validation checks and edge cases.
- `tests/integration/stage6-validation-fixtures.test.ts` — fixture-backed tests that pass Stage 5 deterministic extraction output through Stage 6 validation.
- `docs/stages/stage-06-validation.md` — documented the Stage 6 goal, inputs, output, checks, invariants, and test expectations.
- `docs/04-agent-contracts.md` — documented the Stage 6 Validation Agent contract and examples.
- `docs/05-test-strategy.md` — added the Stage 6 validation coverage categories.
- `docs/08-decision-log.md` — recorded the Stage 6 design decision to keep validation deterministic and evidence-first.
- `docs/07-stage-handoff.md` — updated this handoff for the completed Stage 6 Validation Agent.

### Tests Added

- Added Stage 6 unit tests for valid high-confidence evidence, missing evidence rejection, unauthorized/private source rejection, stale source review, role-only stakeholder incompleteness, ambiguous dates, contradiction detection, inference separation, and action-risk assignment.
- Added Stage 6 edge-case tests for old evidence contradicted by newer evidence, two valid conflicting facts, email-source contradiction, manager-note contradiction, missing source timestamp, low-confidence high-severity facts, high-confidence unauthorized facts, and inference without direct evidence.
- Added fixture-backed integration tests covering Stage 5 extraction output flowing into Stage 6 validation for valid evidence, vague low-confidence evidence, unauthorized source evidence, and conflicting legal status evidence.

### Test Commands Run and Results

- `npm test -- --run tests/unit/stage6-validation.test.ts` — passed.
- `npm test -- --run tests/unit/stage6-validation.test.ts tests/integration/stage6-validation-fixtures.test.ts` — passed.
- `npm run prisma:validate` — passed.
- `npm test` — passed; Vitest ran 11 files and 136 tests successfully.
- `npx tsc --noEmit` — passed.

### Known Limitations

- Validation results are returned in memory and are not yet persisted to Prisma.
- Contradiction detection is deterministic and field-type based; it does not yet perform semantic resolution, source trust ranking, or newest-wins tie-breaking.
- Source authorization relies on source metadata supplied by upstream ingestion/matching stages.
- Action-risk policy is fixed in code for Stage 6 and is not yet admin-configurable.
- Stage 6 does not compare facts with CRM snapshots, score hygiene, create recommendations, approve actions, write audit records, or write back to CRM.

### Decisions Made

- Keep validation as a pure deterministic service so tests can exercise every safety gate without live models or CRM side effects.
- Reject evidence-free, unauthorized, and timestamp-missing facts because they cannot safely influence recommendations.
- Mark stale, low-confidence, incomplete, ambiguous, contradictory, and inference-only facts as `needs_review` when evidence exists so humans can review without losing provenance.
- Preserve all contradictory facts rather than silently choosing a winner.

### Next Recommended Stage

Stage 7 — CRM Field Comparison Engine

The next stage should compare `valid` and appropriate `needs_review` facts against current CRM field snapshots to create field-comparison records for empty, stale, conflicting, missing, hidden-risk, stage, forecast, stakeholder, and owner issues. It should not generate recommendations, approvals, hygiene scores, or writebacks yet.

### Context for the Next Codex Session

- Start by reading `docs/stages/stage-06-validation.md`, `docs/04-agent-contracts.md`, `lib/agents/validation/index.ts`, and the Stage 6 tests.
- Treat `status: "rejected"` as non-actionable for all downstream stages.
- Treat `status: "needs_review"` as reviewable but not automatically recommendation-eligible unless Stage 7 explicitly defines a policy for a specific issue type.
- Preserve `factId`, `reasons`, `actionRisk`, and `evidenceStatus` when building CRM comparisons.
- Re-run `npm run prisma:validate` and `npm test` after changing schema, extraction, validation, or comparison code.


## Current Stage Completed

Stage 5 — Structured Extraction Agent

Stage 5 is complete because the repository now has a structured extraction boundary that turns matched source item text into schema-validated `ExtractedFact` records through an injectable provider interface. The implementation includes deterministic mock-model extraction for MBP deal intelligence fields, evidence snippets, source metadata preservation, confidence bands, CRM field mappings, low-confidence handling, and recommendation eligibility guards for low-confidence, ambiguous, or unmatched source evidence.

## Stage 5 — Structured Extraction Agent

### Summary of Implementation

Stage 5 adds a pure structured-extraction layer that prepares grounded deal facts for later validation and CRM comparison without scoring hygiene, recommending actions, creating approvals, persisting audit events, or writing back to CRM. The structured extraction agent:

- Exposes `StructuredExtractionAgent` as the validation wrapper around any `AIModelProvider` implementation.
- Defines `AIModelProvider.extractDealFacts(context)` as the provider abstraction for production model-backed extraction and deterministic test fakes.
- Adds `MockModelProvider` to parse fixture text deterministically without live model calls.
- Validates extraction contexts, source items, contacts, opportunities, extracted fact types, confidence bands, match statuses, CRM field mappings, and extracted fact lists with Zod schemas.
- Extracts the MBP deal-intelligence field set: next step, next-step owner, next-step due date, decision-maker, approver, champion, risk, risk severity, timeline signal, close-date risk, stage signal, forecast signal, procurement status, legal status, security status, and internal owner needed.
- Requires every emitted fact to carry evidence text, source ID, source timestamp, confidence, confidence band, source match status, and a suggested CRM field mapping.
- Preserves source metadata by copying the source identifier, timestamp, and match status onto each fact.
- Marks low-confidence facts as not recommendation-eligible by default.
- Marks facts from ambiguous or unmatched source items as not recommendation-eligible by default while preserving them for review.
- Avoids unsupported inference by emitting no facts for vague or speculative text without explicit evidence.
- Preserves conflicting or successive notes as separate source-grounded facts instead of overwriting older evidence.

### Files Changed

- `lib/agents/extraction/index.ts` — Stage 5 public exports for the provider wrapper, mock provider, schemas, and types.
- `lib/agents/extraction/provider.ts` — `AIModelProvider` interface and `StructuredExtractionAgent` validation wrapper.
- `lib/agents/extraction/mock-provider.ts` — deterministic mock extraction provider, MBP field parsing, evidence snippets, source metadata preservation, confidence banding, recommendation eligibility, and deduplication.
- `lib/agents/extraction/schemas.ts` — Zod schemas for extracted fact types, confidence bands, source match statuses, CRM field mappings, extraction source/context records, and extracted facts.
- `lib/agents/extraction/types.ts` — TypeScript types inferred from the Stage 5 extraction schemas.
- `tests/unit/stage5-extraction.test.ts` — targeted extraction, golden fixture, edge-case, evidence, source metadata, low-confidence, unsupported inference, ambiguous-source, and provider wrapper coverage.
- `docs/stages/stage-05-extraction.md` — documented the Stage 5 goal, inputs, output, provider abstraction, extracted fields, invariants, and out-of-scope boundaries.
- `docs/05-test-strategy.md` — added the Stage 5 structured extraction coverage categories.
- `docs/07-stage-handoff.md` — updated this handoff for the completed Stage 5 structured extraction agent.

### Tests Added

- Added targeted unit tests for MBP field extraction, including next step, due date, decision-maker, risk, stage signal, forecast signal, legal status, security status, procurement status, owner, approver, champion, timeline, close-date risk, risk severity, and internal owner needed.
- Added golden fixture regression tests that compare projected extracted facts against deterministic expected JSON for clean, vague, approval, procurement, legal, security, budget, timeline, status, and no-fact scenarios.
- Added evidence enforcement tests to verify unsupported source text does not emit facts and accepted facts include evidence.
- Added source metadata preservation tests for source ID, source timestamp, match status, and CRM field mappings.
- Added low-confidence extraction tests that preserve vague next-step evidence while disabling recommendation eligibility.
- Added unsupported inference tests to ensure speculative commit or owner assumptions do not create facts.
- Added conflicting-source and repeated-note tests to ensure separate evidence survives instead of being overwritten.
- Added provider wrapper tests to ensure returned provider facts are schema-validated.

### Test Commands Run and Results

- `npm run prisma:validate` — passed.
- `npm test` — passed.

### Known Limitations

- The production `AIModelProvider` is an interface only; no hosted model SDK, prompt, retry logic, token budgeting, telemetry, or network-backed provider exists yet.
- `MockModelProvider` is deterministic and pattern-based; it is suitable for tests but does not represent final model quality or full natural-language understanding.
- Extraction currently emits in-memory `ExtractedFact` objects only and does not persist facts to Prisma.
- Stage 5 does not compare extracted values with CRM snapshots, calculate hygiene scores, create recommendations, create approvals, emit audit events, or write back to CRM.
- Source authorization enforcement depends on upstream matching and context construction; Stage 5 preserves `matchStatus` but does not yet filter private or unauthorized records itself.
- Resolved Stage 4 entities are accepted by the broad context contract only as passthrough data; the mock extractor does not yet use resolved-entity references to improve extraction or attribution.
- Conflict handling preserves separate facts from separate evidence but does not classify conflicts or choose a winning fact.

### Decisions Made

- Keep the extraction service provider-agnostic so production model integration can be added without changing the caller-facing contract.
- Use a deterministic mock provider for repeatable unit and golden fixture tests, with no live model calls.
- Validate both inputs and provider outputs with Zod so malformed model responses fail at the Stage 5 boundary.
- Require evidence, source ID, source timestamp, confidence, confidence band, match status, and suggested CRM field mapping on every emitted fact.
- Use confidence-band rules to prevent low-confidence extracted facts from becoming recommendation-eligible by default.
- Preserve ambiguous and unmatched source facts for review while preventing them from being recommendation-eligible by default.
- Avoid unsupported inference: only explicit evidence patterns produce facts in the deterministic provider.
- Preserve conflicting notes as separate facts so the future validation/comparison stage can reason over conflicts instead of losing source history.

### Next Recommended Stage

Stage 6 — Validation and CRM Field Comparison

The next stage should consume Stage 5 `ExtractedFact` records, current CRM snapshots, and relevant source metadata to compare extracted evidence with existing CRM values and produce reviewable validation/comparison results without hygiene scoring, recommendations, approvals, audit persistence, or CRM writeback. Recommended Stage 6 outcomes:

- Define field-comparison schemas for exact matches, missing CRM values, stale CRM values, conflicts, unsupported evidence, and insufficient evidence.
- Compare extracted facts against current CRM snapshots for the MBP field set while preserving source provenance and confidence.
- Classify conflicting source notes without picking a winner unless deterministic tie-breaking rules are explicitly defined.
- Keep low-confidence, ambiguous-source, and unmatched-source facts reviewable but not automatically actionable.
- Add unit and fixture-backed tests for matching values, mismatches, stale evidence, missing CRM fields, conflicting facts, source metadata preservation, and deterministic ordering.

### Context for the Next Codex Session

- Start by reading `docs/stages/stage-05-extraction.md`, `docs/04-agent-contracts.md`, `docs/05-test-strategy.md`, `lib/agents/extraction/schemas.ts`, `lib/agents/extraction/provider.ts`, `lib/agents/extraction/mock-provider.ts`, and `tests/unit/stage5-extraction.test.ts`.
- Treat `StructuredExtractionAgent` as the Stage 5 validation boundary and `AIModelProvider` as the only allowed abstraction for future production model calls.
- Preserve the current rule that low-confidence facts and facts from ambiguous or unmatched source items are not recommendation-eligible by default.
- Do not infer facts without evidence; unsupported inference should remain a no-fact or review-only path.
- Use the suggested CRM field mappings as hints for comparison, but validate comparisons against current CRM snapshot data instead of trusting extracted facts alone.
- Preserve source IDs, timestamps, match status, evidence text, confidence, and CRM field mappings in every downstream validation result.
- Keep Stage 6 bounded to validation and field comparison; do not implement hygiene scoring, recommendations, approvals, audit persistence, or CRM writeback unless the stage plan is explicitly expanded.
- Re-run `npm run prisma:validate` and `npm test` after changing schema, seed, ingestion, matching, entity resolution, extraction, validation, or rules code.

## Stage 4 — Entity Resolution Agent

### Summary of Implementation

Stage 4 adds a pure entity-resolution boundary that prepares normalized entity context for future evidence extraction and field comparison without extracting structured CRM facts or writing anything back. The entity resolution agent:

- Exposes `resolveEntities(context, options)` for source-item batches and `resolveEntitiesFromText(text, context, options)` for focused tests and inline callers.
- Validates accounts, opportunities, contacts, source items, options, entity types, and `ResolvedEntity` outputs with Zod schemas.
- Combines source item title, body, and `metadata.matchedText` before applying deterministic extraction rules.
- Resolves known account and opportunity mentions to their external ID, record ID, or name fallback.
- Resolves named contacts from full names, unique first names, and email addresses while avoiding contact creation for role-only references.
- Separates customer stakeholders and roles from internal owner references such as internal finance, sales engineer, deal desk, and legal owner.
- Normalizes absolute dates, anchored relative weekdays, end-of-month, and end-of-quarter mentions; low-confidence ambiguous date records are emitted when relative dates lack a timestamp anchor.
- Extracts competitor names, product/module references, document references, currency amounts, discount/uplift percentages, and risk keywords.
- Emits low-confidence role entities for ambiguous pronouns and unresolved stakeholder labels so later stages can preserve uncertainty.
- Deduplicates repeated entities per source item, keeps the highest-confidence duplicate, and returns deterministic ordering.
- Preserves `sourceItemId`, raw mention text, normalized value, confidence, and an evidence snippet on every resolved entity.

### Files Changed

- `lib/agents/entity-resolution/index.ts` — Stage 4 entity resolution implementation, deterministic extractors, date/amount normalization, evidence snippets, deduplication, public exports, and helper APIs.
- `lib/agents/entity-resolution/schemas.ts` — Zod schemas for entity types, resolved entities, contact/account/opportunity/source context, options, and output lists.
- `lib/agents/entity-resolution/types.ts` — TypeScript types inferred from the Stage 4 entity resolution schemas.
- `tests/unit/stage4-entity-resolution.test.ts` — focused unit coverage for named contacts, role-only stakeholders, customer-vs-internal owner distinction, date normalization and ambiguity, competitors, product/modules, documents, amounts/discounts, ambiguous pronouns, and edge cases.
- `tests/integration/stage4-entity-resolution-fixtures.test.ts` — fixture-backed integration coverage that resolves entities against deterministic Stage 1 opportunity/source fixtures.
- `docs/stages/stage-04-entity-resolution.md` — documented the Stage 4 goal, inputs, outputs, supported entity types, invariants, and out-of-scope boundaries.
- `docs/04-agent-contracts.md` — documented the Stage 4 entity resolution contract, schemas, safety constraints, and evidence requirements.
- `docs/08-decision-log.md` — recorded the Stage 4 design decision to keep entity resolution deterministic and provenance-preserving.
- `docs/05-test-strategy.md` — added the Stage 4 entity resolution test categories.
- `docs/07-stage-handoff.md` — updated this handoff for the completed Stage 4 entity resolution agent.

### Tests Added

- Added Stage 4 unit tests for schema validation, CRM context resolution, named contact matching, unique first-name and email contact matching, role-only stakeholder extraction, internal owner separation, date normalization, date ambiguity, competitor extraction, product/module extraction, document extraction, amount/discount extraction, ambiguous pronouns, and deterministic edge cases.
- Added Stage 4 fixture-backed integration tests for the Northstar, Evergreen, Nimbus, and Bluebird Stage 1 fixtures to verify contact, date, legal document, security questionnaire, risk, role-only CFO, and timestamp-anchored relative-date behavior against realistic source data.

### Test Commands Run and Results

- `npm run prisma:validate` — passed.
- `npm test` — passed.

### Known Limitations

- Entity resolution is deterministic and pattern-based; it does not make LLM calls, semantic embedding calls, web searches, or external enrichment requests.
- The resolver supports a bounded alias vocabulary for roles, internal owners, documents, risks, date phrases, competitors, and product/module references rather than a complete ontology.
- Competitor and product/module extraction use conservative phrase patterns and may miss informal shorthand or unusual casing.
- Date normalization supports ISO dates, `next <weekday>`, end-of-month, end-of-quarter, quarter labels, and `soon`; broader natural-language date parsing is not implemented.
- Ambiguous pronouns and generic stakeholder labels are intentionally unresolved low-confidence role entities; no coreference resolution is attempted.
- Amount extraction normalizes visible currency and percentage mentions but does not calculate totals, infer ACV/ARR, or reconcile conflicting commercial values.
- Stage 4 does not persist `ResolvedEntity` records, compare them with CRM fields, score hygiene, recommend action, create approvals, emit audit events, or write back to CRM.

### Decisions Made

- Keep entity resolution as a pure TypeScript module so tests can run deterministically without database setup, network access, or model dependencies.
- Validate all inputs and outputs with Zod before returning entities to downstream stages.
- Preserve exact source provenance by requiring every entity to carry `sourceItemId`, raw text, normalized value, confidence, and evidence text.
- Resolve named contacts only from known context and keep role-only stakeholders separate to avoid inventing people.
- Distinguish internal owner aliases from customer contact and role mentions so future comparison logic does not confuse seller-side blockers with customer-side stakeholders.
- Represent unresolved pronouns and ambiguous relative dates as low-confidence entities instead of dropping them, preserving reviewable uncertainty for future stages.

### Next Recommended Stage

Stage 5 — Evidence Extraction and Field Comparison

The next stage should consume Stage 2 authorized context, Stage 3 matched source attachments, and Stage 4 resolved entities to extract bounded evidence for specific CRM fields, compare extracted evidence with current CRM values, and emit reviewable differences without hygiene scoring, recommendations, approvals, audit persistence, or CRM writeback. Recommended Stage 5 outcomes:

- Define an extraction/comparison contract that accepts matched source items, `ResolvedEntity` context, target CRM fields, and deterministic extraction options.
- Implement field-specific extractors for a bounded first set of CRM hygiene fields such as decision maker, next step, close date, amount/procurement blocker, legal/security status, forecast/stage signal, competitor, and product/module references.
- Return structured evidence snippets, source references, resolved-entity references, confidence, and conflict/insufficient-evidence statuses.
- Preserve Stage 3 ambiguity semantics by excluding ambiguous and unmatched sources from automatic extraction unless a review-mode contract is explicitly defined.
- Preserve Stage 4 uncertainty semantics by treating low-confidence pronouns and unanchored relative dates as review cues, not confirmed CRM values.
- Add unit and integration tests for supported fields, missing evidence, conflicting evidence, stale evidence, source provenance, private-source exclusion, resolved-entity provenance, and deterministic ordering.

### Context for the Next Codex Session

- Start by reading `docs/stages/stage-04-entity-resolution.md`, `docs/04-agent-contracts.md`, `docs/05-test-strategy.md`, `lib/agents/ingestion/index.ts`, `lib/agents/matching/index.ts`, `lib/agents/entity-resolution/index.ts`, `lib/agents/entity-resolution/schemas.ts`, `tests/unit/stage4-entity-resolution.test.ts`, and `tests/integration/stage4-entity-resolution-fixtures.test.ts`.
- Treat Stage 3 `SourceMatch.status === "matched"` as the default automatic source eligibility boundary for extraction; ambiguous and unmatched results should remain in review paths unless the next stage explicitly defines review-mode behavior.
- Feed Stage 4 `ResolvedEntity` records into extraction as supporting context, but do not treat low-confidence ambiguous pronouns or unanchored relative dates as confirmed CRM facts.
- Preserve source eligibility checks for `SourceVisibility.PRIVATE`, `metadata.authorized === false`, and `metadata.authorization.authorized === false` at every downstream boundary.
- Keep Stage 5 bounded to evidence extraction and CRM-field comparison; do not implement hygiene scoring, recommendations, approvals, audit persistence, or CRM writeback unless the stage plan is expanded.
- Maintain deterministic fixtures and stable reason/status/entity expectations so future tests can compare exact outputs.
- Re-run `npm run prisma:validate` and `npm test` after changing schema, seed, ingestion, matching, entity resolution, extraction, or rules code.

## Stage 3 — Deal-to-Source Matching Agent

### Summary of Implementation

Stage 3 adds a pure matching boundary that maps authorized loose source items to candidate CRM opportunities so downstream extraction can evaluate evidence in the right deal context. The matching agent:

- Exposes `matchSourceToOpportunity(sourceItem, opportunities, options)` for one source item and `matchSourcesToOpportunities(sourceItems, opportunities, options)` for batch use.
- Validates source items, opportunities, metadata, options, and output records with Zod schemas before returning typed results.
- Produces a `SourceMatch` with `matched`, `ambiguous`, or `unmatched` status, a nullable `opportunityId`, rounded confidence, and human-readable reasons explaining the strongest signals.
- Scores direct CRM links, exact opportunity names, account names, contact email/domain signals, contact name mentions, owner/team metadata, timestamp proximity, and configured keyword references.
- Applies deterministic sorting and tie handling so repeated runs return stable results for the same inputs.
- Returns `ambiguous` instead of auto-attaching when active opportunities have close confidence scores.
- Returns `unmatched` when no candidate crosses the minimum confidence threshold, no candidates are provided, or the source is private or explicitly unauthorized.
- Penalizes stale unrelated sources so old content does not attach solely because it contains weak account or keyword text.
- Keeps matching scoped to attachment decisions only; fact extraction, hygiene scoring, recommendations, approval workflow, persistence, and CRM writeback are still out of scope.

### Files Changed

- `lib/agents/matching/index.ts` — Stage 3 matching implementation, scoring rules, source eligibility checks, ambiguity handling, confidence rounding, batch matching, and public exports.
- `lib/agents/matching/schemas.ts` — Zod schemas for matching contacts, opportunities, source metadata, source items, match statuses, match results, and configurable matching options.
- `lib/agents/matching/types.ts` — TypeScript types inferred from the Stage 3 matching schemas.
- `tests/unit/stage3-matching.test.ts` — focused unit coverage for individual matching signals, schema validation, source eligibility, threshold behavior, ambiguity handling, batching, and stale-source penalties.
- `tests/integration/stage3-matching-scenarios.test.ts` — scenario coverage for realistic matching categories and edge cases across direct, account, opportunity, contact, ambiguous, private, unmatched, misspelled, subsidiary, and similar-company situations.
- `docs/04-agent-contracts.md` — documented the Stage 3 deal-to-source matching contract and safety constraints.
- `docs/stages/stage-03-matching.md` — documented the Stage 3 goal, inputs, outputs, signals, invariants, and out-of-scope boundaries.
- `docs/05-test-strategy.md` — added the Stage 3 matching test categories.
- `docs/07-stage-handoff.md` — updated this handoff for the completed Stage 3 matching agent.

### Tests Added

- Added unit tests for direct CRM relationship matching.
- Added unit tests for account-name, exact opportunity-name, contact email/domain, contact name, owner/team, timestamp proximity, and keyword scoring signals.
- Added unit tests for schema validation and batch matching output.
- Added unit tests that private and unauthorized sources remain unmatched.
- Added unit tests for no-candidate, below-threshold, stale-source, and active-opportunity ambiguity behavior.
- Added integration/scenario tests for direct match, account-name match, opportunity-name match, contact email/domain match, ambiguous account match, multiple open opportunities, unmatched source, private source, misspelled account name, and similar company/subsidiary edge cases.

### Test Commands Run and Results

- `npm run prisma:validate` — passed. Prisma loaded `.env`, read `prisma/schema.prisma`, and reported the schema is valid. npm also printed a non-blocking warning about the unknown `http-proxy` env config.
- `npm test` — passed. The `pretest` hook generated Prisma Client successfully, then Vitest ran 6 test files and 52 tests successfully:
  - `tests/unit/stage3-matching.test.ts` — 11 passed.
  - `tests/integration/stage3-matching-scenarios.test.ts` — 12 passed.
  - `tests/unit/stage2-ingestion.test.ts` — 15 passed.
  - `tests/integration/stage1-seed.test.ts` — 9 passed.
  - `tests/unit/stage1-fixtures.test.ts` — 4 passed.
  - `tests/unit/smoke.test.ts` — 1 passed.

### Known Limitations

- Stage 3 is an in-memory pure matcher; it does not persist source attachments, create review queue records, or mutate CRM/source records.
- Candidate opportunity retrieval is not implemented yet; callers must provide the bounded opportunity set to score.
- Matching currently uses deterministic string, metadata, timestamp, and keyword signals; it does not perform semantic embedding search, LLM adjudication, fuzzy edit-distance matching, or cross-system entity resolution beyond the implemented normalization helpers.
- Source eligibility is defensively checked from source visibility and authorization metadata, but there is still no OAuth, tenant policy, row-level permission, or user-specific entitlement layer.
- Ambiguous and unmatched results are returned as data only; no UI workflow exists yet for manual resolution, dismissal, or attachment.
- The matcher does not extract field facts, compare CRM field values, generate hygiene scores, recommend CRM changes, request approvals, audit decisions, or write back to CRM systems.

### Decisions Made

- Keep Stage 3 as a pure TypeScript module so tests can exercise deterministic matching behavior without database setup or network dependencies.
- Use Zod at the matching boundary to keep source, opportunity, options, and result contracts explicit and reusable by later orchestration code.
- Favor transparent weighted rules and reason strings over opaque model output for the first matching implementation.
- Treat private and unauthorized sources as ineligible inside the matcher even though Stage 2 should already filter them.
- Return `ambiguous` for close active candidates instead of choosing a winner, preserving human review for duplicate accounts and multiple open opportunities.
- Keep unmatched sources reviewable and out of extraction rather than discarding them.
- Require stronger corroborating signals when account names are misspelled or similar company/subsidiary names could be confused.

### Next Recommended Stage

Stage 4 — Evidence Extraction and Field Comparison

The next stage should consume Stage 2 authorized context and Stage 3 `SourceMatch` results to extract bounded evidence for specific CRM fields, compare the extracted evidence with current CRM values, and emit reviewable differences without scoring hygiene or writing back. Recommended Stage 4 outcomes:

- Define an extraction/comparison contract that accepts a matched source set, target CRM fields, and deterministic extraction options.
- Implement field-specific extractors for the first bounded set of CRM hygiene fields, such as decision maker, next step, close date, amount/procurement blocker, legal/security status, and forecast/stage signals.
- Return structured evidence snippets, source references, confidence, and conflict/insufficient-evidence statuses.
- Preserve Stage 3 ambiguity semantics by excluding ambiguous and unmatched sources from automatic extraction unless a test or caller explicitly opts into review mode.
- Add unit and integration tests for supported fields, missing evidence, conflicting evidence, stale evidence, source provenance, private-source exclusion, and deterministic ordering.

### Context for the Next Codex Session

- Start by reading `docs/stages/stage-03-matching.md`, `docs/04-agent-contracts.md`, `docs/05-test-strategy.md`, `lib/agents/ingestion/index.ts`, `lib/agents/matching/index.ts`, `lib/agents/matching/schemas.ts`, `tests/unit/stage3-matching.test.ts`, and `tests/integration/stage3-matching-scenarios.test.ts`.
- Treat `SourceMatch.status === "matched"` as the only automatic source eligibility for extraction; ambiguous and unmatched results should remain in review paths unless the next stage explicitly defines review-mode behavior.
- Preserve source eligibility checks for `SourceVisibility.PRIVATE`, `metadata.authorized === false`, and `metadata.authorization.authorized === false` at every downstream boundary.
- Keep Stage 4 bounded to evidence extraction and CRM-field comparison; do not implement hygiene scoring, recommendations, approvals, audit persistence, or CRM writeback unless the stage plan is expanded.
- Maintain deterministic fixtures and stable reason/status expectations so future tests can compare exact outputs.
- Re-run `npm run prisma:validate` and `npm test` after changing schema, seed, ingestion, matching, extraction, or rules code.

## Stage 2 — Ingestion Agent

### Summary of Ingestion Behavior

Stage 2 adds a deterministic ingestion boundary that prepares Stage 1 CRM fixture data for later extraction and hygiene workflows. The ingestion agent:

- Exposes `ingestDealContext(prisma, opportunityId)` to fetch an opportunity with its account, contacts, CRM field snapshots, and source items, then return a validated `DealContextPackage`.
- Throws `OpportunityNotFoundError` when the requested opportunity does not exist.
- Exposes `buildDealContextPackage(opportunity, generatedAt)` so tests and future callers can build packages from already-loaded records.
- Normalizes opportunity, account, contact, CRM snapshot, source item, and activity-history data into a stable contract validated by Zod schemas.
- Sorts contacts with primary contacts first, then by role/name/email/id; sorts CRM snapshots and source items newest-first with deterministic tie breakers; and builds activity history from included source items.
- Parses source metadata JSON, preserves supported metadata such as author, external ID, source system, linked record, authorization, duplicate reference, and matched text, and warns when metadata is missing, unparseable, unsupported, or incomplete.
- Excludes private source items and source items marked unauthorized by metadata.
- Suppresses duplicate source items through explicit `duplicateOf` metadata and a normalized title/body/timestamp fallback key.
- Emits warnings for missing account context, missing contacts, missing CRM snapshots, missing authorized source items, missing source timestamps, missing source author metadata, incomplete metadata, private-source exclusions, unauthorized-source exclusions, and duplicate-source suppression.
- Produces package metadata with `opportunityId`, `generatedAt`, included source count, excluded source count, and duplicate source count.

This stage intentionally stops at assembling source context. Extraction, scoring, recommendations, approval workflows, and CRM writeback remain unimplemented.

### Files Changed

- `lib/agents/ingestion/index.ts` — Stage 2 ingestion implementation, opportunity loading, context-package construction, source filtering, deduplication, sorting, metadata parsing, and warnings.
- `lib/agents/ingestion/schemas.ts` — Zod schemas for source metadata, warnings, context records, activity history, package metadata, and the full `DealContextPackage`.
- `lib/agents/ingestion/types.ts` — exported TypeScript types inferred from the ingestion schemas plus the documented not-found error.
- `tests/unit/stage2-ingestion.test.ts` — Stage 2 ingestion unit coverage using synthetic records and Stage 1 fixture-derived opportunities.
- `tests/integration/stage1-seed.test.ts` — expanded Stage 1 seed integration assertions that continue to validate fixture persistence and ingestion-ready edge cases.
- `docs/07-stage-handoff.md` — updated handoff for the completed Stage 2 ingestion agent.

### Tests Added

- Added Stage 2 unit tests for deterministic package construction and Zod validation.
- Added coverage that all authorized non-private Stage 1 source types represented by the fixtures are included.
- Added coverage for private-source and unauthorized-source exclusion.
- Added coverage for duplicate source suppression through explicit metadata and normalized content fallback.
- Added coverage for deterministic source sorting and activity-history ordering.
- Added warning coverage for opportunities with no source notes, no CRM snapshots, no contacts, missing source timestamps, missing source authors, and incomplete source metadata.
- Added coverage for `OpportunityNotFoundError` when `ingestDealContext` cannot find the requested opportunity.
- Kept the Stage 1 fixture and seed tests passing to ensure Stage 2 did not regress fixture structure or persistence.

### Test Commands Run and Results

- `npm run prisma:validate` — passed. Prisma loaded `.env`, read `prisma/schema.prisma`, and reported the schema is valid. npm also printed a non-blocking warning about the unknown `http-proxy` env config.
- `npm test` — passed. The `pretest` hook generated Prisma Client successfully, then Vitest ran 4 test files and 29 tests successfully:
  - `tests/unit/stage2-ingestion.test.ts` — 15 passed.
  - `tests/integration/stage1-seed.test.ts` — 9 passed.
  - `tests/unit/stage1-fixtures.test.ts` — 4 passed.
  - `tests/unit/smoke.test.ts` — 1 passed.

### Known Limitations

- The ingestion agent currently consumes records already stored in the local Prisma database; it does not call Salesforce, HubSpot, email, calendar, support, document, or web APIs.
- Source authorization is enforced only through `SourceVisibility.PRIVATE` and fixture metadata flags; there is no OAuth, tenant policy, row-level permission, or user-specific entitlement layer yet.
- Metadata parsing supports the Stage 1 fixture metadata shape and flexible passthrough fields, but there is no versioned external-source metadata contract yet.
- Deduplication is intentionally lightweight and deterministic; it does not perform fuzzy semantic matching or cross-system entity resolution.
- Activity history is derived from source items only; no separate calendar/event/task timeline adapter exists yet.
- The ingestion package contains raw context only. Extraction, scoring, recommendations, approvals, audit-event creation, feedback loops, UI review flows, and CRM writeback remain unimplemented.
- The Prisma schema still uses the local SQLite validation path; production migrations and deployment configuration remain future work.

### Decisions Made

- Keep ingestion read-only and deterministic in Stage 2 so later agents can rely on a stable context package without side effects.
- Build ingestion on top of the Stage 1 Prisma models instead of introducing a second persistence shape.
- Validate the final package with Zod at the boundary to catch malformed context before downstream extraction or scoring stages consume it.
- Treat private and unauthorized source items as excluded context rather than hard failures, while preserving exclusion counts and warnings for traceability.
- Prefer explicit duplicate metadata when present and use a simple normalized content/timestamp fallback for deterministic duplicate suppression.
- Preserve compact warning codes as the handoff contract for later stages and tests.
- Do not populate `ExtractedFact`, `FieldComparison`, `HygieneScore`, `Recommendation`, `ApprovalAction`, `AuditEvent`, or `FeedbackEvent` in Stage 2.

### Next Recommended Stage

Stage 3 — Deal-to-Source Matching Agent

The next stage should consume authorized source context and candidate CRM records to map loose source items to the correct opportunity without implementing extraction, scoring, recommendations, or writeback. Recommended Stage 3 outcomes:

- Define the `SourceMatch` output contract for matched, unmatched, and ambiguous source items.
- Evaluate matching signals such as direct CRM relationships, account names, opportunity names, contact email domains, contact name mentions, owner/team metadata, timestamp proximity, and keyword references.
- Ensure private or unauthorized sources are never matched or attached to opportunities.
- Keep ambiguous context out of automatic attachments and route it to review instead.
- Preserve unmatched sources as reviewable records for manual resolution or future matching improvements.

### Context for the Next Codex Session

- Start by reading `docs/stages/stage-03-matching.md`, `docs/04-agent-contracts.md`, `docs/03-data-model.md`, `lib/agents/ingestion/index.ts`, `lib/agents/ingestion/schemas.ts`, `lib/agents/ingestion/types.ts`, and `tests/unit/stage2-ingestion.test.ts`.
- Treat authorized Stage 2 source context as input for downstream deal-to-source matching work.
- Preserve Stage 1 fixture IDs, `BASE_NOW = 2026-05-30T12:00:00.000Z`, and deterministic sorting unless every dependent test is intentionally updated.
- Use `ingestDealContext` for database-backed ingestion and `buildDealContextPackage` for unit tests that do not need Prisma I/O.
- Keep private and unauthorized source items out of matching inputs and outputs; assertions should use the Stage 2 metadata counts and warnings when validating this behavior.
- Extraction, scoring, recommendations, approvals, audit-event generation, feedback loops, review UI, and writeback are still not implemented. The next session should not imply these capabilities exist until their stages add them.
- Re-run `npm run prisma:validate` and `npm test` after changing schema, seed, ingestion, matching, extraction, or rules code.

## Stage 1 — Data Model and Seed Fixture Data

### Summary

Stage 1 replaced the Stage 0 placeholder Prisma schema with the CRM Hygiene Agent data model and added deterministic seed fixture data for local development, test coverage, and future agent-evaluation scenarios. The schema now supports CRM records, source evidence, extracted facts, field comparisons, hygiene scoring, recommendations, approvals, audit trails, and feedback signals. The seed fixture set is anchored to `2026-05-30T12:00:00.000Z` so freshness, stale-activity, close-date, and old-note scenarios remain stable across test runs.

### Prisma Models Added

- `Account`, `Contact`, `Opportunity`, and `OpportunityContact` model CRM account hierarchy, opportunity ownership/stage/forecast data, and many-to-many opportunity-contact roles.
- `CRMFieldSnapshot` stores point-in-time CRM field values for comparison against extracted evidence.
- `SourceItem` stores emails, meeting notes, call transcripts, documents, CRM notes, support tickets, web pages, and other evidence with visibility and metadata.
- `ExtractedFact` and `FieldComparison` provide the future foundation for comparing CRM values to source-derived facts.
- `HygieneScore` and `Recommendation` provide the future foundation for scoring opportunities and generating recommended CRM updates.
- `ApprovalAction`, `AuditEvent`, and `FeedbackEvent` provide review, application, traceability, and learning-loop records for later stages.
- Enums added for opportunity stages, forecast categories, source types, source visibility, fact status, field-comparison status, recommendation status, approval status, and audit event types.

### Seed Fixtures Added

- Added 16 deterministic opportunity fixtures across 16 accounts, 16 contacts, 16 opportunity-contact links, 72 CRM field snapshots, and 18 source items.
- Included a healthy baseline opportunity plus edge and negative scenarios for missing decision-maker, stale next step, commit/procurement blockers, unrealistic close date, stage mismatch, forecast mismatch, legal pending, security pending, no activity for 21 days, conflicting notes, ambiguous matching, no notes, duplicate notes, old notes only, private source authorization limits, multiple contacts, and no contacts.
- Added deterministic metadata on source items, including author, fixture external ID, source system, linked record, authorization scope, duplicate references, and matched evidence text.
- Added `seedCrmFixtures` so tests and local setup can reset and reseed CRM hygiene fixtures consistently.

### Files Changed

- `prisma/schema.prisma` — Stage 1 Prisma enums, models, relations, cascade/null behavior, uniqueness constraints, and indexes.
- `prisma/seed.ts` — deterministic CRM hygiene fixtures plus reusable seed function and CLI seed entry point.
- `tests/unit/stage1-fixtures.test.ts` — fixture structure, enum, relationship, and deterministic-assumption coverage.
- `tests/integration/stage1-seed.test.ts` — Prisma database push/seed integration coverage and edge-fixture persistence checks.
- `docs/07-stage-handoff.md` — Stage 1 completion handoff and next-session context.

### Tests Added

- Unit tests validate fixture shape with Zod, required fields, enum alignment, uniqueness assumptions, primary-contact limits, source-to-contact references, and duplicate-source references.
- Integration tests push the Prisma schema, run the deterministic seed, verify expected record counts, verify every opportunity has CRM snapshots, verify source metadata and timestamps persist, and verify Stage 1 edge cases.

### Test Commands Run and Results

- `npm run prisma:validate` — passed. Prisma reported `prisma/schema.prisma` is valid.
- `npm test` — passed. Vitest ran 3 test files and 9 tests successfully:
  - `tests/unit/stage1-fixtures.test.ts` — 4 passed.
  - `tests/integration/stage1-seed.test.ts` — 4 passed.
  - `tests/unit/smoke.test.ts` — 1 passed.

### Known Limitations

- The schema is pushed directly to SQLite for local validation; no production migration history has been created yet.
- Seeded data is deterministic fixture data only and does not yet ingest from real CRM, email, calendar, support, document, or web sources.
- Extracted facts, field comparisons, hygiene scores, recommendations, approvals, audit events, and feedback records are modeled but not populated by Stage 1 seed data.
- No CRM adapter, OAuth/authentication, background job pipeline, agent orchestration, recommendation UI, or approval workflow has been implemented yet.
- Source authorization is represented in metadata for fixtures, but no runtime enforcement layer exists yet.
- Evidence bodies are compact synthetic examples; larger document parsing, deduplication, fuzzy matching, and confidence scoring are intentionally deferred.

### Decisions Made

- Keep SQLite as the local Stage 1 datasource to preserve fast validation and simple deterministic integration tests.
- Use stable fixture IDs as Prisma primary keys where practical so tests can assert exact relationships and edge cases without lookup ambiguity.
- Anchor all fixture-relative dates to `BASE_NOW = 2026-05-30T12:00:00.000Z` to avoid time-dependent test drift.
- Store flexible source and audit metadata as JSON strings to avoid overfitting the Stage 1 schema before ingestion and agent workflows are implemented.
- Model downstream entities now, but seed only CRM records, snapshots, source items, and relationship data needed for Stage 1 validation.
- Preserve source visibility and authorization metadata so later stages can test evidence eligibility and private-source handling.

### Next Recommended Stage

Stage 2 — CRM Ingestion Foundation

The next stage should focus on the ingestion contract and adapter boundary for CRM data before adding hygiene rules or recommendation generation. Recommended Stage 2 outcomes:

- Define a CRM adapter interface for accounts, contacts, opportunities, field snapshots, and source/link metadata.
- Add import/upsert services that map CRM payloads into the Stage 1 Prisma models without breaking deterministic seeds.
- Add validation and idempotency tests around repeated ingestion, missing fields, deleted/archived CRM records, and external ID matching.
- Add a small fixture adapter that can ingest the Stage 1 seed shape through the same interface future real adapters will use.

### Context for the Next Codex Session

- Start by reading `docs/stages/stage-02-crm-ingestion-foundation.md`, `docs/03-data-model.md`, `prisma/schema.prisma`, `prisma/seed.ts`, and the Stage 1 tests.
- Preserve the Stage 1 fixture IDs and `BASE_NOW` unless a test explicitly updates every dependent expectation.
- Treat `seedCrmFixtures` as the deterministic reset path for integration tests.
- Do not implement hygiene rules, extracted-fact generation, scoring, recommendations, approvals, or UI workflows in Stage 2 unless the stage plan is explicitly expanded.
- Prefer adding new ingestion/service files and tests instead of embedding business logic in Prisma seed code.
- Re-run `npm run prisma:validate` and `npm test` after schema, seed, or ingestion changes.

## Stage 0 — Project Setup

### Summary

Stage 0 initialized the CRM Hygiene Agent repository as a Next.js + TypeScript application scaffold. It added baseline Prisma, Zod, Vitest, and Playwright configuration, created the requested route/component/library/test/docs directory structure, added a validating placeholder Prisma schema, and implemented a simple homepage with the product name and principle.

### Files Changed

- Project configuration: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`, `next-env.d.ts`.
- App shell and homepage: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`.
- Prisma placeholder: `prisma/schema.prisma`.
- Tests: `tests/unit/smoke.test.ts`, `tests/e2e/homepage.spec.ts`.
- Directory placeholders: `.gitkeep` files in the requested future directories.
- Documentation: `docs/00-project-context.md` through `docs/08-decision-log.md` and stage docs under `docs/stages/`.

### Tests Added

- Vitest smoke test confirming the unit test runner is wired.
- Playwright smoke test confirming the homepage renders the CRM Hygiene Agent name and product principle.

### Known Limitations

- CRM integrations, authentication, production data models, agent orchestration, and deployment configuration are not implemented in Stage 0.
- Prisma contains only a SQLite datasource and client generator placeholder; no application models exist yet.
- Stage docs after Stage 0 should be expanded as each execution plan is finalized; Stage 1 is now defined as data model and seed fixture work.

### Decisions

- Use Next.js App Router and TypeScript for the web foundation.
- Use Prisma with SQLite for the first validating local schema placeholder.
- Use Vitest for unit/integration tests and Playwright for E2E/browser tests.
- Keep Stage 0 limited to scaffold, documentation, and smoke coverage.

### Next Stage Recommendation

- Stage 1 — Data Model and Seed Fixture Data

Focus only on Prisma models, deterministic seed fixture data, and related unit/integration tests before adding CRM adapter work or agent recommendation logic.

## Stage 7 — CRM Field Comparison Engine Handoff

Implemented `lib/agents/comparison` as the deterministic comparison layer between Stage 6 validation and future recommendation/scoring work.

### Delivered

- Added schema-validated `FieldComparison` output with `crmField`, `currentValue`, `extractedValue`, `issueType`, `severity`, `evidence`, and `recommendationEligible`.
- Added comparison issue support for empty fields, stale fields, contradictions, timeline mismatches, missing tasks, hidden risks, stage mismatches, forecast mismatches, missing stakeholders, and missing owners.
- Added safeguards to ignore rejected facts, ambiguous/unmatched source matches, and stale-source validation results.
- Added newest-fact-wins resolution so newer validated notes can override older notes for the same CRM target field.
- Added unit and fixture-backed integration coverage for Stage 7 scenarios.

### Next Stage Notes

- Persistence remains out of scope for Stage 7. Future stages can map the pure output into the Prisma `FieldComparison` table.
- Recommendation generation should honor `recommendationEligible`; low-confidence or review-only comparisons should not be auto-applied.
- The comparison heuristics are deterministic and intentionally conservative. Add new fact types or CRM field mappings in `lib/agents/comparison/index.ts` before broadening recommendation behavior.

## Stage 8 — Hygiene Score and Forecast Risk Engine Handoff

Implemented `lib/agents/scoring` as the deterministic hygiene scoring and forecast risk layer on top of Stage 6 validation and Stage 7 comparisons.

### Delivered

- Added schema-validated `HygieneScoreResult` output with overall score, risk level, risk points, dimension scores, explanation, and auditable evidence.
- Added all eight PRD hygiene dimensions: completeness, freshness, consistency, forecast support, risk visibility, next-step clarity, stakeholder clarity, and coordination readiness.
- Added forecast risk classification across Low, Medium, High, and Critical levels.
- Grounded score explanations in CRM fields, field comparisons, extracted facts, source IDs, validation evidence, and source snippets where available.
- Added score clamping, duplicate-issue de-duping, missing-data guardrails, blocker compounding, close-date pressure handling, and admin-configured dimension weights.
- Added Stage 8 unit and fixture-backed integration coverage.

### Next Stage Notes

- Persistence remains out of scope for Stage 8. Future stages can map `HygieneScoreResult` into the Prisma `HygieneScore` table and related recommendation records.
- Recommendation generation should consume dimension evidence and `riskLevel`; it should not recreate unsupported risks from missing source data.
- If new comparison issue types or extracted fact types are added, update the scoring dimension mapping and risk contribution rules in `lib/agents/scoring/index.ts`.
