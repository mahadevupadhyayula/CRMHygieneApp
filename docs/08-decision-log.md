# Decision Log

## 2026-05-30 — Stage 0 scaffold choices

- Use Next.js App Router with TypeScript as the application foundation.
- Use Prisma with SQLite for an initially validating local schema placeholder.
- Use Vitest and Playwright as the baseline automated test stack.
- Defer production data models, CRM integrations, and agent contracts beyond Stage 0. Stage 1 is the first data model and seed fixture stage; CRM integrations and agent contracts remain later-stage work.

## 2026-05-30 — Stage 6 validation remains deterministic and evidence-first

Decision: Implement the Validation Agent as a pure deterministic TypeScript/Zod boundary over extracted facts and source metadata.
Reason: Validation gates recommendation eligibility and must be testable without live models, CRM writes, or hidden heuristics.
Alternatives considered: Persist validation results immediately in Prisma; combine validation with CRM field comparison; allow high-confidence facts to bypass review despite stale or incomplete evidence.
Impact: Downstream stages can consume explicit `valid`, `needs_review`, and `rejected` results with reason codes, action risk, and evidence status.
Revisit when: Stage 7 CRM comparison needs persisted validation records or configurable customer-specific validation policies.

## 2026-05-31 — Stage 11 writeback is simulated before live CRM adapters

Decision: Implement CRM writeback as a deterministic in-memory snapshot mutation layer with attempts, audit events, idempotency, and rollback before adding Salesforce or HubSpot adapters.
Reason: Writeback is safety-critical; the product needs exhaustive approval, permission, error, before/after, retry, and rollback tests without risking real CRM side effects.
Alternatives considered: Add Salesforce or HubSpot write APIs immediately; persist writeback attempts in Prisma first; fold writeback into the approval state machine.
Impact: Future CRM adapters can target the same writeback contract while tests continue to run without network access or credentials.
Revisit when: The application adds authenticated CRM adapters, persisted audit/writeback records, or UI controls for writeback execution and rollback.
