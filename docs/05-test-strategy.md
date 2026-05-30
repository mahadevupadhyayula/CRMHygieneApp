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

## Stage 4 Coverage

Stage 4 entity resolution tests cover deterministic mention detection and normalization from authorized source text into schema-validated `ResolvedEntity` records. The tests keep resolution separate from fact extraction, CRM comparison, hygiene scoring, recommendations, and writeback. Entity resolution coverage includes:

- Named contacts: full-name, unique first-name, and email mentions resolve to the known CRM contact identifier without creating new contacts.
- Role-only stakeholders: references such as CFO, legal, procurement, and security resolve as role entities when no named person is present.
- Customer-vs-internal owner distinction: customer contacts and stakeholder roles remain separate from internal owner references such as internal finance, sales engineer, deal desk, and legal owner.
- Date normalization and ambiguity: absolute ISO dates, anchored relative dates such as next Friday, end-of-month, and end-of-quarter mentions normalize deterministically, while unanchored relative dates remain low-confidence ambiguous date entities.
- Competitors: competitive context phrases extract competitor names without treating product/module mentions as competitors.
- Product/module references: module, SKU, package, add-on, and connector references resolve as `product/module` entities.
- Document references: MSA, DPA, security questionnaire, and order form mentions resolve as document entities.
- Amount and discount extraction: currency amounts, percentages, discounts, uplifts, and similar commercial percentages resolve as amount entities.
- Ambiguous pronouns: pronouns and unresolved stakeholder labels become low-confidence role entities so later stages do not treat them as confirmed named contacts.

Stage 4 test files include focused unit coverage for extraction helpers and edge cases plus fixture-backed integration coverage against the deterministic Stage 1 opportunity fixtures.

## Future Coverage

- Unit tests for schemas, scoring rules, and pure agent utilities.
- Integration tests for CRM adapter, approval, and other workflow boundaries after Stage 1 database coverage is in place.
- E2E tests for user journeys across dashboard, deal review, approvals, and settings.
- Golden tests and evals for agent recommendation quality.
