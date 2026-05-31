# Stage 15 — Read-only CRM Integration

## Selected CRM

Stage 15 starts with **HubSpot** because it offers a faster developer experience for mocked adapter work and maps cleanly to the app's normalized account, contact, deal, owner, activity, and CRM field snapshot shapes.

## Scope implemented

The Stage 15 adapter is intentionally read-only. It syncs mocked HubSpot API pages into local normalized objects for:

- Deals / opportunities
- Companies / accounts
- Contacts
- Notes
- Tasks
- Owners
- Selected email activity
- CRM deal field snapshots

The implementation does **not** perform live writeback. The read-only client wrapper exposes a guarded `writeObject` method that always throws `READ_ONLY_WRITE_FORBIDDEN`, and the sync path only calls `listObjects`.

## Normalization behavior

HubSpot records are normalized with stable local IDs prefixed by object type, while preserving the HubSpot ID as `externalId`. Raw properties are retained on each normalized object for future field-mapping and audit needs.

Deal field snapshots are captured from a configurable selected field list. Missing selected fields are logged as `MISSING_FIELD` instead of failing the whole sync. Expected field types can be supplied to log `FIELD_TYPE_MISMATCH` when custom CRM fields do not match the configured type.

## Failure handling

The sync loop paginates each object type independently. By default, endpoint-level failures are logged and treated as partial sync failures so available CRM objects still produce a local snapshot. Supported mocked error classes include:

- `AUTH_EXPIRED`
- `RATE_LIMITED`
- `MISSING_PERMISSIONS`
- `API_ERROR`
- `PARTIAL_SYNC_FAILURE`

Record-level edge cases are also logged:

- Deleted / archived CRM records
- Duplicate CRM records within an object type
- Missing required fields
- Missing custom fields
- Field type mismatches

## Tests added

Unit tests cover API response mapping, pagination, rate limits, expired tokens, missing permissions, missing fields, deleted records, absent custom fields, field type mismatch, duplicate records, and read-only enforcement.

Integration tests cover syncing mock deals, notes, tasks, selected email activity, creating local CRM snapshots, large accounts with many notes, ensuring no writeback occurs, and logging partial sync failures.

## Handoff notes

Future live HubSpot work should keep the current `HubSpotReadOnlyClient` boundary and replace the mock client with an OAuth-backed client that only requests read scopes. Do not add write scopes or writeback calls in this integration stage. Any future Salesforce adapter should target the same normalized snapshot schemas so downstream agents do not depend on CRM-specific payloads.
