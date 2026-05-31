# Stage 13 — Coordination Actions

## Scope

Stage 13 adds coordination actions that sit alongside CRM hygiene recommendations. Instead of only suggesting CRM field updates, the coordination agent proposes internal tasks and draft messages when validated evidence indicates a deal needs cross-functional follow-up.

## Implemented triggers

The coordination agent consumes validated facts and field comparisons, then emits `CoordinationAction` objects with type, owner role, suggested owner, draft message, evidence, approval requirement, status, and duplicate key.

Covered triggers:

- Technical blocker → Sales Engineer task
- Legal pending → legal owner notification
- Security questionnaire → security task
- Pricing approval → deal desk or finance task
- CFO/economic buyer not engaged → AE multi-thread task
- No activity or missing next step → follow-up task
- Procurement delay → manager review
- Customer asked for a document → customer-facing follow-up draft

## Safety behavior

- Customer-facing messages are always `draft` and require approval before any send workflow can use them.
- Internal messages can be forced into `requires_review` by configuration.
- Missing owners block the action instead of assigning it to an unknown user.
- Multiple possible owners resolve deterministically to the first configured owner.
- Sensitive evidence is redacted from draft messages while preserving an evidence marker for audit review.
- Existing active actions/tasks and duplicate generated actions are suppressed through stable duplicate keys.

## Tests

Unit coverage includes SE, legal, security, deal desk, AE, manager, follow-up, customer draft-only, internal review, unavailable owner, multiple owner, no-manager, existing-task, sensitive-evidence, and duplicate-action scenarios.

## Out of scope

Stage 13 does not send messages, create real tasks in a CRM, or notify live collaboration tools. It only prepares safe coordination suggestions for later approval and writeback stages.
