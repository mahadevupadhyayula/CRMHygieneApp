# Decision Log

## 2026-05-30 — Stage 0 scaffold choices

- Use Next.js App Router with TypeScript as the application foundation.
- Use Prisma with SQLite for an initially validating local schema placeholder.
- Use Vitest and Playwright as the baseline automated test stack.
- Defer production data models, CRM integrations, and agent contracts beyond Stage 0. Stage 1 is the first data model and seed fixture stage; CRM integrations and agent contracts remain later-stage work.

## 2026-05-30 — Stage 1 data model and seed fixtures

- Replace the placeholder Prisma schema with core CRM Hygiene domain models and enums.
- Keep the model provider-neutral by storing generic source metadata alongside relational links.
- Use deterministic seed IDs, timestamps, and scenario keys so unit and integration tests can assert fixture shape safely.
- Represent private or restricted evidence with `SourceVisibility`, a `SourceAuthorization` enum, and a compatibility `isAuthorized` flag instead of omitting the source item.
- Allow opportunities with no contacts and no note-type source items because those are important hygiene edge cases.
- Defer live CRM ingestion, rule execution, autonomous recommendation generation, and approval UI to later stages.
