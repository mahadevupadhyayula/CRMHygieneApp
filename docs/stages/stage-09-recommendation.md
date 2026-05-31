# Stage 9 — Recommendation and Approval Card Engine

## Goal

Stage 9 converts validated field comparisons and risk findings into actionable, evidence-backed approval cards. The engine is intentionally conservative: a recommendation cannot be emitted unless it has source evidence, a qualifying validation result, and a supported CRM field or risk workflow.

## Implemented scope

The implementation lives in `lib/agents/recommendation` and exports `RecommendationAgent` plus the convenience `generateRecommendations` function.

Supported recommendation action types:

- `update_crm_field`
- `create_task`
- `add_risk_tag`
- `add_note_summary`
- `request_manager_review`
- `assign_internal_owner`
- `draft_internal_message`
- `snooze_reminder`

Each generated approval card includes:

- Proposed action
- Current CRM value
- Suggested value
- Reason
- Evidence
- Confidence
- Risk level
- Required approver
- Approval policy
- Approval levels

## Approval policy

Risk and approval behavior is enforced centrally by action and CRM field:

| Risk | Examples | Approval policy |
| --- | --- | --- |
| Low | Create task, add note summary, update next step | No approval, ready state |
| Medium | Add risk tag, update decision-maker/stakeholder, procurement/legal/security status, assign owner | Standard approval |
| High | Close date, stage, forecast, amount | Strict approval |

Amount updates use strict approval by default and can be configured as blocked via `amountUpdatePolicy: "blocked"`.

## Safety constraints

- No card may exist without evidence.
- Rejected, unauthorized, missing-evidence, inference-only, and low-confidence inputs are suppressed.
- Unsupported CRM fields are suppressed rather than guessed.
- Internal messages are always draft-only; the engine never auto-sends customer or internal email.
- Existing pending/ready/draft/blocked cards and snoozed similar recommendations suppress duplicates.
- Missing approvers do not silently downgrade policy; cards are marked with `missingRequiredApprover`.

## Tests

Stage 9 has unit coverage for policy enforcement, evidence gates, duplicate suppression, edge cases, and draft-only messaging. Fixture-backed integration coverage verifies procurement blockers, missing next steps, legal pending ownership, forecast conflicts, and healthy deals.
