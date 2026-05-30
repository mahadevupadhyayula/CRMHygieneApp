# Stage 03 — Deal-to-Source Matching Agent

## Goal

Map loose source items to the correct CRM opportunity so downstream stages can review evidence in the right deal context without prematurely extracting facts, scoring hygiene, recommending actions, or writing back to the CRM.

A loose source item is any authorized source record that is not already confidently attached to an opportunity, such as an email, note, calendar item, transcript, or file reference that may mention a deal indirectly.

## Inputs

The matching agent accepts a bounded matching context containing:

- `sourceItem`: the authorized source item being evaluated for a possible opportunity match.
- `candidateOpportunities`: the finite set of CRM opportunities that are eligible to receive the source item.
- `accounts`: account records associated with the candidate opportunities and known source relationships.
- `contacts`: contact records associated with the candidate opportunities, accounts, and source participants.
- `ownerTeamMetadata`: owner, team, territory, routing, and collaboration metadata that can help disambiguate otherwise similar candidates.

## Output

The agent returns a `SourceMatch` result for each evaluated source item.

`SourceMatch` should identify one of the following outcomes:

- A single eligible opportunity match with the supporting matching signals.
- An explicit unmatched result when no candidate has sufficient context.
- An explicit ambiguous result when multiple candidates remain plausible and the source item must stay in a human-review queue.

## Matching Signals

The agent may use the following signals when deciding whether a source item maps to an opportunity:

1. **Direct CRM relationship** — an existing CRM link already connects the source item, activity, contact, account, or related record to an opportunity.
2. **Account name** — the source content or metadata references the account name, normalized account aliases, or recognizable account-specific identifiers.
3. **Opportunity name** — the source content or metadata references the opportunity name, deal nickname, renewal identifier, project name, or other opportunity-specific label.
4. **Contact email domain** — source participants use email domains that align with contacts or accounts tied to a candidate opportunity.
5. **Contact name mention** — source text or metadata mentions a known contact associated with a candidate opportunity.
6. **Owner/team match** — source ownership, participants, routing, team membership, or territory metadata aligns with the candidate opportunity owner or team.
7. **Timestamp proximity** — source timestamps fall near relevant opportunity activity, stage movement, close-date changes, meeting windows, or known deal milestones.
8. **Keyword references** — source text includes deal-specific keywords, product names, procurement terms, security/legal references, renewal language, competitor names, or other configured terms that help distinguish candidates.

## Invariants

- Private or unauthorized sources are not matched and must not be attached to an opportunity.
- Ambiguous context is never auto-attached; ties, weak matches, or conflicting signals must produce an ambiguous or unmatched result for review.
- Unmatched sources remain reviewable so users can inspect them, manually attach them, dismiss them, or improve future matching coverage.

## Out of Scope

Stage 03 does not implement:

- Extraction of CRM facts from source content.
- Scoring, ranking, or hygiene score generation.
- Recommendations for CRM updates or user actions.
- Writeback to CRM systems or mutation of persisted opportunity records.
