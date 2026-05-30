# Data Model

Stage 1 replaces the Stage 0 Prisma placeholder with the first application data model and deterministic seed fixture data. The schema is intentionally CRM-provider-neutral and optimized for local development, hygiene-rule testability, recommendation evidence, approval review, and auditability.

## Core Entities

- `Account`: customer or prospect organization. Accounts own contacts, opportunities, account-level source items, audit events, and feedback events.
- `Contact`: people associated with an account. Contacts can be linked to many opportunities through the `OpportunityContacts` relation and can mark decision-maker status for hygiene checks.
- `Opportunity`: sales deal record with owner, amount, stage, forecast category, close date, next step, last activity, and a unique `scenarioKey` used by deterministic fixtures.
- `CRMFieldSnapshot`: point-in-time CRM field captures for an opportunity. Every seeded opportunity has at least one snapshot.
- `SourceItem`: evidence item from notes, email, calls, meetings, CRM updates, tickets, or documents. Source items preserve author, timestamp, source type, visibility, authorization, and linked-record metadata.
- `ExtractedFact`: fact extracted from a source item and linked back to the opportunity and evidence.
- `FieldComparison`: comparison between CRM values and evidence-derived values, including mismatch state, severity, and rationale.
- `HygieneScore`: persisted score and grade for an opportunity at a calculation time.
- `Recommendation`: proposed field update or review action with status, confidence, rationale, and optional source evidence.
- `ApprovalAction`: human approval state for a recommendation.
- `AuditEvent`: durable event log for seed creation, snapshots, facts, comparisons, scores, recommendations, approvals, and feedback.
- `FeedbackEvent`: user feedback about recommendations or opportunity hygiene outcomes.

## Enums

Stage 1 defines constrained values for:

- Opportunity stage: prospecting through closed states.
- Forecast category: pipeline, best case, commit, closed, and omitted.
- Source item type: note, email, call, meeting, CRM update, support ticket, and document.
- Source visibility: public, internal, private, and restricted. Source authorization: authorized, unauthorized, and needs review, with a compatibility `isAuthorized` boolean on source items.
- Recommendation status: open, accepted, rejected, applied, and dismissed.
- Approval status: requested, approved, rejected, and cancelled.
- Audit event type: seed, snapshot, extraction, comparison, scoring, recommendation, approval, and feedback events.

## Relationship Assumptions

- An account can have many contacts and opportunities.
- An opportunity belongs to one account and may have zero, one, or many contacts.
- An opportunity must be able to hold many CRM snapshots, source items, facts, comparisons, scores, recommendations, approvals, audit events, and feedback events.
- A source item may be linked to an account, contact, and/or opportunity while still preserving provider-neutral `linkedRecordType` and `linkedRecordId` metadata.
- Recommendations can be evidence-backed by a source item and can have approval actions and feedback events.

## Seed Fixture Coverage

The Stage 1 fixture creates four accounts, eight contacts, and twelve opportunities covering healthy and unhealthy deal states: missing decision-maker, stale next step, procurement blocker, unrealistic close date, stage mismatch, forecast mismatch, legal pending, security review pending, no activity for 21 days, conflicting notes, and ambiguous source matching.

Required edge cases are present in the fixture: opportunity with no notes, duplicate notes, old notes only, private source item, multiple contacts, and no contacts.

## Deferred Model Work

CRM adapter mappings, live ingestion cursors, hygiene rule execution details, agent run orchestration, approval UI state, and production multi-tenant boundaries remain deferred to later stages.
