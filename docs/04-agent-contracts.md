# Agent Contracts

Agent contracts define the typed boundaries between deterministic services, reasoning agents, and human approval workflows. Each stage must keep schemas, invariants, error states, and fixtures explicit before implementation work depends on that contract.

## Expected Contract Properties

- Deterministic schema validation with Zod.
- Evidence references for every material recommendation.
- Explicit confidence and uncertainty fields.
- Human-readable rationale.
- Safe failure modes when required evidence is missing.

## Stage 2 — Ingestion Agent

The Stage 2 Ingestion Agent is a deterministic packaging service. It accepts a CRM opportunity identifier, reads seeded local CRM data for that opportunity, filters and deduplicates source context, and returns a `DealContextPackage` for downstream stages. It must not extract facts, score hygiene, generate recommendations, or write back to CRM systems.

### Input Schema

```ts
type IngestionAgentInput = {
  /** Internal opportunity ID to package. */
  opportunityId: string;

  /** Optional deterministic source filtering controls, if implemented. */
  sourceFilter?: {
    sourceTypes?: SourceType[];
    includeActivityBefore?: string; // ISO-8601 timestamp or date.
    includeActivityAfter?: string; // ISO-8601 timestamp or date.
    contactIds?: string[];
  };

  /** Optional deterministic deduplication controls, if implemented. */
  deduplication?: {
    enabled?: boolean; // Defaults to true.
    strategy?: "metadata" | "normalized-content" | "metadata-then-normalized-content";
  };
};
```

Required input fields:

- `opportunityId`: the internal opportunity ID to ingest.

Optional input fields, when implemented:

- `sourceFilter`: narrows source item inclusion by type, activity date range, or linked contact while still enforcing authorization and privacy rules.
- `deduplication`: controls whether repeated notes are removed and which deterministic strategy chooses the canonical note.

### Output Schema

```ts
type IngestionAgentOutput = DealContextPackage;

type DealContextPackage = {
  opportunity: OpportunityContext;
  account: AccountContext;
  contacts: ContactContext[];
  crmFieldSnapshots: CRMFieldSnapshotContext[];
  sourceItems: SourceItemContext[];
  activityHistory: ActivityContext[];
  warnings: IngestionWarning[];
};
```

The `DealContextPackage` must preserve enough source and CRM metadata for downstream evidence traceability without exposing filtered private or unauthorized source content.

### Invariants

The Stage 2 Ingestion Agent must always satisfy these invariants:

- No private source items are returned in `sourceItems` or `activityHistory`.
- No unauthorized source items are returned, including items whose metadata marks them unauthorized even if their visibility is otherwise broad.
- Source metadata is preserved for included source items, including source system, external ID, author, authorization scope, linked record details, duplicate markers, matched text, timestamps, and other fixture metadata needed for traceability.
- Duplicate notes are removed before the `DealContextPackage` is returned.
- Incomplete data emits structured warnings instead of failing silently, unless the condition is a documented error state.
- Ordering is deterministic so repeated runs over identical fixture data return equivalent packages.

### Error States

The agent should return or throw typed ingestion errors for conditions that prevent a trustworthy package from being produced:

| Error code | Condition | Expected behavior |
| --- | --- | --- |
| `OPPORTUNITY_NOT_FOUND` | No opportunity exists for `opportunityId`. | Do not return a partial package; return or throw the typed not-found error. |
| `MISSING_CRM_SNAPSHOTS` | The opportunity exists but has no CRM field snapshots. | Treat as a blocking ingestion error when snapshots are required for the stage; otherwise emit `MISSING_CRM_SNAPSHOTS` as a high-severity warning only if the implementation explicitly documents partial packages. |
| `INCOMPLETE_SOURCE_METADATA` | Required metadata for authorization, privacy, traceability, or deduplication is missing or unparsable. | Exclude unsafe source items when authorization or privacy cannot be proven; emit warnings for affected records, and fail only when metadata loss prevents a valid package. |

### Warning Shape

Warnings must be structured and stable enough for tests and downstream UIs to assert against:

```ts
type IngestionWarning = {
  code:
    | "NO_NOTES"
    | "NO_CONTACTS"
    | "OLD_NOTES_ONLY"
    | "PRIVATE_SOURCE_EXCLUDED"
    | "UNAUTHORIZED_SOURCE_EXCLUDED"
    | "DUPLICATE_SOURCE_EXCLUDED"
    | "MISSING_CRM_SNAPSHOTS"
    | "INCOMPLETE_SOURCE_METADATA"
    | "MISSING_SOURCE_TIMESTAMP";
  severity: "info" | "warning" | "error";
  message: string;
  affectedRecordIds?: string[];
};
```

### Test Fixtures

Stage 2 tests should include deterministic fixtures for these scenarios:

- `no notes`: an opportunity with valid CRM snapshots and contacts but no note-like source items; emits a `NO_NOTES` warning while returning the rest of the package.
- `duplicate notes`: an opportunity with repeated notes linked by `duplicateOf` metadata or normalized-content equivalence; returns only the canonical note and emits `DUPLICATE_SOURCE_EXCLUDED`.
- `old notes only`: an opportunity whose note-like source items are outside the configured or documented recency window; emits `OLD_NOTES_ONLY` while preserving the old included items unless filtering explicitly excludes them.
- `private source item`: an opportunity with at least one `PRIVATE` source item; excludes private content and emits `PRIVATE_SOURCE_EXCLUDED`.
- `multiple contacts`: an opportunity with multiple contact links and roles; returns all authorized linked contacts in deterministic order.
- `no contacts`: an opportunity with no contact links; returns an empty `contacts` array and emits `NO_CONTACTS`.

### Example Input

```json
{
  "opportunityId": "opp-acme-renewal-2026",
  "sourceFilter": {
    "sourceTypes": ["NOTE", "EMAIL", "CALL"],
    "includeActivityAfter": "2026-01-01T00:00:00.000Z"
  },
  "deduplication": {
    "enabled": true,
    "strategy": "metadata-then-normalized-content"
  }
}
```

### Example Output

```json
{
  "opportunity": {
    "id": "opp-acme-renewal-2026",
    "name": "Acme Renewal 2026",
    "stage": "PROPOSAL",
    "forecastCategory": "COMMIT",
    "amount": "125000",
    "closeDate": "2026-06-30"
  },
  "account": {
    "id": "acct-acme",
    "name": "Acme Corp"
  },
  "contacts": [
    {
      "id": "contact-jane-buyer",
      "firstName": "Jane",
      "lastName": "Buyer",
      "email": "jane.buyer@example.com",
      "role": "Economic Buyer",
      "isPrimary": true
    },
    {
      "id": "contact-sam-champion",
      "firstName": "Sam",
      "lastName": "Champion",
      "email": "sam.champion@example.com",
      "role": "Champion",
      "isPrimary": false
    }
  ],
  "crmFieldSnapshots": [
    {
      "id": "opp-acme-renewal-2026-SNAP-001",
      "fieldName": "StageName",
      "fieldLabel": "Stage",
      "dataType": "picklist",
      "value": "Proposal",
      "sourceSystem": "salesforce-fixture",
      "capturedAt": "2026-05-30T12:00:00.000Z"
    }
  ],
  "sourceItems": [
    {
      "id": "src-acme-note-001",
      "type": "NOTE",
      "visibility": "INTERNAL",
      "title": "Renewal planning notes",
      "body": "Economic buyer confirmed procurement timeline and renewal scope.",
      "occurredAt": "2026-05-20T15:30:00.000Z",
      "ingestedAt": "2026-05-30T12:00:00.000Z",
      "metadata": {
        "sourceSystem": "salesforce-fixture",
        "externalId": "sf-note-001",
        "author": "Account Executive",
        "authorizationScope": "deal-team",
        "duplicateOf": null,
        "linkedRecordExternalId": "006-acme-renewal"
      }
    }
  ],
  "activityHistory": [
    {
      "sourceItemId": "src-acme-note-001",
      "type": "NOTE",
      "title": "Renewal planning notes",
      "occurredAt": "2026-05-20T15:30:00.000Z",
      "contactId": "contact-jane-buyer"
    }
  ],
  "warnings": [
    {
      "code": "PRIVATE_SOURCE_EXCLUDED",
      "severity": "warning",
      "message": "Excluded private source items from the DealContextPackage.",
      "affectedRecordIds": ["src-acme-private-001"]
    },
    {
      "code": "DUPLICATE_SOURCE_EXCLUDED",
      "severity": "info",
      "message": "Removed duplicate note source items using metadata-then-normalized-content deduplication.",
      "affectedRecordIds": ["src-acme-note-duplicate-001"]
    }
  ]
}
```
