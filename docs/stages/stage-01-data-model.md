# Stage 01 — Data Model and Seed Fixture Data

## Goal

Introduce the first durable CRM Hygiene Agent domain model and deterministic local seed data so later stages can build hygiene rules, recommendations, approvals, and audit flows on stable database contracts.

## Scope

Stage 1 implementation should focus only on Prisma models, seed fixture data, and related unit/integration tests.

### In Scope

- Replace the Stage 0 placeholder Prisma schema with application models for the core CRM hygiene domain.
- Add database relationships and constraints needed for local development and test fixtures.
- Create deterministic seed fixture data for accounts, contacts, deals/opportunities, hygiene findings, evidence, approval requests, audit events, and agent runs as needed by the model.
- Add unit tests for model-adjacent pure helpers or fixture builders introduced during the stage.
- Add integration tests that validate schema behavior, relational integrity, and seed fixture loading.
- Document any intentional model tradeoffs or assumptions in the decision log or data model documentation.

### Out of Scope

- Live CRM provider integrations or adapter implementations.
- External CRM API ingestion, synchronization, or authentication.
- Agent recommendation generation.
- Hygiene scoring rules beyond data needed to persist future findings.
- Approval workflow UI or mutation flows.
- Production deployment, multi-tenant hardening, or background job infrastructure.

## Acceptance Criteria

- Prisma schema contains the Stage 1 domain entities and validates successfully.
- A repeatable seed fixture workflow creates representative local CRM hygiene data.
- Unit and integration tests cover fixture construction and key database relationships.
- Test data is deterministic and safe to run repeatedly in local and CI environments.
- Documentation reflects that Stage 1 is the data model and seed fixture stage, not CRM adapter work.

## Suggested Implementation Notes

- Keep model fields minimal but sufficient for later hygiene, recommendation, review, and audit stages.
- Prefer explicit enums or constrained strings where they improve test clarity without overfitting future CRM providers.
- Use fixture data that represents common hygiene states, such as missing close dates, stale next steps, incomplete contacts, conflicting amounts, and evidence-backed clean records.
- Preserve Stage 0 smoke coverage while adding focused database tests.
