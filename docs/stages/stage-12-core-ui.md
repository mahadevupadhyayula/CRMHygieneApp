# Stage 12 — Core UI: Dashboard, Deal Review, Approval Inbox

## Scope

Stage 12 introduces the user-facing MBP workflow UI without adding live CRM integration. The app now has navigable pages for:

- Deal Hygiene Dashboard (`/dashboard`)
- Deal Review (`/deals/[id]`)
- Approval Inbox (`/approvals`)
- Audit Log (`/audit`)
- Basic Settings (`/settings`)

## Implemented workflow

The dashboard summarizes analyzed opportunities with owner, stage, forecast, close date, hygiene score, risk, main issue, suggested action, and last analyzed timestamp. Deal review pages show the CRM snapshot, score breakdown, extracted facts, evidence metadata/text, field conflicts, risks, suggested updates, suggested follow-ups, and audit history.

The Approval Inbox supports filtering by risk and field and provides approve, edit, reject, and snooze actions against local Stage 12 state. These actions update browser-local audit state that is visible in the Audit Log view. A failed writeback card is included to keep the failure state visible without connecting to a live CRM.

## Edge cases covered

- No deals matching a filter
- No recommendations for a clean deal
- No evidence available
- Long evidence text wrapping
- Multiple risks and conflicts
- Permission-restricted evidence source
- Mobile/narrow layout
- Failed writeback state
- Loading/error-oriented empty states

## Tests

- Component coverage for dashboard rendering, risk badges, score bands, evidence metadata, approval card required fields, and empty states.
- Playwright E2E coverage for opening the dashboard, filtering high-risk deals, opening deal review, reviewing evidence, approve/edit/reject/snooze actions, audit log updates, and mobile action accessibility.

## Out of scope

Live CRM integration remains intentionally disabled. Stage 12 uses sample workflow data and local browser state to exercise the MBP user journey safely.
