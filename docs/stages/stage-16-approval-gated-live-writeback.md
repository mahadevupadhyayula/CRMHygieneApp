# Stage 16 — Approval-gated Live Writeback

## Scope implemented

Stage 16 enables controlled live CRM writeback through the existing writeback adapter boundary, with mocked CRM API behavior used by tests before any real CRM client is introduced. Supported live writeback targets are:

- CRM task creation
- CRM note summary creation
- Risk tag creation and risk field updates
- Next step updates
- Decision-maker field updates
- Close date updates
- Stage updates
- Forecast category updates

Closed-won and closed-lost transitions remain explicitly out of scope. Amount changes default to disabled; tests may opt into the strict admin-only simulation path with `amountWritePolicy: "admin_only"` for rollback coverage.

## Approval and permission rules

Writeback is blocked unless the recommendation is approved. The writeback layer classifies actions as:

- `approval_light` for low-risk operational actions, such as tasks, notes, tags, and low-risk field updates.
- `approval_required` for medium-risk changes and close-date updates.
- `manager_approval` for high-risk changes and stage/forecast updates.
- `disabled_admin_only` for amount changes.
- `out_of_scope` for closed-won/lost transitions.

High-risk writes require manager execution. AEs cannot execute stage or forecast writes. Read-only mode blocks all writeback attempts regardless of approval state.

## Adapter and failure behavior

The mocked live adapter preflight simulates CRM API outcomes before applying local snapshot changes. It covers:

- CRM validation errors
- Field-level permission denials
- API timeouts with retry counts
- Retryable API failures
- Permanent simulated API failures
- Audit-export-required gating

Successful writes persist before/after values in both the writeback attempt change payload and audit-event metadata. Failed writes append failed attempts and failure audit events without mutating CRM snapshot data.

## Conflict, duplicate, and rollback behavior

The writeback path enforces optimistic opportunity versions when provided and detects CRM value changes after approval by comparing the approved current value with the latest CRM snapshot value. Idempotency keys prevent duplicate live writes, including duplicate task creation. Rollback is supported for successful field, task, risk tag, note summary, and owner-assignment writes. Non-successful or duplicate attempts are not rollbackable.

## Tests added

Unit coverage validates field mapping, value serialization, permission enforcement, approval enforcement, mocked API error handling, retry counts, rollback support, duplicate task handling, concurrent writeback conflicts, CRM value changes after approval, read-only blocking, and audit export requirements.

Integration coverage validates approved task creation, approved next-step field update, manager-only forecast changes, AE denial for stage/forecast approval, read-only writeback blocking, and failure audit logging.

## Handoff notes

Future real CRM writeback clients should plug into the same preflight/apply contract and keep the mocked API tests as the first safety net. Do not add closed-won/lost writeback until an explicit terminal-stage approval design exists. Do not enable amount writes by default; if required later, add a true admin role and an admin-only approval path before calling a live CRM API.
