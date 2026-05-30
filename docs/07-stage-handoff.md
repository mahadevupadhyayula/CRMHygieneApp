# Stage Handoff

## Stage 1 — Data Model and Seed Fixture Data

### Summary

Stage 1 implemented the durable Prisma data model for the CRM Hygiene Agent and added deterministic local seed fixture data. The schema now includes accounts, contacts, opportunities, CRM field snapshots, source evidence, extracted facts, field comparisons, hygiene scores, recommendations, approval actions, audit events, and feedback events. The seed fixture creates twelve realistic opportunities that cover healthy and unhealthy CRM hygiene scenarios, including the required edge cases.

### Files Changed

- Prisma schema and seed workflow: `prisma/schema.prisma`, `prisma/seed.ts`, `.env`, and `package.json`.
- Unit tests: `tests/unit/schema-models.test.ts`, `tests/unit/seed-fixture.test.ts`, and existing smoke coverage.
- Integration tests: `tests/integration/seed.test.ts`.
- Documentation: `docs/03-data-model.md`, `docs/04-agent-contracts.md`, `docs/05-test-strategy.md`, `docs/07-stage-handoff.md`, `docs/08-decision-log.md`, and `docs/stages/stage-01-data-model.md`.

### Tests Added

- Schema enum coverage tests.
- Required model field tests.
- Relationship assumption tests.
- Fixture shape and edge scenario tests.
- Seed integration tests for expected counts, CRM snapshots, source metadata, and relationship behavior.

### Known Limitations

- Stage 1 seed records include representative hygiene scores, comparisons, recommendations, approvals, audit events, and feedback events, but no rule engine or agent generates them yet.
- Live CRM ingestion, authentication, provider-specific mapping, background jobs, and UI flows remain unimplemented.
- The local datasource uses SQLite for deterministic development and test execution.

### Decisions

- Keep Stage 1 focused on data contracts and deterministic fixtures rather than CRM adapter work.
- Use provider-neutral source metadata fields (`linkedRecordType`, `linkedRecordId`, `sourceSystem`, and `externalId`) so later ingestion stages can map external CRM records without changing early tests.
- Allow opportunities with zero contacts and source evidence with account-level metadata to support hygiene edge cases.
- Model source visibility separately from source authorization so private or restricted records can be represented without authorizing their contents for recommendations.

### Next Stage Recommendation

- Stage 2 — CRM Ingestion Foundation

Build adapter boundaries and ingestion mapping on top of the Stage 1 schema, while preserving deterministic fixtures and tests.
