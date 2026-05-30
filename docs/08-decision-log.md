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
