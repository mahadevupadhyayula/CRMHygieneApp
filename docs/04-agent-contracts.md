# Agent Contracts

Stage 1 does not implement autonomous agent execution, but it introduces persistence contracts that later agent contracts must reference.

## Stage 1 Persistence Inputs for Future Agents

Future hygiene and recommendation agents should treat these records as their durable inputs and outputs:

- `Opportunity`, `Account`, and `Contact` provide CRM context.
- `CRMFieldSnapshot` provides point-in-time CRM values.
- `SourceItem` provides evidence with author, timestamp, type, visibility, authorization, and linked-record metadata.
- `ExtractedFact` and `FieldComparison` provide explainable intermediate reasoning artifacts.
- `HygieneScore`, `Recommendation`, `ApprovalAction`, `AuditEvent`, and `FeedbackEvent` provide downstream review and learning surfaces.

## Expected Contract Properties

- Deterministic schema validation with Zod when agent request/response contracts are added.
- Evidence references for every material recommendation.
- Explicit confidence and uncertainty fields.
- Human-readable rationale.
- Safe failure modes when required evidence is missing, private, restricted, or unauthorized.
- Audit events for material state transitions.

## Deferred Until Later Stages

Typed agent input/output schemas, prompt contracts, tool contracts, confidence calibration, and approval handoff behavior remain future-stage work.
