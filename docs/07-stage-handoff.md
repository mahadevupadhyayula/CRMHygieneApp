# Stage Handoff

## Current Stage Completed

Stage 3 — Deal-to-Source Matching Agent

Stage 3 is complete because the repository now has a deterministic deal-to-source matching agent that validates matching inputs, scores eligible source items against candidate opportunities, returns matched/ambiguous/unmatched `SourceMatch` outcomes with explainable reasons, excludes private or unauthorized sources, and is covered by focused unit tests plus scenario tests for ambiguous and edge-case source attachment.

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
