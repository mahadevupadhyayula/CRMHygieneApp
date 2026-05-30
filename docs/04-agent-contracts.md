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

## Stage 3 — Deal-to-Source Matching Agent

The Stage 3 Deal-to-Source Matching Agent compares CRM deal fields with the authorized source context packaged by the Stage 2 Ingestion Agent. It produces typed `SourceMatch` records that explain whether each requested deal attribute is supported by one or more source items, is ambiguous across competing evidence, or remains unmatched. It must not infer facts from private or unauthorized content, mutate CRM records, or emit recommendations beyond the bounded match result.

### Input Schema

```ts
type DealToSourceMatchingAgentInput = {
  /** Correlation ID for tracing a single matching run across logs and UI review. */
  runId: string;

  /** Package returned by the Stage 2 Ingestion Agent after privacy, authorization, and deduplication filters. */
  dealContext: DealContextPackage;

  /** Deal fields or derived attributes that should be matched against source evidence. */
  matchRequests: MatchRequest[];

  /** Optional matching controls. Defaults must be deterministic and documented by the implementation. */
  options?: {
    minimumMatchedConfidence?: number; // Defaults to 0.75.
    ambiguityDelta?: number; // Defaults to 0.10 between top candidate scores.
    maxEvidenceItemsPerMatch?: number; // Defaults to 3.
    includeRejectedCandidates?: boolean; // Defaults to false outside debug fixtures.
  };
};

type MatchRequest = {
  /** Stable identifier used to join the request to the SourceMatch output. */
  requestId: string;

  /** CRM field API name or normalized deal attribute name. */
  fieldName: string;

  /** Human-readable label for UI review. */
  fieldLabel: string;

  /** Current CRM value to validate or reconcile. */
  crmValue: unknown;

  /** Expected data type used for deterministic normalization and comparison. */
  dataType: "string" | "number" | "currency" | "date" | "datetime" | "picklist" | "boolean";

  /** Optional entity scope for matching source text to a specific account, contact, or opportunity. */
  entityScope?: {
    opportunityId?: string;
    accountId?: string;
    contactIds?: string[];
  };

  /** Optional field-specific instructions that are safe, deterministic, and testable. */
  matchingHints?: {
    acceptedSynonyms?: string[];
    acceptedDateToleranceDays?: number;
    acceptedNumericTolerance?: number;
    requiredSourceTypes?: SourceType[];
  };
};
```

Required input fields:

- `runId`: stable trace identifier for this match attempt.
- `dealContext`: a valid `DealContextPackage` that has already excluded private, unauthorized, and duplicate source items.
- `matchRequests`: one or more CRM deal fields or normalized attributes to match.

Optional input fields:

- `options.minimumMatchedConfidence`: threshold at or above which a match may be returned as `MATCHED` when no ambiguity rule is triggered.
- `options.ambiguityDelta`: maximum score gap between top candidates that requires an `AMBIGUOUS` result.
- `options.maxEvidenceItemsPerMatch`: cap on returned evidence references for deterministic UI display.
- `options.includeRejectedCandidates`: fixture/debug flag for returning rejected candidates; production responses should omit rejected source snippets unless explicitly needed for review.

### Output Schema for `SourceMatch`

```ts
type DealToSourceMatchingAgentOutput = {
  runId: string;
  opportunityId: string;
  matches: SourceMatch[];
  warnings: SourceMatchWarning[];
};

type SourceMatch = {
  requestId: string;
  fieldName: string;
  fieldLabel: string;
  crmValue: unknown;
  normalizedCrmValue: string | number | boolean | null;
  status: "MATCHED" | "AMBIGUOUS" | "UNMATCHED" | "ERROR";
  confidence: number; // Inclusive range: 0.0 to 1.0.
  confidenceBand: "high" | "medium" | "low" | "none";
  reasonCodes: SourceMatchReasonCode[];
  rationale: string;
  evidence: SourceEvidenceReference[];
  candidates?: SourceCandidate[];
  error?: SourceMatchError;
};

type SourceEvidenceReference = {
  sourceItemId: string;
  sourceType: SourceType;
  title?: string;
  occurredAt?: string; // ISO-8601 timestamp or date.
  matchedText: string;
  normalizedEvidenceValue: string | number | boolean | null;
  author?: string;
  sourceSystem?: string;
  externalId?: string;
};

type SourceCandidate = {
  sourceItemId: string;
  normalizedEvidenceValue: string | number | boolean | null;
  score: number;
  reasonCodes: SourceMatchReasonCode[];
};

type SourceMatchReasonCode =
  | "EXACT_VALUE_MATCH"
  | "NORMALIZED_VALUE_MATCH"
  | "SYNONYM_MATCH"
  | "DATE_WITHIN_TOLERANCE"
  | "NUMERIC_WITHIN_TOLERANCE"
  | "RECENT_AUTHORITATIVE_SOURCE"
  | "MULTIPLE_SUPPORTING_SOURCES"
  | "CONFLICTING_SOURCE_VALUES"
  | "TOP_CANDIDATES_WITHIN_AMBIGUITY_DELTA"
  | "SOURCE_VALUE_DIFFERS_FROM_CRM"
  | "NO_AUTHORIZED_SOURCE_FOUND"
  | "PRIVATE_SOURCE_EXCLUDED"
  | "UNAUTHORIZED_SOURCE_EXCLUDED"
  | "INSUFFICIENT_SOURCE_METADATA"
  | "UNSUPPORTED_FIELD_TYPE"
  | "INVALID_MATCH_REQUEST";

type SourceMatchWarning = {
  code:
    | "PRIVATE_SOURCE_EXCLUDED"
    | "UNAUTHORIZED_SOURCE_EXCLUDED"
    | "INSUFFICIENT_SOURCE_METADATA"
    | "NO_MATCH_REQUESTS"
    | "REJECTED_CANDIDATES_OMITTED";
  severity: "info" | "warning" | "error";
  message: string;
  affectedRecordIds?: string[];
};

type SourceMatchError = {
  code:
    | "INVALID_DEAL_CONTEXT"
    | "INVALID_MATCH_REQUEST"
    | "UNSUPPORTED_FIELD_TYPE"
    | "NO_AUTHORIZED_EVIDENCE_AVAILABLE"
    | "MATCHING_TIMEOUT";
  message: string;
  retryable: boolean;
};
```

`SourceMatch.evidence` must reference only included `DealContextPackage.sourceItems` records. It must never include raw content, snippets, metadata, or IDs from private or unauthorized source items except in aggregate warning `affectedRecordIds` when exposing the ID itself is permitted by the caller's authorization model.

### Confidence Semantics

Confidence is the agent's bounded assessment that the returned source evidence supports the CRM value for the requested field, not a probability that the CRM value is objectively true.

| Confidence band | Numeric range | Typical status | Semantics |
| --- | --- | --- | --- |
| `high` | `0.85` to `1.00` | `MATCHED` | Direct or normalized value agreement from authoritative, recent, and well-scoped evidence. Multiple independent sources may raise confidence when they agree. |
| `medium` | `0.60` to `0.84` | `MATCHED` or `AMBIGUOUS` | Evidence is relevant but requires tolerance, synonym handling, less-direct phrasing, or has a close competing candidate. |
| `low` | `0.01` to `0.59` | `AMBIGUOUS` or `UNMATCHED` | Evidence is weak, stale, incomplete, conflicting, or below the configured matched threshold. |
| `none` | `0.00` | `UNMATCHED` or `ERROR` | No authorized evidence can be used, or matching cannot proceed. |

Confidence rules:

- `confidence` must be deterministic for identical inputs and configuration.
- `MATCHED` requires `confidence >= minimumMatchedConfidence`, at least one evidence reference, and no triggered ambiguity rule.
- `AMBIGUOUS` may have high individual candidate scores when conflicting source values or close top candidates prevent a single supported value.
- `UNMATCHED` must use `confidence` `0.0` when there is no authorized candidate evidence, or a low score when weak candidates exist but fail thresholds.
- `ERROR` must use `confidenceBand: "none"` unless the error is attached to a single field after partial candidate evaluation; in that case the output may preserve candidate scores while setting `status: "ERROR"`.

### Reason-Code Examples

| Reason code | Example use |
| --- | --- |
| `EXACT_VALUE_MATCH` | CRM close date `2026-06-30` exactly appears in an authorized renewal note. |
| `NORMALIZED_VALUE_MATCH` | CRM amount `$125,000` matches source text `125000` after currency normalization. |
| `SYNONYM_MATCH` | CRM stage `Proposal` is supported by source text `pricing package sent` when `pricing package` is an accepted synonym. |
| `DATE_WITHIN_TOLERANCE` | CRM close date is one day later than the source's procurement date and the request allows a two-day tolerance. |
| `NUMERIC_WITHIN_TOLERANCE` | CRM amount differs by less than the configured rounding tolerance. |
| `RECENT_AUTHORITATIVE_SOURCE` | The best evidence is a recent account-plan note authored by the opportunity owner. |
| `MULTIPLE_SUPPORTING_SOURCES` | A call summary and follow-up email independently support the same next-step date. |
| `CONFLICTING_SOURCE_VALUES` | One authorized email says procurement signs in June while a later call note says July. |
| `TOP_CANDIDATES_WITHIN_AMBIGUITY_DELTA` | Candidate scores `0.82` and `0.78` fall within the configured `0.10` ambiguity delta. |
| `SOURCE_VALUE_DIFFERS_FROM_CRM` | The source says amount is `$118,000`, while CRM says `$125,000`. |
| `NO_AUTHORIZED_SOURCE_FOUND` | Only private notes mention the requested field, so no usable source remains after filtering. |
| `PRIVATE_SOURCE_EXCLUDED` | A private manager note is excluded before matching and cannot contribute evidence. |
| `UNAUTHORIZED_SOURCE_EXCLUDED` | A source item outside the caller's authorization scope is excluded before matching. |
| `INSUFFICIENT_SOURCE_METADATA` | A candidate lacks visibility or source-system metadata required to prove it is safe to use. |
| `UNSUPPORTED_FIELD_TYPE` | The request uses a field type not supported by the matching implementation. |
| `INVALID_MATCH_REQUEST` | The request is missing `requestId`, `fieldName`, or a parseable CRM value for the declared type. |

### Ambiguity Rules

The agent must return `status: "AMBIGUOUS"` instead of `MATCHED` when any of these conditions hold:

- Two or more authorized candidates support materially different normalized values and each candidate score is at or above the medium band.
- The top two candidate scores are within `options.ambiguityDelta`, even if the highest score exceeds `minimumMatchedConfidence`.
- Source evidence supports a value different from `crmValue`, but the evidence is not strong enough to safely declare the CRM value unsupported.
- Evidence depends on accepted synonyms or tolerances and another candidate with a literal value conflict exists.
- Required entity scope is unclear, such as source text that mentions a date but cannot be tied to the requested opportunity, account, or contact.

Ambiguous outputs must include candidate summaries for the competing normalized values when `includeRejectedCandidates` is enabled or when the UI review workflow requires them. The `rationale` must name the ambiguity class without revealing excluded private or unauthorized content.

### Unauthorized and Private-Source Exclusion Rules

The matching agent inherits Stage 2 safety constraints and must defensively re-check source eligibility before scoring candidates:

- Exclude every source item whose `visibility` is `PRIVATE` or whose metadata indicates private, personal, privileged, or manager-only content.
- Exclude every source item whose authorization metadata is missing, unparsable, outside the caller's allowed scope, or explicitly marked unauthorized.
- Exclude source items with insufficient metadata to prove source system, external ID, visibility, authorization scope, and linked record relationship when those fields are required for traceability.
- Do not use excluded source text for candidate generation, confidence scoring, rationale generation, examples, or hidden chain-of-thought.
- Emit `PRIVATE_SOURCE_EXCLUDED`, `UNAUTHORIZED_SOURCE_EXCLUDED`, or `INSUFFICIENT_SOURCE_METADATA` warnings with affected record IDs only when returning those IDs does not itself violate authorization.
- If all potentially relevant evidence is excluded, return `UNMATCHED` with `NO_AUTHORIZED_SOURCE_FOUND`; do not return `AMBIGUOUS` based on excluded material.

### Error States

| Error code | Condition | Expected behavior |
| --- | --- | --- |
| `INVALID_DEAL_CONTEXT` | The supplied `DealContextPackage` fails schema validation or lacks required opportunity/source metadata. | Return a blocking output-level error or field-level `ERROR` matches for all affected requests; do not score evidence. |
| `INVALID_MATCH_REQUEST` | A `MatchRequest` is missing required identifiers, declares an invalid data type, or provides an unparsable CRM value. | Return `status: "ERROR"` for that request and continue processing valid requests. |
| `UNSUPPORTED_FIELD_TYPE` | The field's data type or requested normalization mode is not implemented. | Return `status: "ERROR"` for that request with `retryable: false`. |
| `NO_AUTHORIZED_EVIDENCE_AVAILABLE` | No source items remain after privacy, authorization, and metadata eligibility checks. | Return `UNMATCHED` for affected requests unless the caller requires evidence availability as a blocking precondition. |
| `MATCHING_TIMEOUT` | Candidate extraction or scoring exceeds the configured deterministic timeout. | Return `status: "ERROR"` for incomplete requests with `retryable: true`; preserve completed matches. |

### Example Matched Output

```json
{
  "requestId": "match-close-date",
  "fieldName": "CloseDate",
  "fieldLabel": "Close Date",
  "crmValue": "2026-06-30",
  "normalizedCrmValue": "2026-06-30",
  "status": "MATCHED",
  "confidence": 0.93,
  "confidenceBand": "high",
  "reasonCodes": ["EXACT_VALUE_MATCH", "RECENT_AUTHORITATIVE_SOURCE"],
  "rationale": "The authorized renewal planning note directly supports the CRM close date.",
  "evidence": [
    {
      "sourceItemId": "src-acme-note-001",
      "sourceType": "NOTE",
      "title": "Renewal planning notes",
      "occurredAt": "2026-05-20T15:30:00.000Z",
      "matchedText": "Procurement confirmed target signature date of 2026-06-30.",
      "normalizedEvidenceValue": "2026-06-30",
      "author": "Account Executive",
      "sourceSystem": "salesforce-fixture",
      "externalId": "sf-note-001"
    }
  ]
}
```

### Example Ambiguous Output

```json
{
  "requestId": "match-next-step-date",
  "fieldName": "NextStepDate",
  "fieldLabel": "Next Step Date",
  "crmValue": "2026-06-10",
  "normalizedCrmValue": "2026-06-10",
  "status": "AMBIGUOUS",
  "confidence": 0.78,
  "confidenceBand": "medium",
  "reasonCodes": ["CONFLICTING_SOURCE_VALUES", "TOP_CANDIDATES_WITHIN_AMBIGUITY_DELTA"],
  "rationale": "Authorized sources contain two plausible next-step dates with similar scores, so human review is required.",
  "evidence": [
    {
      "sourceItemId": "src-acme-call-002",
      "sourceType": "CALL",
      "title": "Buyer follow-up call",
      "occurredAt": "2026-05-24T18:00:00.000Z",
      "matchedText": "Jane asked for the security review on 2026-06-10.",
      "normalizedEvidenceValue": "2026-06-10",
      "author": "Account Executive",
      "sourceSystem": "salesforce-fixture",
      "externalId": "sf-call-002"
    },
    {
      "sourceItemId": "src-acme-email-004",
      "sourceType": "EMAIL",
      "title": "Security review scheduling",
      "occurredAt": "2026-05-25T09:15:00.000Z",
      "matchedText": "The security review may need to move to 2026-06-12.",
      "normalizedEvidenceValue": "2026-06-12",
      "author": "Jane Buyer",
      "sourceSystem": "gmail-fixture",
      "externalId": "gm-email-004"
    }
  ],
  "candidates": [
    {
      "sourceItemId": "src-acme-call-002",
      "normalizedEvidenceValue": "2026-06-10",
      "score": 0.78,
      "reasonCodes": ["EXACT_VALUE_MATCH"]
    },
    {
      "sourceItemId": "src-acme-email-004",
      "normalizedEvidenceValue": "2026-06-12",
      "score": 0.74,
      "reasonCodes": ["SOURCE_VALUE_DIFFERS_FROM_CRM"]
    }
  ]
}
```

### Example Unmatched Output

```json
{
  "requestId": "match-competitor",
  "fieldName": "Competitor__c",
  "fieldLabel": "Competitor",
  "crmValue": "Globex",
  "normalizedCrmValue": "globex",
  "status": "UNMATCHED",
  "confidence": 0.0,
  "confidenceBand": "none",
  "reasonCodes": ["NO_AUTHORIZED_SOURCE_FOUND"],
  "rationale": "No authorized, non-private source item supports the CRM competitor value.",
  "evidence": []
}
```
