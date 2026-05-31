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

## Stage 4 — Entity Resolution Agent

The Stage 4 Entity Resolution Agent converts mentions in authorized deal context into typed `ResolvedEntity` records. It resolves contacts, role-only stakeholders, internal owners, documents, dates, discounts, accounts, and opportunities against CRM records and source evidence. It must not create CRM records, enrich from unauthorized sources, or treat an inferred entity as confirmed without sufficient evidence.

### Input Schema

```ts
type EntityResolutionAgentInput = {
  /** Correlation ID for tracing one entity-resolution run across logs and UI review. */
  runId: string;

  /** Package returned by the Stage 2 Ingestion Agent after privacy, authorization, and deduplication filters. */
  dealContext: DealContextPackage;

  /** Mentions to resolve from authorized source text or deterministic upstream extraction. */
  mentions: EntityMention[];

  /** Optional resolution controls. Defaults must be deterministic and documented by the implementation. */
  options?: {
    minimumResolvedConfidence?: number; // Defaults to 0.75.
    ambiguityDelta?: number; // Defaults to 0.10 between top candidate scores.
    maxEvidenceItemsPerEntity?: number; // Defaults to 3.
    referenceDate?: string; // ISO-8601 date used for relative-date normalization; defaults to run date.
    timezone?: string; // IANA timezone for date interpretation; defaults to opportunity/account timezone, then UTC.
    includeCandidates?: boolean; // Defaults to true for ambiguous entities and false otherwise.
  };
};

type EntityMention = {
  /** Stable identifier used to join the mention to the ResolvedEntity output. */
  mentionId: string;

  /** Source item that contains the mention. Must reference an included DealContextPackage.sourceItems record. */
  sourceItemId: string;

  /** Exact authorized text span or deterministic upstream mention text. */
  text: string;

  /** Optional character offsets within the source item body/title when available. */
  span?: {
    start: number;
    end: number;
  };

  /** Upstream expected type, if known. */
  expectedEntityType?: EntityType;

  /** Optional deal-scoped hints that constrain resolution. */
  resolutionHints?: {
    opportunityId?: string;
    accountId?: string;
    contactIds?: string[];
    ownerUserIds?: string[];
    acceptedRoleLabels?: string[];
    documentTypes?: DocumentEntityType[];
    currencyCode?: string;
  };
};
```

Required input fields:

- `runId`: stable trace identifier for this resolution attempt.
- `dealContext`: a valid `DealContextPackage` that has already excluded private, unauthorized, and duplicate source items.
- `mentions`: one or more mention spans to resolve. Empty arrays should return an empty `resolvedEntities` array plus a `NO_ENTITY_MENTIONS` warning.

Optional input fields:

- `options.minimumResolvedConfidence`: threshold at or above which an entity may be returned as `RESOLVED` when no ambiguity rule is triggered.
- `options.ambiguityDelta`: maximum score gap between top candidates that requires an `AMBIGUOUS` result.
- `options.maxEvidenceItemsPerEntity`: cap on returned evidence references for deterministic UI display.
- `options.referenceDate`: anchor date for phrases such as `next Friday`, `tomorrow`, or `end of quarter`.
- `options.timezone`: timezone used to interpret relative and date-only mentions.
- `options.includeCandidates`: controls whether non-winning candidate summaries are included.

### Output Schema for `ResolvedEntity`

```ts
type EntityResolutionAgentOutput = {
  runId: string;
  opportunityId: string;
  resolvedEntities: ResolvedEntity[];
  warnings: EntityResolutionWarning[];
};

type ResolvedEntity = {
  mentionId: string;
  sourceItemId: string;
  originalText: string;
  entityType: EntityType;
  status: "RESOLVED" | "AMBIGUOUS" | "UNRESOLVED" | "ERROR";
  confidence: number; // Inclusive range: 0.0 to 1.0.
  confidenceBand: "high" | "medium" | "low" | "none";
  normalizedValue: EntityNormalizedValue | null;
  displayName: string | null;
  resolvedRecordId?: string;
  resolvedExternalId?: string;
  reasonCodes: EntityResolutionReasonCode[];
  rationale: string;
  evidence: EntityEvidenceReference[];
  candidates?: EntityResolutionCandidate[];
  error?: EntityResolutionError;
};

type EntityNormalizedValue =
  | { type: "contact"; contactId: string; name: string; email?: string; role?: string }
  | { type: "role"; roleLabel: string; accountId?: string; opportunityId?: string }
  | { type: "internal_owner"; userId: string; name: string; team?: string }
  | { type: "document"; documentId?: string; title: string; documentType?: DocumentEntityType; url?: string }
  | { type: "date"; date: string; precision: "day" | "week" | "month" | "quarter"; timezone: string; referenceDate: string }
  | { type: "discount"; value: number; unit: "percent" | "currency"; currencyCode?: string; basis?: "list_price" | "annual_contract_value" | "total_contract_value" | "unknown" }
  | { type: "account"; accountId: string; name: string }
  | { type: "opportunity"; opportunityId: string; name: string };

type EntityEvidenceReference = {
  sourceItemId: string;
  sourceType: SourceType;
  title?: string;
  occurredAt?: string; // ISO-8601 timestamp or date.
  matchedText: string;
  author?: string;
  sourceSystem?: string;
  externalId?: string;
};

type EntityResolutionCandidate = {
  entityType: EntityType;
  displayName: string;
  normalizedValue: EntityNormalizedValue | null;
  resolvedRecordId?: string;
  score: number;
  reasonCodes: EntityResolutionReasonCode[];
};

type EntityResolutionReasonCode =
  | "EXACT_NAME_MATCH"
  | "NORMALIZED_NAME_MATCH"
  | "EMAIL_MATCH"
  | "CRM_ROLE_MATCH"
  | "ROLE_ONLY_MENTION"
  | "INTERNAL_OWNER_MATCH"
  | "DOCUMENT_TITLE_MATCH"
  | "DOCUMENT_TYPE_MATCH"
  | "RELATIVE_DATE_NORMALIZED"
  | "EXPLICIT_DATE_NORMALIZED"
  | "DISCOUNT_PERCENT_NORMALIZED"
  | "DISCOUNT_CURRENCY_NORMALIZED"
  | "ACCOUNT_SCOPE_MATCH"
  | "OPPORTUNITY_SCOPE_MATCH"
  | "MULTIPLE_SUPPORTING_SOURCES"
  | "CONFLICTING_ENTITY_CANDIDATES"
  | "TOP_CANDIDATES_WITHIN_AMBIGUITY_DELTA"
  | "INSUFFICIENT_EVIDENCE"
  | "NO_AUTHORIZED_EVIDENCE_FOUND"
  | "PRIVATE_SOURCE_EXCLUDED"
  | "UNAUTHORIZED_SOURCE_EXCLUDED"
  | "INVALID_ENTITY_MENTION";

type EntityResolutionWarning = {
  code:
    | "NO_ENTITY_MENTIONS"
    | "PRIVATE_SOURCE_EXCLUDED"
    | "UNAUTHORIZED_SOURCE_EXCLUDED"
    | "INSUFFICIENT_SOURCE_METADATA"
    | "RELATIVE_DATE_WITHOUT_REFERENCE_DATE"
    | "CANDIDATES_OMITTED";
  severity: "info" | "warning" | "error";
  message: string;
  affectedRecordIds?: string[];
};

type EntityResolutionError = {
  code:
    | "INVALID_DEAL_CONTEXT"
    | "INVALID_ENTITY_MENTION"
    | "UNSUPPORTED_ENTITY_TYPE"
    | "NO_AUTHORIZED_EVIDENCE_AVAILABLE"
    | "DATE_NORMALIZATION_FAILED"
    | "RESOLUTION_TIMEOUT";
  message: string;
  retryable: boolean;
};
```

`ResolvedEntity.evidence` must reference only source items included in `DealContextPackage.sourceItems`. Evidence must not include raw snippets, metadata, IDs, or derived facts from private or unauthorized records except aggregate warning IDs when the caller is authorized to see those IDs.

### Entity Type Enum and Confidence Semantics

```ts
type EntityType =
  | "CONTACT"
  | "ROLE_ONLY_STAKEHOLDER"
  | "INTERNAL_OWNER"
  | "DOCUMENT_REFERENCE"
  | "DATE"
  | "DISCOUNT"
  | "ACCOUNT"
  | "OPPORTUNITY";

type DocumentEntityType =
  | "ORDER_FORM"
  | "MSA"
  | "SOW"
  | "SECURITY_REVIEW"
  | "LEGAL_REDLINES"
  | "PRICING_PROPOSAL"
  | "OTHER";
```

Confidence is the agent's bounded assessment that the returned normalized entity is the best deal-scoped resolution for the mention. It is not a claim that the real-world fact is objectively true.

| Confidence band | Numeric range | Typical status | Semantics |
| --- | --- | --- | --- |
| `high` | `0.85` to `1.00` | `RESOLVED` | Direct CRM identifier, exact email/name match, explicit date, or unique document/title match with authoritative scoped evidence. |
| `medium` | `0.60` to `0.84` | `RESOLVED` or `AMBIGUOUS` | Evidence is relevant but depends on role labels, aliases, relative-date normalization, partial document titles, or a close competing candidate. |
| `low` | `0.01` to `0.59` | `AMBIGUOUS` or `UNRESOLVED` | Evidence is weak, stale, incomplete, only role-like, or below `minimumResolvedConfidence`. |
| `none` | `0.00` | `UNRESOLVED` or `ERROR` | No authorized evidence can be used, or validation/normalization failed before resolution. |

### Evidence Requirements

The Entity Resolution Agent must meet these evidence requirements:

- Every `RESOLVED` or `AMBIGUOUS` entity must include at least one `EntityEvidenceReference` from an authorized, non-private `sourceItemId` in the provided `DealContextPackage`.
- Evidence must include the exact `matchedText` span used for resolution and preserve source type, title, timestamp, source system, author, and external ID when available.
- Named contacts should be supported by CRM contact identity evidence such as exact name, normalized name, email address, linked contact ID, or a source mention tied to an included contact.
- Role-only stakeholders must remain `ROLE_ONLY_STAKEHOLDER` unless there is sufficient authorized evidence to identify a specific contact.
- Internal owners must resolve only to internal user/owner records present in CRM context or explicit owner metadata; external contacts must not be coerced into owners.
- Document references must include either a document title, a stable document ID/link, or a document type plus source context that scopes the document to the opportunity.
- Date and discount entities must preserve the original text and the deterministic normalization basis in `normalizedValue`.
- Excluded private or unauthorized source content must not be used for candidate generation, scoring, rationale, or hidden intermediate reasoning.

### Date Normalization Rules

Date normalization must be deterministic and reviewable:

- Normalize explicit dates to ISO-8601 `YYYY-MM-DD` in `normalizedValue.date`.
- Interpret date-only mentions in `options.timezone`, then opportunity/account timezone, then UTC.
- Interpret relative phrases against `options.referenceDate` when provided; otherwise use the run date and emit `RELATIVE_DATE_WITHOUT_REFERENCE_DATE` with `severity: "warning"`.
- Preserve the anchor in `normalizedValue.referenceDate` and the applied timezone in `normalizedValue.timezone`.
- Use `precision: "day"` for exact days, `"week"` for week-level phrases such as `next week`, `"month"` for month-level phrases, and `"quarter"` for quarter-level phrases.
- Resolve `tomorrow`, `yesterday`, and weekday names to the nearest future or specified relative date according to documented implementation rules; examples and tests must pin `referenceDate` to avoid clock-dependent fixtures.
- Return `DATE_NORMALIZATION_FAILED` when a date phrase is malformed, locale-dependent without a locale, or conflicts with the provided timezone/reference date.

### Ambiguity Rules

The agent must return `status: "AMBIGUOUS"` instead of `RESOLVED` when any of these conditions hold:

- Two or more authorized candidates of the same entity type have scores at or above the medium band and materially different normalized values.
- The top two candidate scores are within `options.ambiguityDelta`, even if the highest score exceeds `minimumResolvedConfidence`.
- A mention could validly represent different entity types, such as `security review` as either a document reference or an activity, and the expected type does not disambiguate it.
- A role-only stakeholder mention matches multiple contacts with the same role and no evidence uniquely identifies one person.
- A document reference contains only a generic document type and multiple in-scope documents of that type exist.
- A relative date can map to multiple dates because the reference date, timezone, locale, or business-calendar rule is missing or contradictory.
- A discount mention lacks enough basis to distinguish percent versus currency, list-price basis versus contract-value basis, or proposed versus approved discount.

Ambiguous outputs should include `candidates` when `options.includeCandidates` is true or when downstream UI review needs candidate choices. The `rationale` must explain the ambiguity class without exposing private or unauthorized content.

### Error States

| Error code | Condition | Expected behavior |
| --- | --- | --- |
| `INVALID_DEAL_CONTEXT` | The supplied `DealContextPackage` fails schema validation or lacks required opportunity/source metadata. | Return a blocking output-level error or entity-level `ERROR` records for all affected mentions; do not score candidates. |
| `INVALID_ENTITY_MENTION` | A mention lacks `mentionId`, `sourceItemId`, text, or valid span offsets, or references a source item absent from the package. | Return `status: "ERROR"` for that mention and continue processing valid mentions. |
| `UNSUPPORTED_ENTITY_TYPE` | The requested `expectedEntityType` or normalized value type is not implemented. | Return `status: "ERROR"` for that mention with `retryable: false`. |
| `NO_AUTHORIZED_EVIDENCE_AVAILABLE` | No source items remain after privacy, authorization, and metadata eligibility checks. | Return `UNRESOLVED` for affected mentions unless the caller requires evidence availability as a blocking precondition. |
| `DATE_NORMALIZATION_FAILED` | A date mention cannot be normalized deterministically. | Return `status: "ERROR"` for the date mention with a rationale that names the missing or contradictory normalization input. |
| `RESOLUTION_TIMEOUT` | Candidate extraction, date normalization, or scoring exceeds the configured deterministic timeout. | Return `status: "ERROR"` for incomplete mentions with `retryable: true`; preserve completed entities. |

### Example Input

```json
{
  "runId": "entity-resolution-acme-001",
  "dealContext": {
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
      }
    ],
    "crmFieldSnapshots": [],
    "sourceItems": [
      {
        "id": "src-acme-note-entity-001",
        "type": "NOTE",
        "visibility": "INTERNAL",
        "title": "Renewal stakeholder update",
        "body": "Jane Buyer asked the economic buyer to review the order form tomorrow. Account owner Maria Lopez said procurement mentioned a 10% discount.",
        "occurredAt": "2026-05-30T15:30:00.000Z",
        "ingestedAt": "2026-05-30T16:00:00.000Z",
        "metadata": {
          "sourceSystem": "salesforce-fixture",
          "externalId": "sf-note-entity-001",
          "author": "Account Executive",
          "authorizationScope": "deal-team",
          "duplicateOf": null,
          "linkedRecordExternalId": "006-acme-renewal"
        }
      }
    ],
    "activityHistory": [],
    "warnings": []
  },
  "mentions": [
    {
      "mentionId": "mention-named-contact",
      "sourceItemId": "src-acme-note-entity-001",
      "text": "Jane Buyer",
      "expectedEntityType": "CONTACT"
    },
    {
      "mentionId": "mention-role-only",
      "sourceItemId": "src-acme-note-entity-001",
      "text": "economic buyer",
      "expectedEntityType": "ROLE_ONLY_STAKEHOLDER"
    },
    {
      "mentionId": "mention-internal-owner",
      "sourceItemId": "src-acme-note-entity-001",
      "text": "Account owner Maria Lopez",
      "expectedEntityType": "INTERNAL_OWNER"
    },
    {
      "mentionId": "mention-document-reference",
      "sourceItemId": "src-acme-note-entity-001",
      "text": "order form",
      "expectedEntityType": "DOCUMENT_REFERENCE"
    },
    {
      "mentionId": "mention-relative-date",
      "sourceItemId": "src-acme-note-entity-001",
      "text": "tomorrow",
      "expectedEntityType": "DATE"
    },
    {
      "mentionId": "mention-discount",
      "sourceItemId": "src-acme-note-entity-001",
      "text": "10% discount",
      "expectedEntityType": "DISCOUNT"
    }
  ],
  "options": {
    "referenceDate": "2026-05-30",
    "timezone": "UTC",
    "minimumResolvedConfidence": 0.75,
    "ambiguityDelta": 0.1,
    "maxEvidenceItemsPerEntity": 3,
    "includeCandidates": true
  }
}
```

### Example Output

```json
{
  "runId": "entity-resolution-acme-001",
  "opportunityId": "opp-acme-renewal-2026",
  "resolvedEntities": [
    {
      "mentionId": "mention-named-contact",
      "sourceItemId": "src-acme-note-entity-001",
      "originalText": "Jane Buyer",
      "entityType": "CONTACT",
      "status": "RESOLVED",
      "confidence": 0.96,
      "confidenceBand": "high",
      "normalizedValue": {
        "type": "contact",
        "contactId": "contact-jane-buyer",
        "name": "Jane Buyer",
        "email": "jane.buyer@example.com",
        "role": "Economic Buyer"
      },
      "displayName": "Jane Buyer",
      "resolvedRecordId": "contact-jane-buyer",
      "reasonCodes": ["EXACT_NAME_MATCH", "ACCOUNT_SCOPE_MATCH"],
      "rationale": "The named contact exactly matches an in-scope CRM contact on the Acme opportunity.",
      "evidence": [
        {
          "sourceItemId": "src-acme-note-entity-001",
          "sourceType": "NOTE",
          "title": "Renewal stakeholder update",
          "occurredAt": "2026-05-30T15:30:00.000Z",
          "matchedText": "Jane Buyer",
          "author": "Account Executive",
          "sourceSystem": "salesforce-fixture",
          "externalId": "sf-note-entity-001"
        }
      ]
    },
    {
      "mentionId": "mention-role-only",
      "sourceItemId": "src-acme-note-entity-001",
      "originalText": "economic buyer",
      "entityType": "ROLE_ONLY_STAKEHOLDER",
      "status": "RESOLVED",
      "confidence": 0.78,
      "confidenceBand": "medium",
      "normalizedValue": {
        "type": "role",
        "roleLabel": "Economic Buyer",
        "accountId": "acct-acme",
        "opportunityId": "opp-acme-renewal-2026"
      },
      "displayName": "Economic Buyer",
      "reasonCodes": ["ROLE_ONLY_MENTION", "CRM_ROLE_MATCH", "OPPORTUNITY_SCOPE_MATCH"],
      "rationale": "The mention identifies a stakeholder role but does not by itself identify a unique person, so it remains a role-only entity.",
      "evidence": [
        {
          "sourceItemId": "src-acme-note-entity-001",
          "sourceType": "NOTE",
          "title": "Renewal stakeholder update",
          "occurredAt": "2026-05-30T15:30:00.000Z",
          "matchedText": "economic buyer",
          "author": "Account Executive",
          "sourceSystem": "salesforce-fixture",
          "externalId": "sf-note-entity-001"
        }
      ]
    },
    {
      "mentionId": "mention-internal-owner",
      "sourceItemId": "src-acme-note-entity-001",
      "originalText": "Account owner Maria Lopez",
      "entityType": "INTERNAL_OWNER",
      "status": "RESOLVED",
      "confidence": 0.91,
      "confidenceBand": "high",
      "normalizedValue": {
        "type": "internal_owner",
        "userId": "user-maria-lopez",
        "name": "Maria Lopez",
        "team": "Enterprise Sales"
      },
      "displayName": "Maria Lopez",
      "resolvedRecordId": "user-maria-lopez",
      "reasonCodes": ["INTERNAL_OWNER_MATCH", "ACCOUNT_SCOPE_MATCH"],
      "rationale": "The owner mention matches the in-scope internal account owner record.",
      "evidence": [
        {
          "sourceItemId": "src-acme-note-entity-001",
          "sourceType": "NOTE",
          "title": "Renewal stakeholder update",
          "occurredAt": "2026-05-30T15:30:00.000Z",
          "matchedText": "Account owner Maria Lopez",
          "author": "Account Executive",
          "sourceSystem": "salesforce-fixture",
          "externalId": "sf-note-entity-001"
        }
      ]
    },
    {
      "mentionId": "mention-document-reference",
      "sourceItemId": "src-acme-note-entity-001",
      "originalText": "order form",
      "entityType": "DOCUMENT_REFERENCE",
      "status": "RESOLVED",
      "confidence": 0.83,
      "confidenceBand": "medium",
      "normalizedValue": {
        "type": "document",
        "documentId": "doc-acme-order-form-2026",
        "title": "Acme Renewal 2026 Order Form",
        "documentType": "ORDER_FORM"
      },
      "displayName": "Acme Renewal 2026 Order Form",
      "resolvedRecordId": "doc-acme-order-form-2026",
      "reasonCodes": ["DOCUMENT_TYPE_MATCH", "OPPORTUNITY_SCOPE_MATCH"],
      "rationale": "The document type mention resolves to the in-scope Acme renewal order form because only one authorized order form is linked to the opportunity.",
      "evidence": [
        {
          "sourceItemId": "src-acme-note-entity-001",
          "sourceType": "NOTE",
          "title": "Renewal stakeholder update",
          "occurredAt": "2026-05-30T15:30:00.000Z",
          "matchedText": "order form",
          "author": "Account Executive",
          "sourceSystem": "salesforce-fixture",
          "externalId": "sf-note-entity-001"
        }
      ]
    },
    {
      "mentionId": "mention-relative-date",
      "sourceItemId": "src-acme-note-entity-001",
      "originalText": "tomorrow",
      "entityType": "DATE",
      "status": "RESOLVED",
      "confidence": 0.88,
      "confidenceBand": "high",
      "normalizedValue": {
        "type": "date",
        "date": "2026-05-31",
        "precision": "day",
        "timezone": "UTC",
        "referenceDate": "2026-05-30"
      },
      "displayName": "2026-05-31",
      "reasonCodes": ["RELATIVE_DATE_NORMALIZED", "OPPORTUNITY_SCOPE_MATCH"],
      "rationale": "The relative date was normalized deterministically from the pinned reference date in UTC.",
      "evidence": [
        {
          "sourceItemId": "src-acme-note-entity-001",
          "sourceType": "NOTE",
          "title": "Renewal stakeholder update",
          "occurredAt": "2026-05-30T15:30:00.000Z",
          "matchedText": "tomorrow",
          "author": "Account Executive",
          "sourceSystem": "salesforce-fixture",
          "externalId": "sf-note-entity-001"
        }
      ]
    },
    {
      "mentionId": "mention-discount",
      "sourceItemId": "src-acme-note-entity-001",
      "originalText": "10% discount",
      "entityType": "DISCOUNT",
      "status": "RESOLVED",
      "confidence": 0.81,
      "confidenceBand": "medium",
      "normalizedValue": {
        "type": "discount",
        "value": 10,
        "unit": "percent",
        "basis": "unknown"
      },
      "displayName": "10% discount",
      "reasonCodes": ["DISCOUNT_PERCENT_NORMALIZED", "OPPORTUNITY_SCOPE_MATCH"],
      "rationale": "The discount amount is explicit, but the pricing basis is not stated, so the normalized basis remains unknown.",
      "evidence": [
        {
          "sourceItemId": "src-acme-note-entity-001",
          "sourceType": "NOTE",
          "title": "Renewal stakeholder update",
          "occurredAt": "2026-05-30T15:30:00.000Z",
          "matchedText": "10% discount",
          "author": "Account Executive",
          "sourceSystem": "salesforce-fixture",
          "externalId": "sf-note-entity-001"
        }
      ]
    }
  ],
  "warnings": []
}
```

## Stage 5 — Structured Extraction Agent

The Stage 5 Structured Extraction Agent converts authorized deal context into typed extracted facts that may later drive CRM hygiene recommendations. It may use a bounded model provider to classify and normalize source text, but it must keep schemas, provider behavior, evidence references, confidence semantics, and recommendation eligibility deterministic enough for automated tests and human review. It must not write to CRM fields, make autonomous recommendations without eligibility checks, or use private, unauthorized, or metadata-incomplete source content.

### Input Schema

```ts
type StructuredExtractionAgentInput = {
  /** Correlation ID for tracing one extraction run across logs and UI review. */
  runId: string;

  /** Package returned by the Stage 2 Ingestion Agent after privacy, authorization, and deduplication filters. */
  dealContext: DealContextPackage;

  /** CRM fields or normalized hygiene facts the caller wants extracted. Empty means use the default supported fact set. */
  extractionRequests?: ExtractionRequest[];

  /** Optional model provider. Production implementations inject this dependency rather than hard-coding a vendor. */
  modelProvider?: AIModelProvider;

  /** Optional extraction controls. Defaults must be documented and fixture-stable. */
  options?: {
    referenceDate?: string; // ISO-8601 date used for relative-date normalization; defaults to run date.
    timezone?: string; // IANA timezone for date interpretation; defaults to opportunity/account timezone, then UTC.
    minimumFactConfidence?: number; // Defaults to 0.70.
    minimumRecommendationConfidence?: number; // Defaults to 0.85.
    maxEvidenceItemsPerFact?: number; // Defaults to 3.
    maxFactsPerSourceItem?: number; // Defaults to 10.
    allowModelProvider?: boolean; // Defaults to true in production and false in deterministic unit tests unless injected.
    includeIneligibleFacts?: boolean; // Defaults to true for review/debug outputs.
  };
};

type ExtractionRequest = {
  /** Stable identifier used to join request-specific warnings or errors to the caller. */
  requestId: string;

  /** Fact types to extract for this request. */
  factTypes: ExtractedFactType[];

  /** Optional CRM field API names that should receive mapping metadata when supported. */
  targetFieldNames?: string[];

  /** Optional source constraints for this request. */
  sourceFilter?: {
    sourceItemIds?: string[];
    sourceTypes?: SourceType[];
    occurredAfter?: string;
    occurredBefore?: string;
  };

  /** Optional deterministic hints that must be safe to log and test. */
  extractionHints?: {
    acceptedPhrases?: string[];
    requiredEntityTypes?: EntityType[];
    preferredDatePrecision?: "day" | "week" | "month" | "quarter";
    currencyCode?: string;
  };
};
```

Required input fields:

- `runId`: stable trace identifier for this extraction attempt.
- `dealContext`: a valid `DealContextPackage` that has already excluded private, unauthorized, and duplicate source items.

Optional input fields:

- `extractionRequests`: narrows extraction to specific fact types, CRM field targets, or source subsets. If omitted, the agent extracts the default supported fact set.
- `modelProvider`: model dependency implementing `AIModelProvider`; tests should inject `MockModelProvider`.
- `options.referenceDate` and `options.timezone`: anchors for relative-date normalization such as `next Friday`, `tomorrow`, or `end of quarter`.
- `options.minimumFactConfidence`: minimum confidence for a fact to be returned as `EXTRACTED`.
- `options.minimumRecommendationConfidence`: minimum confidence required before a fact can be eligible for recommendation generation.
- `options.includeIneligibleFacts`: controls whether facts that are valid but not recommendation-eligible remain visible for audit.

### Output Schema for Extracted Facts

```ts
type StructuredExtractionAgentOutput = {
  runId: string;
  opportunityId: string;
  extractedFacts: ExtractedFact[];
  warnings: StructuredExtractionWarning[];
  error?: StructuredExtractionRunError;
};

type ExtractedFact = {
  factId: string;
  requestId?: string;
  factType: ExtractedFactType;
  status: "EXTRACTED" | "INELIGIBLE" | "AMBIGUOUS" | "NO_FACT" | "ERROR";
  normalizedValue: ExtractedFactValue | null;
  displayValue: string | null;
  crmFieldMapping: CRMFieldMapping | null;
  recommendationEligibility: RecommendationEligibility;
  confidence: number; // Inclusive range: 0.0 to 1.0.
  confidenceBand: "high" | "medium" | "low" | "none";
  reasonCodes: StructuredExtractionReasonCode[];
  rationale: string;
  evidence: FactEvidenceReference[];
  sourceMetadata: ExtractedFactSourceMetadata[];
  alternatives?: ExtractedFactAlternative[];
  error?: StructuredExtractionFactError;
};

type ExtractedFactValue =
  | { type: "text"; value: string }
  | { type: "date"; value: string; precision: "day" | "week" | "month" | "quarter"; timezone: string }
  | { type: "boolean"; value: boolean }
  | { type: "number"; value: number; unit?: string }
  | { type: "currency"; value: string; currencyCode: string }
  | { type: "person"; name?: string; contactId?: string; role?: string; email?: string }
  | { type: "process_status"; status: string; owner?: string; blocker?: string }
  | { type: "enum"; value: string; enumSet: string };

type CRMFieldMapping = {
  fieldName: string;
  fieldLabel: string;
  dataType: "string" | "number" | "currency" | "date" | "datetime" | "picklist" | "boolean";
  updateSemantics: "replace" | "append" | "clear" | "no_update";
  currentCrmValue?: unknown;
  proposedCrmValue: unknown;
  conflictPolicy: "only_if_blank" | "if_stale" | "if_confidence_higher" | "manual_review_required" | "never_auto_update";
};

type RecommendationEligibility = {
  eligible: boolean;
  reasonCodes: RecommendationEligibilityReasonCode[];
  requiredReview: "none" | "human_review" | "manager_review" | "legal_review";
};

type FactEvidenceReference = {
  sourceItemId: string;
  sourceType: SourceType;
  title?: string;
  occurredAt?: string;
  matchedText: string;
  normalizedEvidenceValue: ExtractedFactValue | null;
  author?: string;
  sourceSystem: string;
  externalId: string;
  linkedRecordExternalId?: string;
};

type ExtractedFactSourceMetadata = {
  sourceItemId: string;
  sourceSystem: string;
  externalId: string;
  sourceType: SourceType;
  visibility: "INTERNAL" | "PUBLIC" | "CUSTOMER_SHARED";
  authorizationScope: string;
  author?: string;
  occurredAt?: string;
  ingestedAt?: string;
  linkedRecordExternalId?: string;
};

type ExtractedFactAlternative = {
  normalizedValue: ExtractedFactValue;
  displayValue: string;
  confidence: number;
  evidence: FactEvidenceReference[];
  reasonCodes: StructuredExtractionReasonCode[];
};
```

The output must include one `ExtractedFact` per material extracted fact. If no extractable facts are found, the agent returns an empty `extractedFacts` array plus a `NO_EXTRACTABLE_FACTS` warning rather than fabricating a low-confidence fact.

### `AIModelProvider` Interface

```ts
type AIModelProvider = {
  /** Provider name used for tracing and fixture assertions. */
  readonly name: string;

  /** Optional model identifier, such as a hosted model name or local mock variant. */
  readonly model?: string;

  /** Returns structured fact candidates from already-authorized source payloads. */
  extractFacts(request: AIModelExtractionRequest): Promise<AIModelExtractionResponse>;
};

type AIModelExtractionRequest = {
  runId: string;
  opportunityId: string;
  allowedFactTypes: ExtractedFactType[];
  sources: AIModelSourcePayload[];
  referenceDate: string;
  timezone: string;
  schemaVersion: "structured-extraction.v1";
};

type AIModelSourcePayload = {
  sourceItemId: string;
  sourceType: SourceType;
  title?: string;
  body: string;
  occurredAt?: string;
  metadata: {
    sourceSystem: string;
    externalId: string;
    author?: string;
    authorizationScope: string;
    linkedRecordExternalId?: string;
  };
};

type AIModelExtractionResponse = {
  candidates: AIModelFactCandidate[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
  };
  warnings?: string[];
};

type AIModelFactCandidate = {
  factType: ExtractedFactType;
  rawText: string;
  normalizedValue: ExtractedFactValue | null;
  sourceItemId: string;
  confidence: number;
  rationale: string;
};
```

The agent owns validation, safety filtering, CRM field mapping, eligibility checks, and final confidence bands. The provider only proposes candidates from payloads the agent has already verified as authorized and traceable.

### `MockModelProvider` Testing Contract

```ts
type MockModelProviderFixture = {
  name: "mock-model-provider";
  responsesByRunId?: Record<string, AIModelExtractionResponse>;
  responsesBySourceItemId?: Record<string, AIModelExtractionResponse>;
  defaultResponse?: AIModelExtractionResponse;
  forcedError?: AIModelProviderError;
};

type AIModelProviderError = {
  code: "MODEL_PROVIDER_UNAVAILABLE" | "MODEL_PROVIDER_TIMEOUT" | "MODEL_PROVIDER_SCHEMA_VIOLATION";
  message: string;
  retryable: boolean;
};
```

`MockModelProvider` must satisfy these testing rules:

- It returns fixture responses without network calls, randomness, clock reads, or hidden state.
- It keys responses by `runId` first, then by `sourceItemId`, then by `defaultResponse`.
- It can force typed provider errors for timeout, unavailability, and schema-violation tests.
- It echoes no private or unauthorized content because tests must only pass already-authorized `AIModelSourcePayload` objects into the provider.
- It preserves candidate order exactly as configured so ambiguity and tie-breaker tests remain deterministic.

### Fact Type Enum and CRM Field Mapping Semantics

```ts
type ExtractedFactType =
  | "NEXT_STEP"
  | "NEXT_STEP_DATE"
  | "CFO_APPROVAL_STATUS"
  | "PROCUREMENT_STATUS"
  | "PROCUREMENT_BLOCKER"
  | "LEGAL_REVIEW_STATUS"
  | "LEGAL_PENDING_ITEM"
  | "ECONOMIC_BUYER"
  | "DECISION_PROCESS"
  | "CLOSE_DATE_SIGNAL"
  | "AMOUNT_SIGNAL"
  | "COMPETITOR_MENTION"
  | "RISK_SIGNAL";

type StructuredExtractionReasonCode =
  | "DIRECT_STATEMENT"
  | "NORMALIZED_DATE"
  | "NORMALIZED_STATUS"
  | "ROLE_OR_PERSON_IDENTIFIED"
  | "PROCESS_BLOCKER_IDENTIFIED"
  | "RECENT_AUTHORITATIVE_SOURCE"
  | "MULTIPLE_SUPPORTING_SOURCES"
  | "CONFLICTING_FACT_VALUES"
  | "LOW_MODEL_CONFIDENCE"
  | "MISSING_REQUIRED_EVIDENCE"
  | "MISSING_SOURCE_METADATA"
  | "PRIVATE_SOURCE_EXCLUDED"
  | "UNAUTHORIZED_SOURCE_EXCLUDED"
  | "FIELD_MAPPING_UNSUPPORTED"
  | "RECOMMENDATION_ELIGIBLE"
  | "RECOMMENDATION_INELIGIBLE"
  | "NO_FACT_CANDIDATE";

type RecommendationEligibilityReasonCode =
  | "CONFIDENCE_THRESHOLD_MET"
  | "SUPPORTED_CRM_FIELD_MAPPING"
  | "EVIDENCE_REQUIREMENTS_MET"
  | "SOURCE_METADATA_REQUIREMENTS_MET"
  | "CRM_VALUE_BLANK"
  | "CRM_VALUE_STALE"
  | "CRM_VALUE_CONFLICTS_WITH_EVIDENCE"
  | "LOW_CONFIDENCE"
  | "AMBIGUOUS_EVIDENCE"
  | "UNSUPPORTED_CRM_FIELD_MAPPING"
  | "INSUFFICIENT_EVIDENCE"
  | "LEGAL_REVIEW_REQUIRED"
  | "MANAGER_REVIEW_REQUIRED"
  | "NO_CRM_UPDATE_ALLOWED";
```

CRM field mappings must be explicit and conservative:

| Fact type | Default CRM field mapping | Update semantics | Notes |
| --- | --- | --- | --- |
| `NEXT_STEP` | `NextStep` | `replace` or `append` | Use `replace` only when evidence states a current action clearly; otherwise append to preserve existing context. |
| `NEXT_STEP_DATE` | `NextStepDate__c` | `replace` | Date must be normalized to a specific day unless the field supports lower precision. |
| `CFO_APPROVAL_STATUS` | `CFO_Approval_Status__c` | `replace` | Map to an approved picklist value such as `Approved`, `Pending`, `Blocked`, or `Not Required`. |
| `PROCUREMENT_STATUS` | `Procurement_Status__c` | `replace` | Status summaries may update only supported picklist values. |
| `PROCUREMENT_BLOCKER` | `Procurement_Blocker__c` | `replace` or `append` | Append if the field already contains unresolved blockers not contradicted by evidence. |
| `LEGAL_REVIEW_STATUS` | `Legal_Review_Status__c` | `replace` | Legal status updates require evidence that identifies review state or owner. |
| `LEGAL_PENDING_ITEM` | `Legal_Pending_Item__c` | `replace` or `append` | Legal pending facts require human or legal review before recommendations. |
| `ECONOMIC_BUYER` | `Economic_Buyer__c` | `replace` | Prefer resolved CRM contact IDs when available; otherwise require human review. |
| `DECISION_PROCESS` | `Decision_Process__c` | `append` | Preserve prior process notes unless a later authoritative source supersedes them. |
| `CLOSE_DATE_SIGNAL` | `CloseDate` | `replace` | Never auto-update if the source is speculative or conflicts with forecast policy. |
| `AMOUNT_SIGNAL` | `Amount` | `replace` | Requires currency normalization and agreement with product/pricing context. |
| `COMPETITOR_MENTION` | `Competitor__c` | `append` | Multiple competitors are possible; do not overwrite without human review. |
| `RISK_SIGNAL` | `Deal_Risk__c` | `append` | Risk signals are review inputs, not direct CRM truth. |

### Evidence Requirements

Every returned `EXTRACTED`, `INELIGIBLE`, or `AMBIGUOUS` fact must include evidence unless its status is `NO_FACT` or `ERROR`:

- Evidence must reference one or more included `DealContextPackage.sourceItems` by `sourceItemId`.
- `matchedText` must be the shortest authorized snippet that supports the extracted value without exposing unrelated content.
- Evidence must include `sourceType`, `sourceSystem`, `externalId`, and either `occurredAt` or a documented reason for missing time data.
- Recommendation-eligible facts require direct evidence from at least one authoritative source item or two independent supporting source items.
- Ambiguous facts must include evidence for each material competing value unless doing so would expose excluded content; excluded content may only be summarized through warnings.
- The agent must not cite private, unauthorized, or metadata-incomplete source items as evidence.

### Source Metadata Requirements

Source metadata is required for both provider input and final output:

- `sourceSystem`, `externalId`, `authorizationScope`, `visibility`, and linked opportunity/account metadata must be present and parseable before a source item can be sent to `AIModelProvider`.
- `sourceItemId` must match an included `DealContextPackage.sourceItems` record.
- `visibility` must be `INTERNAL`, `PUBLIC`, or `CUSTOMER_SHARED`; `PRIVATE` items are excluded.
- `authorizationScope` must permit the caller and the extraction workflow to use the content.
- `occurredAt` is required for time-sensitive facts such as next step, legal status, procurement status, close-date signal, and amount signal unless an implementation-specific warning explains why recency cannot be assessed.
- `author` should be preserved when available and must not be fabricated.

### Confidence Semantics

Confidence is the agent's bounded assessment that the authorized evidence supports the normalized extracted fact and its CRM mapping. It is not a probability that the fact is objectively true.

| Confidence band | Numeric range | Typical status | Semantics |
| --- | --- | --- | --- |
| `high` | `0.85` to `1.00` | `EXTRACTED` | Direct, recent, well-scoped evidence supports a normalized value and CRM mapping. Multiple independent sources may increase confidence. |
| `medium` | `0.60` to `0.84` | `EXTRACTED`, `INELIGIBLE`, or `AMBIGUOUS` | Evidence is relevant but less direct, older, model-normalized, or needs human review before recommendation. |
| `low` | `0.01` to `0.59` | `INELIGIBLE`, `AMBIGUOUS`, or `NO_FACT` | Evidence is weak, incomplete, stale, conflicting, or below the configured fact threshold. |
| `none` | `0.00` | `NO_FACT` or `ERROR` | No authorized candidate exists, or extraction failed before a fact could be scored. |

The final confidence must never exceed the provider candidate confidence unless deterministic post-processing adds corroborating authorized evidence. Confidence must be capped below `options.minimumRecommendationConfidence` when required evidence, source metadata, or CRM field mapping is missing.

### Recommendation Eligibility Rules

A fact is recommendation-eligible only when all of these conditions hold:

- `status` is `EXTRACTED`.
- `confidence` is at or above `options.minimumRecommendationConfidence`.
- `crmFieldMapping` is non-null and uses a supported `fieldName`, `dataType`, and `updateSemantics`.
- Evidence and source metadata requirements are satisfied.
- The proposed CRM value is materially useful: the target CRM value is blank, stale, lower confidence, or conflicts with stronger source evidence.
- The fact is not ambiguous and has no unresolved competing alternative with medium-or-higher confidence.
- The fact type is not blocked from recommendation by policy. Legal pending items require at least `legal_review`, and manager-sensitive facts require `manager_review`.
- The update respects the field mapping `conflictPolicy`; `never_auto_update` facts may be surfaced for review but cannot become automated recommendations.

Ineligible facts should remain auditable when `includeIneligibleFacts` is true, with `recommendationEligibility.eligible: false` and clear eligibility reason codes.

### Error States

```ts
type StructuredExtractionWarning = {
  code:
    | "NO_EXTRACTABLE_FACTS"
    | "PRIVATE_SOURCE_EXCLUDED"
    | "UNAUTHORIZED_SOURCE_EXCLUDED"
    | "MISSING_SOURCE_METADATA"
    | "MISSING_SOURCE_TIMESTAMP"
    | "MODEL_PROVIDER_WARNING"
    | "FACT_BELOW_CONFIDENCE_THRESHOLD"
    | "RECOMMENDATION_INELIGIBLE";
  severity: "info" | "warning" | "error";
  message: string;
  affectedRecordIds?: string[];
};

type StructuredExtractionFactError = {
  code:
    | "INVALID_EXTRACTION_REQUEST"
    | "UNSUPPORTED_FACT_TYPE"
    | "FIELD_MAPPING_UNSUPPORTED"
    | "EVIDENCE_VALIDATION_FAILED"
    | "SOURCE_METADATA_VALIDATION_FAILED"
    | "MODEL_PROVIDER_SCHEMA_VIOLATION";
  message: string;
  retryable: boolean;
};

type StructuredExtractionRunError = {
  code:
    | "INVALID_DEAL_CONTEXT"
    | "NO_AUTHORIZED_SOURCE_AVAILABLE"
    | "MODEL_PROVIDER_UNAVAILABLE"
    | "MODEL_PROVIDER_TIMEOUT"
    | "MODEL_PROVIDER_SCHEMA_VIOLATION";
  message: string;
  retryable: boolean;
};
```

| Error code | Condition | Expected behavior |
| --- | --- | --- |
| `INVALID_DEAL_CONTEXT` | The supplied package fails schema validation or lacks required opportunity/source metadata. | Return a blocking run-level error; do not call the model provider. |
| `NO_AUTHORIZED_SOURCE_AVAILABLE` | No source items remain after privacy, authorization, and metadata checks. | Return no facts and a run-level error or warning according to caller policy; do not infer from excluded content. |
| `INVALID_EXTRACTION_REQUEST` | A request is missing identifiers, fact types, or declares incompatible field constraints. | Return request-scoped `ERROR` facts where possible and continue valid requests. |
| `UNSUPPORTED_FACT_TYPE` | The requested fact type is not implemented. | Return a fact-level `ERROR` with `retryable: false`. |
| `FIELD_MAPPING_UNSUPPORTED` | A fact can be extracted but cannot be mapped to a supported CRM field. | Return `INELIGIBLE` or fact-level `ERROR` according to caller policy; never recommend an update. |
| `EVIDENCE_VALIDATION_FAILED` | Candidate evidence cannot be tied to an authorized source item or supporting text span. | Drop the candidate or return `INELIGIBLE`; never mark recommendation-eligible. |
| `SOURCE_METADATA_VALIDATION_FAILED` | Required source metadata is missing or unsafe. | Exclude the source item and emit `MISSING_SOURCE_METADATA`; fail only if no valid sources remain. |
| `MODEL_PROVIDER_UNAVAILABLE` | The provider cannot be reached or initialized. | Return a retryable run-level error unless a deterministic fallback is explicitly configured. |
| `MODEL_PROVIDER_TIMEOUT` | Provider extraction exceeds timeout. | Return retryable run-level or request-level errors; preserve completed facts only when partial output is valid. |
| `MODEL_PROVIDER_SCHEMA_VIOLATION` | Provider returns malformed candidates. | Reject malformed candidates, emit typed errors, and do not trust provider confidence. |

### Example: Clean Next Step

#### Input

```json
{
  "runId": "structured-extraction-next-step-001",
  "dealContext": {
    "opportunity": {
      "id": "opp-acme-renewal-2026",
      "name": "Acme Renewal 2026",
      "stage": "Proposal",
      "forecastCategory": "Commit",
      "amount": "125000",
      "closeDate": "2026-06-30"
    },
    "account": {
      "id": "acct-acme",
      "name": "Acme Corp"
    },
    "contacts": [],
    "crmFieldSnapshots": [
      {
        "id": "snap-next-step",
        "fieldName": "NextStep",
        "fieldLabel": "Next Step",
        "dataType": "string",
        "value": "",
        "sourceSystem": "salesforce-fixture",
        "capturedAt": "2026-05-30T12:00:00.000Z"
      }
    ],
    "sourceItems": [
      {
        "id": "src-next-step-001",
        "type": "CALL",
        "visibility": "INTERNAL",
        "title": "Buyer follow-up call",
        "body": "Jane asked us to send the revised order form by Friday and schedule the security review for June 10.",
        "occurredAt": "2026-05-29T18:00:00.000Z",
        "ingestedAt": "2026-05-30T12:00:00.000Z",
        "metadata": {
          "sourceSystem": "gong-fixture",
          "externalId": "gong-call-001",
          "author": "Account Executive",
          "authorizationScope": "deal-team",
          "duplicateOf": null,
          "linkedRecordExternalId": "006-acme-renewal"
        }
      }
    ],
    "activityHistory": [],
    "warnings": []
  },
  "extractionRequests": [
    {
      "requestId": "extract-next-step",
      "factTypes": ["NEXT_STEP", "NEXT_STEP_DATE"],
      "targetFieldNames": ["NextStep", "NextStepDate__c"]
    }
  ],
  "options": {
    "referenceDate": "2026-05-30",
    "timezone": "UTC"
  }
}
```

#### Output

```json
{
  "runId": "structured-extraction-next-step-001",
  "opportunityId": "opp-acme-renewal-2026",
  "extractedFacts": [
    {
      "factId": "fact-next-step-001",
      "requestId": "extract-next-step",
      "factType": "NEXT_STEP",
      "status": "EXTRACTED",
      "normalizedValue": {
        "type": "text",
        "value": "Send the revised order form by Friday and schedule the security review for June 10."
      },
      "displayValue": "Send revised order form; schedule security review for June 10",
      "crmFieldMapping": {
        "fieldName": "NextStep",
        "fieldLabel": "Next Step",
        "dataType": "string",
        "updateSemantics": "replace",
        "currentCrmValue": "",
        "proposedCrmValue": "Send revised order form; schedule security review for June 10",
        "conflictPolicy": "only_if_blank"
      },
      "recommendationEligibility": {
        "eligible": true,
        "reasonCodes": ["CONFIDENCE_THRESHOLD_MET", "SUPPORTED_CRM_FIELD_MAPPING", "EVIDENCE_REQUIREMENTS_MET", "SOURCE_METADATA_REQUIREMENTS_MET", "CRM_VALUE_BLANK"],
        "requiredReview": "none"
      },
      "confidence": 0.91,
      "confidenceBand": "high",
      "reasonCodes": ["DIRECT_STATEMENT", "RECENT_AUTHORITATIVE_SOURCE", "RECOMMENDATION_ELIGIBLE"],
      "rationale": "The authorized call directly states the next action and the CRM field is blank.",
      "evidence": [
        {
          "sourceItemId": "src-next-step-001",
          "sourceType": "CALL",
          "title": "Buyer follow-up call",
          "occurredAt": "2026-05-29T18:00:00.000Z",
          "matchedText": "send the revised order form by Friday and schedule the security review for June 10",
          "normalizedEvidenceValue": {
            "type": "text",
            "value": "Send the revised order form by Friday and schedule the security review for June 10."
          },
          "author": "Account Executive",
          "sourceSystem": "gong-fixture",
          "externalId": "gong-call-001",
          "linkedRecordExternalId": "006-acme-renewal"
        }
      ],
      "sourceMetadata": [
        {
          "sourceItemId": "src-next-step-001",
          "sourceSystem": "gong-fixture",
          "externalId": "gong-call-001",
          "sourceType": "CALL",
          "visibility": "INTERNAL",
          "authorizationScope": "deal-team",
          "author": "Account Executive",
          "occurredAt": "2026-05-29T18:00:00.000Z",
          "ingestedAt": "2026-05-30T12:00:00.000Z",
          "linkedRecordExternalId": "006-acme-renewal"
        }
      ]
    }
  ],
  "warnings": []
}
```

### Example: CFO Approval

#### Input

```json
{
  "runId": "structured-extraction-cfo-001",
  "dealContext": {
    "opportunity": { "id": "opp-acme-renewal-2026", "name": "Acme Renewal 2026", "stage": "Proposal", "forecastCategory": "Commit", "amount": "125000", "closeDate": "2026-06-30" },
    "account": { "id": "acct-acme", "name": "Acme Corp" },
    "contacts": [],
    "crmFieldSnapshots": [
      { "id": "snap-cfo", "fieldName": "CFO_Approval_Status__c", "fieldLabel": "CFO Approval Status", "dataType": "picklist", "value": "Pending", "sourceSystem": "salesforce-fixture", "capturedAt": "2026-05-30T12:00:00.000Z" }
    ],
    "sourceItems": [
      {
        "id": "src-cfo-approval-001",
        "type": "EMAIL",
        "visibility": "CUSTOMER_SHARED",
        "title": "Re: Renewal approval",
        "body": "Our CFO approved the renewal amount this morning. Please send the final order form.",
        "occurredAt": "2026-05-28T14:10:00.000Z",
        "ingestedAt": "2026-05-30T12:00:00.000Z",
        "metadata": { "sourceSystem": "gmail-fixture", "externalId": "gm-cfo-001", "author": "Jane Buyer", "authorizationScope": "deal-team", "duplicateOf": null, "linkedRecordExternalId": "006-acme-renewal" }
      }
    ],
    "activityHistory": [],
    "warnings": []
  },
  "extractionRequests": [
    { "requestId": "extract-cfo", "factTypes": ["CFO_APPROVAL_STATUS"], "targetFieldNames": ["CFO_Approval_Status__c"] }
  ]
}
```

#### Output

```json
{
  "runId": "structured-extraction-cfo-001",
  "opportunityId": "opp-acme-renewal-2026",
  "extractedFacts": [
    {
      "factId": "fact-cfo-approval-001",
      "requestId": "extract-cfo",
      "factType": "CFO_APPROVAL_STATUS",
      "status": "EXTRACTED",
      "normalizedValue": { "type": "enum", "value": "Approved", "enumSet": "CFOApprovalStatus" },
      "displayValue": "CFO approved",
      "crmFieldMapping": { "fieldName": "CFO_Approval_Status__c", "fieldLabel": "CFO Approval Status", "dataType": "picklist", "updateSemantics": "replace", "currentCrmValue": "Pending", "proposedCrmValue": "Approved", "conflictPolicy": "if_confidence_higher" },
      "recommendationEligibility": { "eligible": true, "reasonCodes": ["CONFIDENCE_THRESHOLD_MET", "SUPPORTED_CRM_FIELD_MAPPING", "EVIDENCE_REQUIREMENTS_MET", "SOURCE_METADATA_REQUIREMENTS_MET", "CRM_VALUE_CONFLICTS_WITH_EVIDENCE"], "requiredReview": "none" },
      "confidence": 0.93,
      "confidenceBand": "high",
      "reasonCodes": ["DIRECT_STATEMENT", "NORMALIZED_STATUS", "RECENT_AUTHORITATIVE_SOURCE", "RECOMMENDATION_ELIGIBLE"],
      "rationale": "The customer-shared email directly states that CFO approval has been granted.",
      "evidence": [
        { "sourceItemId": "src-cfo-approval-001", "sourceType": "EMAIL", "title": "Re: Renewal approval", "occurredAt": "2026-05-28T14:10:00.000Z", "matchedText": "Our CFO approved the renewal amount this morning", "normalizedEvidenceValue": { "type": "enum", "value": "Approved", "enumSet": "CFOApprovalStatus" }, "author": "Jane Buyer", "sourceSystem": "gmail-fixture", "externalId": "gm-cfo-001", "linkedRecordExternalId": "006-acme-renewal" }
      ],
      "sourceMetadata": [
        { "sourceItemId": "src-cfo-approval-001", "sourceSystem": "gmail-fixture", "externalId": "gm-cfo-001", "sourceType": "EMAIL", "visibility": "CUSTOMER_SHARED", "authorizationScope": "deal-team", "author": "Jane Buyer", "occurredAt": "2026-05-28T14:10:00.000Z", "ingestedAt": "2026-05-30T12:00:00.000Z", "linkedRecordExternalId": "006-acme-renewal" }
      ]
    }
  ],
  "warnings": []
}
```

### Example: Procurement Blocker

#### Input

```json
{
  "runId": "structured-extraction-procurement-001",
  "dealContext": {
    "opportunity": { "id": "opp-acme-renewal-2026", "name": "Acme Renewal 2026", "stage": "Proposal", "forecastCategory": "Commit", "amount": "125000", "closeDate": "2026-06-30" },
    "account": { "id": "acct-acme", "name": "Acme Corp" },
    "contacts": [],
    "crmFieldSnapshots": [
      { "id": "snap-procurement", "fieldName": "Procurement_Blocker__c", "fieldLabel": "Procurement Blocker", "dataType": "string", "value": "", "sourceSystem": "salesforce-fixture", "capturedAt": "2026-05-30T12:00:00.000Z" }
    ],
    "sourceItems": [
      {
        "id": "src-procurement-001",
        "type": "NOTE",
        "visibility": "INTERNAL",
        "title": "Procurement update",
        "body": "Procurement cannot issue the PO until vendor onboarding is complete and tax forms are uploaded.",
        "occurredAt": "2026-05-27T16:30:00.000Z",
        "ingestedAt": "2026-05-30T12:00:00.000Z",
        "metadata": { "sourceSystem": "salesforce-fixture", "externalId": "sf-note-proc-001", "author": "Account Executive", "authorizationScope": "deal-team", "duplicateOf": null, "linkedRecordExternalId": "006-acme-renewal" }
      }
    ],
    "activityHistory": [],
    "warnings": []
  },
  "extractionRequests": [
    { "requestId": "extract-procurement", "factTypes": ["PROCUREMENT_BLOCKER"], "targetFieldNames": ["Procurement_Blocker__c"] }
  ]
}
```

#### Output

```json
{
  "runId": "structured-extraction-procurement-001",
  "opportunityId": "opp-acme-renewal-2026",
  "extractedFacts": [
    {
      "factId": "fact-procurement-blocker-001",
      "requestId": "extract-procurement",
      "factType": "PROCUREMENT_BLOCKER",
      "status": "EXTRACTED",
      "normalizedValue": { "type": "process_status", "status": "Blocked", "blocker": "Vendor onboarding incomplete; tax forms not uploaded" },
      "displayValue": "Blocked: vendor onboarding incomplete and tax forms not uploaded",
      "crmFieldMapping": { "fieldName": "Procurement_Blocker__c", "fieldLabel": "Procurement Blocker", "dataType": "string", "updateSemantics": "replace", "currentCrmValue": "", "proposedCrmValue": "Vendor onboarding incomplete; tax forms not uploaded", "conflictPolicy": "only_if_blank" },
      "recommendationEligibility": { "eligible": true, "reasonCodes": ["CONFIDENCE_THRESHOLD_MET", "SUPPORTED_CRM_FIELD_MAPPING", "EVIDENCE_REQUIREMENTS_MET", "SOURCE_METADATA_REQUIREMENTS_MET", "CRM_VALUE_BLANK"], "requiredReview": "none" },
      "confidence": 0.89,
      "confidenceBand": "high",
      "reasonCodes": ["DIRECT_STATEMENT", "PROCESS_BLOCKER_IDENTIFIED", "RECENT_AUTHORITATIVE_SOURCE", "RECOMMENDATION_ELIGIBLE"],
      "rationale": "The internal procurement update directly names the blocker preventing PO issuance.",
      "evidence": [
        { "sourceItemId": "src-procurement-001", "sourceType": "NOTE", "title": "Procurement update", "occurredAt": "2026-05-27T16:30:00.000Z", "matchedText": "cannot issue the PO until vendor onboarding is complete and tax forms are uploaded", "normalizedEvidenceValue": { "type": "process_status", "status": "Blocked", "blocker": "Vendor onboarding incomplete; tax forms not uploaded" }, "author": "Account Executive", "sourceSystem": "salesforce-fixture", "externalId": "sf-note-proc-001", "linkedRecordExternalId": "006-acme-renewal" }
      ],
      "sourceMetadata": [
        { "sourceItemId": "src-procurement-001", "sourceSystem": "salesforce-fixture", "externalId": "sf-note-proc-001", "sourceType": "NOTE", "visibility": "INTERNAL", "authorizationScope": "deal-team", "author": "Account Executive", "occurredAt": "2026-05-27T16:30:00.000Z", "ingestedAt": "2026-05-30T12:00:00.000Z", "linkedRecordExternalId": "006-acme-renewal" }
      ]
    }
  ],
  "warnings": []
}
```

### Example: Legal Pending

#### Input

```json
{
  "runId": "structured-extraction-legal-001",
  "dealContext": {
    "opportunity": { "id": "opp-acme-renewal-2026", "name": "Acme Renewal 2026", "stage": "Proposal", "forecastCategory": "Commit", "amount": "125000", "closeDate": "2026-06-30" },
    "account": { "id": "acct-acme", "name": "Acme Corp" },
    "contacts": [],
    "crmFieldSnapshots": [
      { "id": "snap-legal", "fieldName": "Legal_Pending_Item__c", "fieldLabel": "Legal Pending Item", "dataType": "string", "value": "", "sourceSystem": "salesforce-fixture", "capturedAt": "2026-05-30T12:00:00.000Z" }
    ],
    "sourceItems": [
      {
        "id": "src-legal-001",
        "type": "EMAIL",
        "visibility": "INTERNAL",
        "title": "MSA review",
        "body": "Legal is still reviewing the data processing addendum; no redlines are expected before Tuesday.",
        "occurredAt": "2026-05-26T21:45:00.000Z",
        "ingestedAt": "2026-05-30T12:00:00.000Z",
        "metadata": { "sourceSystem": "gmail-fixture", "externalId": "gm-legal-001", "author": "Account Executive", "authorizationScope": "deal-team", "duplicateOf": null, "linkedRecordExternalId": "006-acme-renewal" }
      }
    ],
    "activityHistory": [],
    "warnings": []
  },
  "extractionRequests": [
    { "requestId": "extract-legal", "factTypes": ["LEGAL_PENDING_ITEM"], "targetFieldNames": ["Legal_Pending_Item__c"] }
  ],
  "options": { "referenceDate": "2026-05-30", "timezone": "UTC" }
}
```

#### Output

```json
{
  "runId": "structured-extraction-legal-001",
  "opportunityId": "opp-acme-renewal-2026",
  "extractedFacts": [
    {
      "factId": "fact-legal-pending-001",
      "requestId": "extract-legal",
      "factType": "LEGAL_PENDING_ITEM",
      "status": "EXTRACTED",
      "normalizedValue": { "type": "process_status", "status": "Pending", "owner": "Legal", "blocker": "Data processing addendum review" },
      "displayValue": "Legal pending: data processing addendum review",
      "crmFieldMapping": { "fieldName": "Legal_Pending_Item__c", "fieldLabel": "Legal Pending Item", "dataType": "string", "updateSemantics": "replace", "currentCrmValue": "", "proposedCrmValue": "Data processing addendum review", "conflictPolicy": "manual_review_required" },
      "recommendationEligibility": { "eligible": true, "reasonCodes": ["CONFIDENCE_THRESHOLD_MET", "SUPPORTED_CRM_FIELD_MAPPING", "EVIDENCE_REQUIREMENTS_MET", "SOURCE_METADATA_REQUIREMENTS_MET", "LEGAL_REVIEW_REQUIRED"], "requiredReview": "legal_review" },
      "confidence": 0.86,
      "confidenceBand": "high",
      "reasonCodes": ["DIRECT_STATEMENT", "PROCESS_BLOCKER_IDENTIFIED", "RECENT_AUTHORITATIVE_SOURCE", "RECOMMENDATION_ELIGIBLE"],
      "rationale": "The authorized email directly states that legal review is pending for the data processing addendum; recommendation requires legal review before CRM update.",
      "evidence": [
        { "sourceItemId": "src-legal-001", "sourceType": "EMAIL", "title": "MSA review", "occurredAt": "2026-05-26T21:45:00.000Z", "matchedText": "Legal is still reviewing the data processing addendum", "normalizedEvidenceValue": { "type": "process_status", "status": "Pending", "owner": "Legal", "blocker": "Data processing addendum review" }, "author": "Account Executive", "sourceSystem": "gmail-fixture", "externalId": "gm-legal-001", "linkedRecordExternalId": "006-acme-renewal" }
      ],
      "sourceMetadata": [
        { "sourceItemId": "src-legal-001", "sourceSystem": "gmail-fixture", "externalId": "gm-legal-001", "sourceType": "EMAIL", "visibility": "INTERNAL", "authorizationScope": "deal-team", "author": "Account Executive", "occurredAt": "2026-05-26T21:45:00.000Z", "ingestedAt": "2026-05-30T12:00:00.000Z", "linkedRecordExternalId": "006-acme-renewal" }
      ]
    }
  ],
  "warnings": []
}
```

### Example: No Extractable Facts

#### Input

```json
{
  "runId": "structured-extraction-empty-001",
  "dealContext": {
    "opportunity": { "id": "opp-acme-renewal-2026", "name": "Acme Renewal 2026", "stage": "Proposal", "forecastCategory": "Commit", "amount": "125000", "closeDate": "2026-06-30" },
    "account": { "id": "acct-acme", "name": "Acme Corp" },
    "contacts": [],
    "crmFieldSnapshots": [],
    "sourceItems": [
      {
        "id": "src-empty-001",
        "type": "NOTE",
        "visibility": "INTERNAL",
        "title": "General account note",
        "body": "Customer mentioned they enjoyed the conference booth and will read the newsletter.",
        "occurredAt": "2026-05-25T10:00:00.000Z",
        "ingestedAt": "2026-05-30T12:00:00.000Z",
        "metadata": { "sourceSystem": "salesforce-fixture", "externalId": "sf-note-empty-001", "author": "Account Executive", "authorizationScope": "deal-team", "duplicateOf": null, "linkedRecordExternalId": "006-acme-renewal" }
      }
    ],
    "activityHistory": [],
    "warnings": []
  },
  "extractionRequests": [
    { "requestId": "extract-default", "factTypes": ["NEXT_STEP", "CFO_APPROVAL_STATUS", "PROCUREMENT_BLOCKER", "LEGAL_PENDING_ITEM"] }
  ]
}
```

#### Output

```json
{
  "runId": "structured-extraction-empty-001",
  "opportunityId": "opp-acme-renewal-2026",
  "extractedFacts": [],
  "warnings": [
    {
      "code": "NO_EXTRACTABLE_FACTS",
      "severity": "info",
      "message": "No authorized source content contained a supported structured fact for the requested fact types.",
      "affectedRecordIds": ["src-empty-001"]
    }
  ]
}
```

## Stage 6 — Validation Agent

The Stage 6 Validation Agent validates extracted facts before any downstream CRM recommendation path can use them. It is deterministic, schema-validated, and evidence-first. It does not compare against CRM fields, calculate scores, generate recommendations, approve changes, persist audit events, or write back to CRM.

### Input Schema

```ts
type ValidationContext = {
  facts: ValidationFact[];
  sources?: ValidationSource[];
  options?: {
    referenceDate?: Date | string;
    maxFactAgeDays?: number;
    minimumConfidence?: number;
    strictRecommendationEligibility?: boolean;
  };
};
```

A `ValidationFact` accepts Stage 5 extracted fact fields plus optional `factId`, `metadata`, and `isInference` flags. A `ValidationSource` carries source `id`, `visibility`, `occurredAt`, and authorization metadata. Source metadata may include `{ authorization: { authorized: boolean, scope: string } }`.

### Output Schema

```ts
type ValidationResult = {
  factId: string;
  status: "valid" | "needs_review" | "rejected";
  reasons: string[];
  confidence: number;
  actionRisk: "low" | "medium" | "high";
  evidenceStatus:
    | "present"
    | "missing"
    | "unauthorized"
    | "missing_timestamp"
    | "stale"
    | "contradictory"
    | "inference_only";
};
```

### Invariants

- Facts without evidence are rejected.
- Private or unauthorized source evidence is rejected even if model confidence is high.
- Missing source timestamps are rejected because freshness and contradiction checks cannot be trusted.
- Stale, low-confidence, ambiguous-date, role-only stakeholder, non-recommendation-eligible, and inference-only facts require review.
- Contradictory facts are preserved and marked `needs_review`; the validator does not silently choose a winner.
- Action risk is deterministic: next-step style updates are low risk, stakeholder/risk/process-status facts are medium risk, and forecast/stage/close-date facts are high risk.

### Error and Review States

| Condition | Result |
| --- | --- |
| Missing evidence text | `rejected` with `evidenceStatus: "missing"` |
| Unauthorized or private source | `rejected` with `evidenceStatus: "unauthorized"` |
| Missing source timestamp | `rejected` with `evidenceStatus: "missing_timestamp"` |
| Stale source evidence | `needs_review` with `evidenceStatus: "stale"` |
| Conflicting values for the same fact type | `needs_review` with `evidenceStatus: "contradictory"` |
| Inference-only fact | `needs_review` or `rejected` if no evidence exists |

### Example

```ts
validateFacts({
  facts: [{
    factId: "legal-pending",
    factType: "legal_status",
    rawValue: "pending",
    normalizedValue: "pending",
    evidenceText: "Legal is pending.",
    sourceId: "src-email-1",
    sourceTimestamp: new Date("2026-05-29T10:00:00.000Z"),
    confidence: 0.82,
    recommendationEligible: true,
    sourceMatchStatus: "matched"
  }],
  sources: [{ id: "src-email-1", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } }]
});
```

## Stage 7 — Comparison Agent Contract

`ComparisonAgent` compares Stage 6 validation output against current CRM opportunity fields.

```ts
compareFields({
  opportunity,
  crmSnapshot,
  facts,
  validationResults,
  options,
}): FieldComparison[]
```

The agent only considers facts whose validation result is not `rejected`, whose source match status is `matched`, and whose validation evidence status is not `stale`. It emits schema-validated `FieldComparison` objects containing the CRM field, current CRM value, extracted value, issue type, severity, evidence metadata, and recommendation eligibility.

The comparison layer does not write to Prisma, calculate hygiene scores, create recommendations, request approvals, or write back to CRM.

## Stage 8 — Hygiene Scoring Contract

`lib/agents/scoring` exposes `scoreOpportunity(input)` and `ScoringAgent.scoreOpportunity(input)`. The scoring contract accepts opportunity context, CRM snapshots, contacts, source items, extracted facts, validation results, Stage 7 field comparisons, and optional dimension weights. It returns a schema-validated `HygieneScoreResult` containing:

- `score`: integer from 0 to 100;
- `riskLevel`: `Low`, `Medium`, `High`, or `Critical`;
- `riskPoints`: deterministic risk contribution total;
- `dimensions`: one score object for each PRD hygiene dimension;
- `explanation`: human-readable summary of score, risk, weakest dimensions, and major risk drivers;
- `evidence`: field/fact/source-backed evidence items.

The scoring contract is deterministic and non-persistent. It must not create recommendations, request approvals, write audit events, or write back to CRM. Missing source data can reduce hygiene dimensions, but must not create unsupported blocker or contradiction risk.


## Stage 10 Approval Workflow Contract

The approval workflow exposes `transitionRecommendation(input)` from `lib/agents/approval`. The boundary accepts a workflow recommendation, actor, action, optional action payload, and policy options. It returns the updated recommendation plus an audit event and, for approval/edit/rejection/snooze actions, a feedback event.

Required invariants:

- Every successful status change must create one audit event.
- Approval, edit, rejection, and snooze actions must create feedback events.
- Rejections require a non-empty reason.
- Snoozes require a valid future date.
- Edited values must be saved and included in audit metadata.
- High-risk cards require manager approval.
- AEs cannot approve forecast-changing fields.
- RevOps approval fields must be configured explicitly when outside defaults.
- Read-only users and auditors cannot perform actions.
- Deleted, stale, missing-evidence, duplicate, and stale-version transitions must fail before mutation.

## Stage 11 — Simulated CRM Writeback Agent Contract

The simulated writeback agent applies approved recommendations to an in-memory CRM snapshot only. It is the safety and contract layer for future real CRM adapters, not a Salesforce or HubSpot integration.

### Public API

```ts
executeWriteback({ snapshot, recommendation, actor, options }): WritebackResult
rollbackWriteback({ snapshot, attemptId, actor, now }): WritebackResult
```

### Input Requirements

- `snapshot` must contain opportunity field snapshots plus arrays for simulated tasks, risk tags, note summaries, owner assignments, writeback attempts, and audit events.
- `recommendation` must conform to the Stage 10 approval recommendation schema.
- `actor` must conform to the Stage 10 approval actor schema.
- `options` may include `now`, `idempotencyKey`, field mappings, expected opportunity version, stale-source policy, and simulated failure recommendation IDs.

### Output Guarantees

- Returns a new validated snapshot and does not mutate the caller's snapshot object.
- Every execution path records a writeback attempt.
- Every execution path records an approval audit event with writeback metadata.
- Successful field updates preserve before and after values.
- Duplicate successful idempotency keys skip the second write.
- Rollback uses the original attempt change record to restore the previous simulated state.

### Blocking Error Codes

The agent normalizes failed writes into attempt `errorCode` values such as `RECOMMENDATION_NOT_APPROVED`, `HIGH_RISK_MANAGER_REQUIRED`, `FORECAST_PERMISSION_DENIED`, `SOURCE_STALE`, `VERSION_CONFLICT`, `CRM_FIELD_MISSING`, `INVALID_FIELD_MAPPING`, `VALUE_TYPE_MISMATCH`, `SUGGESTED_VALUE_REQUIRED`, and `SIMULATED_WRITEBACK_FAILURE`.
