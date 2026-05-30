# Test Strategy

## Stage 0 Coverage

- Vitest smoke test verifies the unit test runner is configured.
- Playwright smoke test verifies the homepage renders core product copy.
- Prisma validation verifies the placeholder schema is syntactically valid.

## Stage 1 Coverage

- Prisma validation for the Stage 1 application schema.
- Unit tests for deterministic seed fixture builders and model-adjacent pure helpers.
- Integration tests for database relationships, constraints, and repeatable fixture loading.

## Future Coverage

- Unit tests for schemas, scoring rules, and pure agent utilities.
- Integration tests for CRM adapter, approval, and other workflow boundaries after Stage 1 database coverage is in place.
- E2E tests for user journeys across dashboard, deal review, approvals, and settings.
- Golden tests and evals for agent recommendation quality.
