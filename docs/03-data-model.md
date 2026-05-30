# Data Model

Stage 0 includes a Prisma schema placeholder that validates against SQLite. Stage 1 replaces that placeholder with the first application data model and deterministic seed fixture data.

## Stage 1 Candidate Entities

- Account
- Contact
- Opportunity or Deal
- HygieneFinding
- EvidenceItem
- ApprovalRequest
- AuditEvent
- AgentRun

Stage 1 should introduce these entities only to the depth needed for Prisma persistence, seed fixture coverage, and database-focused tests. CRM adapter mappings, live ingestion, hygiene rule execution, recommendations, approvals UI, and audit UI should be deferred to later stages.
