# Stage 02 — Ingestion Agent

## Goal

Build the **Ingestion Agent only**: a deterministic service that accepts an opportunity ID, reads the already-seeded Prisma CRM data for that opportunity, and packages the allowed context needed by later stages.

Stage 2 is not a CRM synchronization stage and is not a reasoning or recommendation stage. Its only responsibility is to assemble a trustworthy `DealContextPackage` from local fixture data.

## Agent Contract

### Input

- `opportunityId`: the internal opportunity ID to ingest.

### Output

- `DealContextPackage`: a typed context package containing the opportunity, account, related contacts, CRM field snapshots, authorized source items, activity history, preserved source metadata, and ingestion warnings.

At minimum, the package should make these sections explicit:

- `opportunity`
- `account`
- `contacts`
- `crmFieldSnapshots`
- `sourceItems`
- `activityHistory`
- `warnings`

## Requirements

The Ingestion Agent must:

1. Load data from seeded Prisma records only:
   - Opportunity by the requested `opportunityId`.
   - Owning account.
   - Linked opportunity contacts and their contact records.
   - CRM field snapshots for the opportunity.
   - Source items linked to the opportunity.
   - Activity history derived from seeded source/activity records available in Prisma.
2. Exclude unauthorized or private source items from the returned `DealContextPackage`.
   - `PRIVATE` source items must not be exposed unless a future test fixture explicitly models authorized access for the requesting context.
   - Source items whose metadata marks them unauthorized must be excluded even if their visibility is otherwise broader.
3. Deduplicate repeated notes.
   - Prefer fixture metadata such as `duplicateOf` when available.
   - Fall back to stable note identity rules, such as normalized title/body/type/contact/occurred-at comparisons, only when metadata does not identify the duplicate.
   - Keep the canonical note deterministically so repeated runs return the same package.
4. Preserve source metadata.
   - Parse and retain useful source metadata such as author, source system, external ID, linked record details, authorization scope, duplicate markers, matched text, and any other fixture metadata.
   - Preserve enough metadata for downstream evidence traceability without exposing excluded private or unauthorized source content.
5. Sort source and activity records predictably.
   - Sort source items by `occurredAt` descending when present, then `ingestedAt` descending, then `id` ascending as a tie-breaker.
   - Sort activity history with the same deterministic ordering unless a narrower activity-specific ordering is introduced and documented.
   - Sort field snapshots by `capturedAt` descending, then `fieldName` ascending, then `id` ascending.
   - Sort contacts by primary opportunity-contact flag first, then role, last name, first name, email, and ID to avoid nondeterministic output.
6. Emit ingestion warnings for incomplete data.
   - Missing opportunity should return a typed not-found result or throw the documented ingestion error; it should not produce a partial package.
   - Missing account, missing contacts, missing field snapshots, missing authorized source items, unparsable metadata, filtered private/unauthorized sources, duplicate suppression, and records with missing dates should produce structured warnings.
   - Warnings should include a stable code, a human-readable message, severity, and affected record IDs when applicable.

## Out of Scope

Stage 2 must not implement:

- Extraction of facts from source content.
- Hygiene scoring or field comparison logic.
- Recommendations or proposed CRM updates.
- CRM writeback, approval, or audit mutation workflows.
- Live CRM integration, external API synchronization, OAuth, webhooks, or provider-specific adapters.

## Acceptance Criteria

### Unit Tests

Unit test coverage should prove the pure ingestion helpers and package shaping behavior are deterministic:

- Builds a `DealContextPackage` shape from mocked Prisma-like records for a single opportunity ID.
- Filters out `PRIVATE` source items and metadata-marked unauthorized source items.
- Deduplicates repeated notes using `duplicateOf` metadata and deterministic fallback rules.
- Parses and preserves source metadata without dropping traceability fields.
- Sorts source items, activity history, field snapshots, and contacts using the documented tie-breakers.
- Emits structured warnings for missing contacts, missing snapshots, missing authorized source items, unparsable metadata, excluded records, duplicate suppression, and missing timestamps.
- Does not call extraction, scoring, recommendation, writeback, or live CRM adapter code paths.

### Integration Tests

Integration tests should run against the seeded Prisma database and validate end-to-end behavior:

- Given a seeded opportunity ID, the Ingestion Agent loads the opportunity, account, contacts, CRM field snapshots, source items, and activity history into one `DealContextPackage`.
- Fixture opportunities with private or unauthorized sources exclude those source items from package source content while emitting a warning.
- Fixture opportunities with repeated notes return only canonical notes and emit a deduplication warning.
- Fixture opportunities with no notes, no contacts, old activity, or incomplete fixture data emit the expected warnings while still returning available authorized context.
- Repeated ingestion of the same opportunity returns deep-equal results when the underlying seed data has not changed.
- Unknown opportunity IDs fail with the documented not-found behavior and do not produce partial packages.
- Integration coverage uses seeded Prisma data only and does not perform live CRM calls, extraction, scoring, recommendations, or writeback.
