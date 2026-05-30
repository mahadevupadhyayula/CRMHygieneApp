# Test Strategy

## Stage 0 Coverage

- Vitest smoke test verifies the unit test runner is configured.
- Playwright smoke test verifies the homepage renders core product copy.
- Prisma validation verifies the placeholder schema is syntactically valid.

## Future Coverage

- Unit tests for schemas, scoring rules, and pure agent utilities.
- Integration tests for database, CRM adapter, and approval flows.
- E2E tests for user journeys across dashboard, deal review, approvals, and settings.
- Golden tests and evals for agent recommendation quality.
