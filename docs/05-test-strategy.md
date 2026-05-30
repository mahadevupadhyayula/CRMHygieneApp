# Test Strategy

## Stage 0 Coverage

- Vitest smoke test verifies the unit test runner is configured.
- Playwright smoke test verifies the homepage renders core product copy.
- Prisma validation verifies the placeholder schema is syntactically valid.

## Stage 1 Coverage

- Prisma validation for the Stage 1 application schema.
- Unit tests for schema enum coverage.
- Unit tests for required model fields and relationship assumptions.
- Unit tests for deterministic seed fixture shape and required edge scenarios.
- Integration tests that push the Prisma schema into an isolated SQLite database, run the seed helper, and validate expected counts.
- Integration tests confirming every opportunity has at least one CRM field snapshot.
- Integration tests confirming source items preserve author, timestamp, source type, visibility, authorization, and linked-record metadata.

## Commands

- `npm run prisma:validate` validates the Prisma schema.
- `npm run test` runs unit and integration tests under `tests/unit/` and `tests/integration/`.
- `npm run prisma:seed` runs the Stage 1 seed script against the configured `DATABASE_URL` for local manual seeding.

## Future Coverage

- Unit tests for hygiene scoring rules and pure agent utilities.
- Integration tests for CRM adapter, approval, and other workflow boundaries after Stage 1 database coverage is in place.
- E2E tests for user journeys across dashboard, deal review, approvals, and settings.
- Golden tests and evals for agent recommendation quality.
