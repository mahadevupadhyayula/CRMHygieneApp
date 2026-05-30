# Stage 1 — Data Model and Seed Fixture Data

## Goal

Introduce the first durable CRM Hygiene Agent domain model and deterministic local seed data so later stages can build hygiene rules, recommendations, approvals, and audit flows on stable database contracts.

## Implemented Scope

Stage 1 is limited to Prisma persistence contracts, deterministic seed fixture data, and database-focused validation.

### In Scope

- Replaced the Stage 0 placeholder Prisma schema with core CRM Hygiene models for accounts, contacts, opportunities, CRM snapshots, source evidence, extracted facts, comparisons, hygiene scores, recommendations, approvals, audit events, and feedback events.
- Added stage-appropriate enums for opportunity stage, forecast category, source item type, source visibility and authorization, recommendation status, approval status, and audit event type.
- Added deterministic seed fixture data with twelve opportunity scenarios and explicit edge cases for no notes, duplicate notes, old notes only, private source items, multiple contacts, and no contacts.
- Added unit tests for enum coverage, required model fields, relationship assumptions, and fixture shape.
- Added integration tests for seed counts, per-opportunity CRM snapshots, source item metadata preservation, and core relationship behavior.

### Out of Scope

- Live CRM provider integrations or adapter implementations.
- External CRM API ingestion, synchronization, or authentication.
- Agent recommendation generation.
- Hygiene scoring rule execution beyond seeded persistence records.
- Approval workflow UI or mutation flows.
- Production deployment, multi-tenant hardening, or background job infrastructure.

## Acceptance Criteria Status

- Prisma schema contains the Stage 1 domain entities and validates successfully.
- A repeatable seed fixture workflow creates representative local CRM hygiene data.
- Unit and integration tests cover fixture construction and key database relationships.
- Test data is deterministic and safe to run repeatedly in local and CI environments.
- Documentation reflects that Stage 1 is the data model and seed fixture stage, not CRM adapter work.

## Seed Fixture Scenario Catalog

The seed fixture includes these twelve realistic opportunities:

1. Healthy deal.
2. Missing decision-maker.
3. Stale next step.
4. Commit deal with procurement blocker.
5. Unrealistic close date.
6. Stage mismatch.
7. Forecast mismatch.
8. Legal pending.
9. Security review pending with a private unauthorized source item.
10. No activity for 21 days and no contacts.
11. Multiple conflicting notes with duplicate note bodies.
12. Ambiguous source matching with old CRM-update evidence only and no notes.
