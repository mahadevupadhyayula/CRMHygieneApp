# Stage Handoff

## Current completed stage

Stage 14 — Evaluation Harness and Regression Suite.

## What changed

- Added a dedicated evaluation harness in `tests/evals` that runs deterministic end-to-end deal hygiene analysis across extraction, validation, comparison, scoring, recommendations, safety checks, and simulated writeback guardrails.
- Added 53 golden deal-context fixtures covering clean/healthy deals, missing fields, stale fields, contradictions, high-risk forecast scenarios, unauthorized evidence, ambiguous sources, and customer-facing message safeguards.
- Added metrics reporting for extraction precision, evidence coverage, invalid recommendation rate, missing recommendation rate, false positive recommendation rate, approval policy correctness, audit coverage, and writeback safety.
- Added Stage 14 documentation and updated the test strategy to describe eval coverage and safety proof points.

## Validation commands

- `npx tsc --noEmit`
- `npx vitest run tests/evals/stage14-regression.test.ts`

## Notes for the next stage

- Persist eval metric history once a CI artifact store or dashboard exists.
- Add real production traces only after redaction, customer-authorization checks, and fixture review workflows are available.
- Expand eval metrics with severity-weighted precision/recall once recommendation taxonomy stabilizes further.

## Stage 15 — Read-only CRM Integration

- Selected HubSpot as the first CRM integration target.
- Added a mocked, read-only HubSpot adapter that syncs companies, contacts, deals, notes, tasks, owners, selected email activity, and CRM deal field snapshots into normalized local objects.
- Added read-only enforcement through a guarded client wrapper; sync code never calls CRM writeback.
- Added unit coverage for response mapping, pagination, auth failures, rate limits, missing permissions, field mapping, missing fields, deleted records, duplicate records, field type mismatches, absent custom fields, partial sync failures, and read-only enforcement.
- Added integration coverage for mock deal/note/activity sync, local CRM snapshot creation, large note volumes, no-writeback behavior, and logged sync failures.
- Next stage should replace the mocked HubSpot client with an OAuth-backed read-scope client while keeping the normalized schema and read-only boundary unchanged.


## Stage 16 — Approval-gated Live Writeback

Stage 16 adds approval-gated live CRM writeback on top of the existing CRM adapter boundary. The implementation supports approved task creation, note summaries, risk tag/field updates, next step, decision-maker, close date, stage, and forecast category writes. Strict gates block unapproved, read-only, stale, conflicting, field-denied, and high-risk non-manager writes. Amount changes are disabled by default, and closed-won/lost transitions are explicitly out of scope.

Mocked CRM API tests cover validation errors, field-level permission denials, API timeouts, retry handling, duplicate task/idempotency behavior, before/after audit logs, rollback support, writeback conflicts, and audit-export-required gating. Future real CRM implementations should preserve these adapter contracts and keep mocked API coverage ahead of live credentials.
