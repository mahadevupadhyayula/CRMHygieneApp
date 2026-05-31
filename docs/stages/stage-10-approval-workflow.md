# Stage 10 — Approval Workflow, Audit Log, and Feedback Loop

## Goal

Stage 10 adds the approval workflow boundary for recommendation cards. Users can approve, edit, reject, snooze, execute, fail, or cancel recommendations while preserving an audit trail and feedback signals for product learning.

## Status Model

The workflow uses these status values:

- `pending`
- `approved`
- `edited`
- `rejected`
- `snoozed`
- `executed`
- `failed`
- `cancelled`

Allowed transitions are intentionally narrow:

| From | Action | To |
| --- | --- | --- |
| `pending` or `snoozed` | `approve` | `approved` |
| `pending` or `snoozed` | `edit` | `edited` |
| `pending` or `snoozed` | `reject` | `rejected` |
| `pending` | `snooze` | `snoozed` |
| `approved` or `edited` | `execute` | `executed` |
| `approved` or `edited` | `fail` | `failed` |
| `pending`, `approved`, `edited`, or `snoozed` | `cancel` | `cancelled` |

Terminal statuses (`rejected`, `executed`, `failed`, `cancelled`) cannot be changed. Duplicate transitions, such as a second approval click on an already approved recommendation, are rejected.

## Audit and Feedback Requirements

Every successful status transition creates exactly one audit event with the actor, role, action, prior status, new status, recommendation ID, opportunity ID, and relevant metadata. Approval, edit, rejection, and snooze actions also create feedback events with stable signals (`approved`, `edited`, `rejected`, or `snoozed`).

Edited recommendations save the edited value back to `suggestedValue` and also retain it in `editedValue` so execution and auditing read the same final value. Rejections require a non-empty rejection reason. Snoozes require a valid future due date; snoozed cards reappear when the due date has passed.

## Permission Rules

The workflow enforces role-based actions before any state mutation:

- `readonly` users cannot act.
- `auditor` users can view workflow state and audit history but cannot act.
- `manager` users can approve and edit all supported recommendation fields, including high-risk cards.
- High-risk recommendations require a manager approval.
- AEs cannot approve forecast-changing fields (`ForecastCategoryName`, `StageName`, `CloseDate`, or `Amount`).
- RevOps users can approve configured fields through `revOpsApprovableFields`.
- AE users can approve configured low-risk fields through `aeApprovableFields`.

## Integrity and Edge Cases

The workflow blocks changes when:

- The caller provides a stale `expectedVersion`.
- The recommendation has been deleted.
- Source evidence is no longer available.
- The recommendation is stale and the policy is `block`.
- A rejection omits a reason.
- A snooze date is missing, invalid, or not in the future.
- The actor lacks permission.

## Implementation Files

- `lib/agents/approval/schemas.ts` defines status, action, actor, recommendation, audit, feedback, and policy schemas.
- `lib/agents/approval/types.ts` exports the inferred TypeScript workflow types.
- `lib/agents/approval/index.ts` implements transitions, permission checks, concurrency checks, audit events, feedback events, and snoozed-card visibility.
- `prisma/schema.prisma` includes the expanded recommendation/approval status enums and persistence fields for edited values, rejection reasons, snooze dates, approval versions, staleness, and deletion guards.

## Tests

- Unit coverage lives in `tests/unit/stage10-approval-workflow.test.ts` and verifies status transitions, audit creation, feedback creation, duplicate clicks, concurrency, snooze reappearance, and edge cases.
- Integration coverage lives in `tests/integration/stage10-approval-permissions.test.ts` and verifies role-based approval behavior for managers, AEs, RevOps, read-only users, auditors, permission failures, and edited-value audit integrity.
