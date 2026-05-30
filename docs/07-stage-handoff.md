# Stage Handoff

## Current Stage Completed

Stage 1 — Data Model and Seed Fixture Data

Stage 1 is complete because the Prisma schema, deterministic seed data, Stage 1 unit/integration tests, and this handoff documentation are all present and have been validated.

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
