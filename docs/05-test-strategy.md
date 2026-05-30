# Test Strategy

## Stage 0 Coverage

- Vitest smoke test verifies the unit test runner is configured.
- Playwright smoke test verifies the homepage renders core product copy.
- Prisma validation verifies the placeholder schema is syntactically valid.

## Stage 1 Coverage

- Prisma validation for the Stage 1 application schema.
- Unit tests for deterministic seed fixture builders and model-adjacent pure helpers.
- Integration tests for database relationships, constraints, and repeatable fixture loading.

## Stage 3 Coverage

Stage 3 matching tests cover deterministic deal-to-source attachment decisions without extracting facts, scoring hygiene, recommending actions, or writing back to CRM records. Matching coverage includes:

- Direct match: source items already linked to an opportunity, account, contact, or CRM linked record attach to the intended candidate with high confidence.
- Account-name match: source text that mentions the account name contributes to a match only when enough additional signals or candidate separation exist.
- Opportunity-name match: exact opportunity names and deal-specific labels provide strong evidence for the correct opportunity.
- Contact email/domain match: source participants, author emails, account websites, and known contact domains help connect evidence to the right account and opportunity.
- Ambiguous account match: duplicate or similar account references stay in review unless contact, opportunity, owner, timestamp, or keyword signals clearly disambiguate the candidate.
- Multiple open opportunities: active renewal/expansion candidates with close scores return `ambiguous` instead of auto-attaching evidence.
- Unmatched source: weak or unrelated sources remain reviewable and are not made available for extraction.
- Private source: private or unauthorized sources return `unmatched` and cannot be attached to an opportunity.
- Misspelled account name: misspelled account references can still match when stronger contact, domain, owner, timestamp, and keyword signals agree.
- Similar company/subsidiary edge cases: subsidiary names, parent-company names, and lookalike company names remain separate unless the source contains specific disambiguating evidence.

## Future Coverage

- Unit tests for schemas, scoring rules, and pure agent utilities.
- Integration tests for CRM adapter, approval, and other workflow boundaries after Stage 1 database coverage is in place.
- E2E tests for user journeys across dashboard, deal review, approvals, and settings.
- Golden tests and evals for agent recommendation quality.
