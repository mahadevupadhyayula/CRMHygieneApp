# Data Model

Stage 1 replaces the Stage 0 placeholder with the first durable Prisma data model for local CRM hygiene development. The schema is implemented in `prisma/schema.prisma`, uses SQLite for development, and is intentionally scoped to persisted records plus deterministic seed fixtures. It does not yet implement live CRM adapters, rule execution, agent orchestration, or user-facing approval flows.

## Stage 1 Model Overview

### Account

`Account` represents a CRM company or organization.

Key fields:

- `id`: internal primary key, seeded with deterministic account external IDs in fixtures.
- `externalId`: optional unique upstream CRM identifier.
- `name`: account display name; indexed for local lookup.
- `website`, `industry`, `segment`, `ownerName`: lightweight CRM profile fields.
- `createdAt`, `updatedAt`: Prisma-managed timestamps.

Relationships:

- One account can have many `Contact` records.
- One account can have many `Opportunity` records.
- One account can have many `SourceItem` records.
- One account can be referenced by many `AuditEvent` records.

### Contact

`Contact` represents a person related to an account, source material, and/or opportunity buying group.

Key fields:

- `id`: internal primary key, seeded with deterministic contact external IDs in fixtures.
- `accountId`: optional account reference. Deleting an account sets this field to `null` rather than deleting the contact.
- `externalId`: optional unique upstream CRM identifier.
- `firstName`, `lastName`, `email`, `title`, `phone`: contact profile fields. `email` is indexed for lookup.
- `createdAt`, `updatedAt`: Prisma-managed timestamps.

Relationships:

- Optionally belongs to one `Account`.
- Joins to opportunities through `OpportunityContact`.
- Can be attached to `SourceItem`, `ExtractedFact`, and `FeedbackEvent` records.

### Opportunity

`Opportunity` is the central sales deal record that Stage 1 fixtures are organized around.

Key fields:

- `id`: internal primary key, seeded with deterministic opportunity external IDs in fixtures.
- `accountId`: required account reference. Deleting an account cascades to its opportunities.
- `externalId`: optional unique upstream CRM identifier.
- `name`: opportunity display name.
- `stage`: `OpportunityStage`, defaulting to `PROSPECTING`.
- `forecastCategory`: `ForecastCategory`, defaulting to `PIPELINE`.
- `amount`, `closeDate`, `ownerName`, `description`: common CRM opportunity fields.
- `createdAt`, `updatedAt`: Prisma-managed timestamps.

Relationships:

- Belongs to one `Account`.
- Has many contact links through `OpportunityContact`.
- Has many `CRMFieldSnapshot`, `SourceItem`, `ExtractedFact`, `FieldComparison`, `HygieneScore`, `Recommendation`, `AuditEvent`, and `FeedbackEvent` records.
- Deleting an opportunity cascades to most opportunity-owned evidence, scores, recommendations, and feedback.

### OpportunityContact

`OpportunityContact` is the many-to-many join between opportunities and contacts.

Key fields:

- `opportunityId` and `contactId`: composite primary key.
- `role`: fixture-facing buying committee role, such as Economic Buyer, Champion, Evaluator, Procurement, or Decision Maker.
- `isPrimary`: marks the primary contact for fixture and future hygiene checks.
- `createdAt`: join timestamp.

Relationships:

- Belongs to one `Opportunity`; deleting the opportunity deletes the join.
- Belongs to one `Contact`; deleting the contact deletes the join.

### CRMFieldSnapshot

`CRMFieldSnapshot` stores point-in-time CRM field values captured for an opportunity.

Key fields:

- `id`: primary key, seeded deterministically as `<opportunity-id>-SNAP-<number>`.
- `opportunityId`: required opportunity reference.
- `fieldName`: API-style CRM field name, such as `StageName`, `ForecastCategoryName`, `Amount`, or `CloseDate`.
- `fieldLabel`, `dataType`, `value`: display label, simple type string, and stringified value.
- `sourceSystem`: defaults to `crm`; seed data uses `salesforce-fixture`.
- `capturedAt`: snapshot timestamp.

Relationships and constraints:

- Belongs to one `Opportunity` and cascades on opportunity delete.
- Can be referenced by many `FieldComparison` records.
- Uniqueness is enforced by `opportunityId`, `fieldName`, and `capturedAt`, allowing multiple snapshots of the same field over time.

### SourceItem

`SourceItem` stores evidence or context material linked to an opportunity.

Key fields:

- `id`: primary key, seeded with deterministic source external IDs.
- `accountId`: optional account reference, set to `null` if the account is deleted.
- `opportunityId`: required opportunity reference.
- `contactId`: optional contact reference, set to `null` if the contact is deleted.
- `type`: `SourceType`, describing the source channel.
- `visibility`: `SourceVisibility`, defaulting to `INTERNAL`.
- `title`, `uri`, `body`: human-readable title, source URI, and source content.
- `occurredAt`: when the source event happened.
- `ingestedAt`: when the source was recorded locally; deterministic fixtures use `2026-05-30T12:00:00.000Z`.
- `metadataJson`: JSON string for fixture metadata such as author, authorization scope, duplicate marker, matched text, and linked record external ID.

Relationships:

- Optionally belongs to `Account` and `Contact`.
- Required to belong to one `Opportunity` and cascades on opportunity delete.
- Has many `ExtractedFact`, `Recommendation`, `AuditEvent`, and `FeedbackEvent` records.

### ExtractedFact

`ExtractedFact` stores normalized facts extracted from source material. Stage 1 defines the persistence shape, but the seed currently does not create extracted facts.

Key fields:

- `id`: primary key.
- `sourceItemId`: required source item reference.
- `opportunityId`: required opportunity reference.
- `contactId`: optional contact reference.
- `fieldName`: CRM or hygiene field the fact concerns.
- `factValue`: extracted normalized value as text.
- `confidence`: numeric confidence, defaulting to `0`.
- `status`: `FactStatus`, defaulting to `EXTRACTED`.
- `rationale`: optional explanation.
- `extractedAt`: extraction timestamp.

Relationships:

- Belongs to `SourceItem` and `Opportunity`; both cascade on delete.
- Optionally belongs to `Contact` and is retained with a `null` contact if the contact is deleted.
- Can be referenced by many `FieldComparison` records.

### FieldComparison

`FieldComparison` stores comparisons between CRM snapshot values and extracted facts. Stage 1 defines the table for later hygiene rule implementation, but deterministic seed data does not yet create comparisons.

Key fields:

- `id`: primary key.
- `opportunityId`: required opportunity reference.
- `snapshotId`: optional CRM snapshot reference.
- `extractedFactId`: optional extracted fact reference.
- `fieldName`: compared field.
- `crmValue`, `extractedValue`: compared values as strings.
- `status`: `FieldComparisonStatus`, defaulting to `NEEDS_REVIEW`.
- `confidence`: comparison confidence, defaulting to `0`.
- `notes`: optional reviewer or system notes.
- `createdAt`: comparison timestamp.

Relationships:

- Belongs to one `Opportunity` and cascades on opportunity delete.
- Optionally references `CRMFieldSnapshot` and `ExtractedFact`; deleting either source sets the reference to `null`.
- Can drive many `Recommendation` records.

### HygieneScore

`HygieneScore` stores calculated score outputs for an opportunity. The model is present for future hygiene logic; Stage 1 fixtures do not create scores.

Key fields:

- `id`: primary key.
- `opportunityId`: required opportunity reference.
- `overallScore`: required aggregate score.
- `completenessScore`, `freshnessScore`, `consistencyScore`, `confidenceScore`: optional score dimensions.
- `summary`: optional textual explanation.
- `calculatedAt`: score timestamp.

Relationships:

- Belongs to one `Opportunity` and cascades on opportunity delete.
- Can support many `Recommendation` records.

### Recommendation

`Recommendation` stores a proposed CRM update or hygiene action. Stage 1 persists the structure, but recommendations are not generated by the seed.

Key fields:

- `id`: primary key.
- `opportunityId`: required opportunity reference.
- `fieldComparisonId`, `sourceItemId`, `hygieneScoreId`: optional evidence and score references.
- `fieldName`: target CRM field.
- `currentValue`, `proposedValue`: existing and proposed values as strings.
- `rationale`: required explanation for the recommendation.
- `confidence`: numeric confidence, defaulting to `0`.
- `status`: `RecommendationStatus`, defaulting to `DRAFT`.
- `createdAt`, `updatedAt`: Prisma-managed lifecycle timestamps.

Relationships:

- Belongs to one `Opportunity` and cascades on opportunity delete.
- Optionally references a `FieldComparison`, `SourceItem`, and `HygieneScore`; deleting those dependencies sets the corresponding reference to `null`.
- Has many `ApprovalAction`, `AuditEvent`, and `FeedbackEvent` records.

### ApprovalAction

`ApprovalAction` stores approval workflow state for a recommendation. The model is defined for later workflow stages; Stage 1 seed data does not create approvals.

Key fields:

- `id`: primary key.
- `recommendationId`: required recommendation reference.
- `status`: `ApprovalStatus`, defaulting to `PENDING`.
- `actorId`, `actorName`: optional reviewer identity.
- `comment`: optional reviewer comment.
- `requestedAt`, `decidedAt`, `appliedAt`: approval lifecycle timestamps.

Relationships:

- Belongs to one `Recommendation`; deleting the recommendation deletes the approval action.
- Can be referenced by many `AuditEvent` records.

### AuditEvent

`AuditEvent` stores append-only-style history entries for important domain events. Stage 1 defines the event log shape, but the fixture loader currently deletes and leaves this table empty.

Key fields:

- `id`: primary key.
- `type`: `AuditEventType`.
- `actorId`, `actorName`: optional actor identity.
- `accountId`, `opportunityId`, `sourceItemId`, `recommendationId`, `approvalActionId`: optional typed references.
- `entityType`, `entityId`: generic fallback entity references.
- `message`: required human-readable event message.
- `metadataJson`: optional JSON string for event details.
- `createdAt`: event timestamp.

Relationships:

- Optionally references `Account`, `Opportunity`, `SourceItem`, `Recommendation`, and `ApprovalAction`.
- Deleting referenced records sets those foreign keys to `null`, preserving the audit row where possible.

### FeedbackEvent

`FeedbackEvent` captures user or evaluation feedback about recommendations, source evidence, contacts, or opportunity hygiene outcomes. Stage 1 defines the storage shape, but the seed currently leaves feedback empty.

Key fields:

- `id`: primary key.
- `opportunityId`: required opportunity reference.
- `recommendationId`, `sourceItemId`, `contactId`: optional references.
- `actorId`, `actorName`: optional feedback provider identity.
- `rating`: optional numeric rating.
- `signal`: required categorical signal string.
- `comment`: optional free-text feedback.
- `createdAt`: feedback timestamp.

Relationships:

- Belongs to one `Opportunity` and cascades on opportunity delete.
- Optionally references `Recommendation`, `SourceItem`, and `Contact`; deleting those records sets the reference to `null`.

## Enum Meanings

### OpportunityStage

- `PROSPECTING`: early unqualified interest.
- `QUALIFICATION`: qualification is underway.
- `DISCOVERY`: requirements, pain, stakeholders, or fit are being discovered.
- `PROPOSAL`: a proposal or commercial package has been shared or is in progress.
- `NEGOTIATION`: commercial, procurement, legal, or final terms are being negotiated.
- `CLOSED_WON`: opportunity was won.
- `CLOSED_LOST`: opportunity was lost.

### ForecastCategory

- `PIPELINE`: open deal not yet forecast as likely.
- `BEST_CASE`: upside deal that may close if conditions improve.
- `COMMIT`: seller/team commits the deal to the forecast.
- `CLOSED`: deal has closed.
- `OMITTED`: deal is intentionally excluded from forecast rollups.

### SourceType

- `EMAIL`: email evidence.
- `MEETING_NOTE`: meeting notes.
- `CALL_TRANSCRIPT`: call transcript content.
- `DOCUMENT`: document evidence.
- `CRM_NOTE`: note already stored in CRM.
- `SUPPORT_TICKET`: support ticket evidence.
- `WEB_PAGE`: web page evidence.
- `OTHER`: fallback for source types not otherwise modeled.

### SourceVisibility

- `PRIVATE`: owner-only or restricted evidence.
- `TEAM`: visible to the immediate account or sales team.
- `INTERNAL`: broadly internal visibility; this is the schema default.
- `PUBLIC`: externally/publicly visible source material.

### FactStatus

- `EXTRACTED`: raw extracted fact awaiting confirmation.
- `VERIFIED`: fact has been validated.
- `DISMISSED`: fact was rejected as irrelevant or incorrect.
- `STALE`: fact may no longer represent current reality.

### FieldComparisonStatus

- `MATCH`: CRM value and extracted value agree.
- `MISMATCH`: CRM value conflicts with extracted value.
- `MISSING_IN_CRM`: evidence exists but CRM lacks the value.
- `MISSING_IN_SOURCE`: CRM has a value not supported by the available source.
- `NEEDS_REVIEW`: comparison requires human or later rule review; this is the schema default.

### RecommendationStatus

- `DRAFT`: recommendation has been created but is not ready for review.
- `READY`: recommendation is ready to present.
- `PENDING_APPROVAL`: recommendation is awaiting approval.
- `APPROVED`: recommendation has been approved.
- `REJECTED`: recommendation has been rejected.
- `APPLIED`: recommendation has been applied to the target system or local record.
- `DISMISSED`: recommendation was dismissed without applying.

### ApprovalStatus

- `PENDING`: approval request is open.
- `APPROVED`: approver accepted the recommendation.
- `REJECTED`: approver rejected the recommendation.
- `APPLIED`: approved recommendation has been applied.
- `CANCELLED`: approval request was cancelled.

### AuditEventType

Audit event types map to major persisted lifecycle actions: creating accounts, contacts, and opportunities; capturing snapshots; ingesting sources; extracting facts; creating comparisons; calculating scores; creating, approving, applying, or rejecting recommendations; recording feedback; and updating records.

## Seed Fixture Scenarios

The deterministic seed file is anchored at `BASE_NOW = 2026-05-30T12:00:00.000Z`. It clears Stage 1 tables in dependency order, then creates 16 opportunity-centered fixtures with accounts, contacts, opportunity-contact joins, CRM field snapshots, and source items.

Every seeded opportunity includes default snapshots for `StageName`, `ForecastCategoryName`, `Amount`, and `CloseDate`. Some fixtures add scenario-specific snapshots such as `DecisionMaker__c`, `NextStep`, `ProcurementStatus__c`, `DemoCompleted__c`, `LegalStatus__c`, `SecurityStatus__c`, `LastActivityDate`, `NotesCount__c`, or `ContactCount__c`.

Seed scenarios:

- `OPP-001-HEALTHY`: clean commit/negotiation opportunity with current evidence, confirmed budget, signature path, and multiple contacts.
- `OPP-002-MISSING-DM`: discovery opportunity where the final signer is unknown.
- `OPP-003-STALE-NEXT-STEP`: proposal opportunity whose next step is dated before the seed anchor.
- `OPP-004-COMMIT-PROCUREMENT`: commit opportunity blocked by procurement/vendor onboarding.
- `OPP-005-UNREALISTIC-CLOSE`: close date is aggressive relative to missing demo and legal milestones.
- `OPP-006-STAGE-MISMATCH`: CRM stage says proposal while source evidence indicates discovery.
- `OPP-007-FORECAST-MISMATCH`: source indicates verbal commit while the CRM forecast remains pipeline.
- `OPP-008-LEGAL-PENDING`: legal terms are pending customer counsel review.
- `OPP-009-SECURITY-PENDING`: security questionnaire remains open.
- `OPP-010-NO-ACTIVITY-21`: only stale activity exists for a 21-day inactivity scenario.
- `OPP-011-CONFLICTING-NOTES`: notes disagree about budget approval, decision maker, and close timing.
- `OPP-012-AMBIGUOUS-MATCH`: similarly named Acme entities create ambiguous source matching.
- `OPP-013-NO-NOTES`: opportunity intentionally has no source items.
- `OPP-014-DUPLICATE-NOTES`: duplicate CRM notes are marked with `duplicateOf` metadata for consumer de-duplication.
- `OPP-015-OLD-NOTES-ONLY`: only old notes are available.
- `OPP-016-PRIVATE-SOURCE-NO-CONTACTS`: private source item with no linked opportunity contacts and authorization metadata set to owner-only.

Current seeded records are intentionally limited to `Account`, `Contact`, `Opportunity`, `OpportunityContact`, `CRMFieldSnapshot`, and `SourceItem`. The remaining models exist as Stage 1 database contracts for later stages.

## Known Model Tradeoffs

- SQLite is the Stage 1 datasource, so the schema optimizes for local deterministic tests rather than production database behavior.
- Many CRM and extracted values are stored as strings (`value`, `factValue`, `crmValue`, `extractedValue`, `currentValue`, `proposedValue`) to avoid committing to provider-specific field typing before adapter and rule stages.
- `metadataJson` is a string rather than a structured JSON column because the current datasource is SQLite and the seed only needs portable fixture metadata.
- `amount` is a `Float`, which is acceptable for fixtures but not ideal for production currency precision.
- IDs are CUID defaults in the schema, but fixtures deliberately override IDs with external-looking deterministic IDs so tests can assert relationships predictably.
- Source items require an `opportunityId`, which keeps Stage 1 evidence opportunity-centered but does not yet support account-only or contact-only source ingestion.
- Contact-account and source-account/contact relations use `SetNull` deletes to preserve evidence where possible, while opportunity-owned records generally cascade because opportunity hygiene data is scoped to the deal.
- Audit events are mutable/deletable through normal Prisma operations in Stage 1; append-only guarantees and retention policy are deferred.
- Confidence and score fields do not currently enforce ranges in Prisma, so validation remains a future application-layer responsibility.
- The schema models recommendations, approvals, audit, and feedback before their workflows exist so downstream stages can build against stable relations.

## Deferred to Future Stages

- CRM adapter contracts, provider-specific payload mapping, and live ingestion.
- Automated extraction of `ExtractedFact` records from `SourceItem` content.
- Hygiene rule execution, field comparison generation, and score calculation.
- Agent-generated recommendations and rationale quality evaluation.
- Approval workflow UI, applied-update flows, and CRM writeback.
- Audit UI, append-only enforcement, retention policy, and operational observability.
- Feedback collection UX and feedback-driven evaluation loops.
- Production database selection, migrations, stricter constraints, numeric precision improvements, and JSON column strategy.
- Authorization enforcement for `SourceVisibility` and source metadata scopes.
