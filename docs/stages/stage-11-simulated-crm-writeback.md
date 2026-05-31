# Stage 11 — Simulated CRM Writeback

## Goal

Stage 11 implements a safe, in-memory CRM writeback boundary. It exercises the writeback rules the product needs before any Salesforce, HubSpot, OAuth, or production CRM adapter work exists.

## Implementation

The writeback agent lives in `lib/agents/writeback` and exports:

- `executeWriteback(input)` — applies an approved recommendation to a simulated CRM snapshot.
- `rollbackWriteback(input)` — reverses a successful simulated writeback attempt.
- Zod schemas and inferred TypeScript types for snapshots, CRM fields, writeback attempts, changes, options, and rollback inputs.
- `WritebackError` for typed rollback errors and normalized failed writeback attempt codes.

## Supported Actions

The simulated writeback boundary supports these recommendation actions:

| Action | Simulated effect |
| --- | --- |
| `update_crm_field` | Updates a field in the local opportunity snapshot after field mapping and type checks. |
| `create_task` | Creates a deterministic open task linked to the recommendation and opportunity. |
| `add_risk_tag` | Adds a deterministic risk tag record. |
| `add_note_summary` | Adds a deterministic note summary record. |
| `assign_internal_owner` | Updates the simulated internal owner assignment for the opportunity. |

## Safety Rules

- Only recommendations with status `approved` may write.
- Rejected, pending, stale, deleted, or unsupported recommendations fail without mutating the target value.
- High-risk writebacks require a manager actor.
- AEs cannot write forecast-changing fields such as forecast category, stage, close date, or amount.
- Opportunity version checks block concurrent stale writes when `expectedOpportunityVersion` is supplied.
- CRM field updates require a mapped field to exist in the snapshot.
- Values must match the snapshot field type (`string`, `number`, `boolean`, `date`, or `picklist`).
- Simulated failures are configured with `failRecommendationIds` and produce failed attempts plus audit events.

## Audit, Attempts, and Idempotency

Every execution path creates a writeback attempt and audit event:

- Successful attempts include the target, before value, after value, actor, action, and idempotency key.
- Failed attempts include stable error codes and messages.
- Duplicate successful idempotency keys create a duplicate attempt and do not apply the action again.
- Failed attempts do not satisfy idempotency, so retry after a simulated failure can succeed.

## Rollback

Rollback uses the successful writeback attempt's stored change record:

- Field updates restore the exact previous value.
- Created tasks, risk tags, and note summaries are removed.
- Owner assignments restore the previous owner assignment or remove the new one if no prior owner existed.
- Rollback creates its own attempt and audit event.
- Duplicate rollback of the same attempt is rejected.

## Out of Scope

Stage 11 intentionally does not connect to Salesforce, HubSpot, or any external CRM. It does not persist writeback attempts to Prisma, call live APIs, perform OAuth, or update the UI. The module is deterministic and in-memory so approval, safety, error, and rollback behavior can be tested exhaustively first.
