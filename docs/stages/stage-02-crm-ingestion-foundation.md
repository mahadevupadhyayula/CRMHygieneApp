# Stage 02 — CRM Ingestion Foundation

## Goal

Define the typed boundaries needed to map external CRM payloads into the Stage 1 domain model after the database schema and seed fixtures are in place.

## Scope

Stage 2 may introduce CRM adapter interfaces, provider-neutral ingestion contracts, and payload mapping fixtures if those boundaries are required before hygiene rule implementation.

### In Scope

- CRM provider adapter interfaces and test doubles.
- Provider-neutral ingestion contracts and validation schemas.
- Mapping tests from CRM-like payload fixtures into Stage 1 entities.
- Error handling conventions for malformed or incomplete CRM payloads.

### Out of Scope

- Changes to the Stage 1 data model unless explicitly required by validated ingestion gaps.
- Agent recommendation generation.
- Approval workflows, audit UI, or production CRM authentication.
