import { describe, expect, it } from "vitest";

import { CrmIntegrationError, hubSpotPage, syncHubSpotReadOnly } from "../../lib/agents/crm-readonly";
import { MockHubSpotReadOnlyClient } from "../../lib/agents/crm-readonly/mock-hubspot";

const now = new Date("2026-05-31T13:00:00.000Z");

function basePages(noteCount = 2) {
  return {
    owners: [hubSpotPage([{ id: "owner-1", properties: { email: "ae@example.com", firstName: "Avery", lastName: "AE" } }])],
    companies: [hubSpotPage([{ id: "company-1", properties: { name: "Globex", domain: "globex.example", hubspot_owner_id: "owner-1" } }])],
    contacts: [hubSpotPage([{ id: "contact-1", properties: { firstname: "Blake", lastname: "Buyer", email: "blake@globex.example", associatedcompanyid: "company-1" } }])],
    deals: [hubSpotPage([{ id: "deal-1", properties: { dealname: "Globex Renewal", amount: "50000", dealstage: "qualifiedtobuy", pipeline: "default", associatedcompanyid: "company-1", forecast_category: "best_case" } }])],
    notes: [hubSpotPage(Array.from({ length: noteCount }, (_, index) => ({ id: `note-${index + 1}`, properties: { hs_note_body: `Note ${index + 1}`, associateddealid: "deal-1", associatedcontactid: "contact-1", hs_timestamp: `2026-05-${String(10 + index).padStart(2, "0")}T10:00:00.000Z` } })))],
    tasks: [hubSpotPage([{ id: "task-1", properties: { hs_task_subject: "Confirm renewal timeline", hs_task_status: "WAITING", associateddealid: "deal-1" } }])],
    emails: [hubSpotPage([{ id: "email-1", properties: { hs_email_subject: "Renewal timeline", hs_email_text: "Timeline confirmed.", associateddealid: "deal-1" } }])],
  };
}

describe("Stage 15 read-only CRM sync integration", () => {
  it("syncs mock deals, notes, activities, and creates a local normalized CRM snapshot", async () => {
    const mock = new MockHubSpotReadOnlyClient({ pages: basePages() });

    const snapshot = await syncHubSpotReadOnly(mock, { now, selectedDealFields: ["dealname", "amount", "forecast_category"] });

    expect(snapshot).toEqual(expect.objectContaining({ provider: "hubspot", capturedAt: now, readOnly: true }));
    expect(snapshot.deals).toHaveLength(1);
    expect(snapshot.accounts).toHaveLength(1);
    expect(snapshot.contacts).toHaveLength(1);
    expect(snapshot.notes).toHaveLength(2);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.emailActivities).toHaveLength(1);
    expect(snapshot.fieldSnapshots.map((field) => field.fieldName)).toEqual(["dealname", "amount", "forecast_category"]);
    expect(mock.writeCalls).toHaveLength(0);
  });

  it("captures large accounts with many notes without dropping activities", async () => {
    const snapshot = await syncHubSpotReadOnly(new MockHubSpotReadOnlyClient({ pages: basePages(250) }), { now });

    expect(snapshot.notes).toHaveLength(250);
    expect(snapshot.notes.at(0)).toEqual(expect.objectContaining({ body: "Note 1", dealExternalId: "deal-1" }));
    expect(snapshot.notes.at(-1)).toEqual(expect.objectContaining({ body: "Note 250", dealExternalId: "deal-1" }));
  });

  it("logs sync failures and still returns successful object snapshots", async () => {
    const snapshot = await syncHubSpotReadOnly(new MockHubSpotReadOnlyClient({
      pages: basePages(),
      failOn: { notes: new CrmIntegrationError("API_ERROR", "HubSpot notes endpoint unavailable.") },
    }), { now });

    expect(snapshot.notes).toHaveLength(0);
    expect(snapshot.deals).toHaveLength(1);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.logs).toEqual(expect.arrayContaining([expect.objectContaining({ code: "API_ERROR", objectType: "notes" }), expect.objectContaining({ code: "PARTIAL_SYNC_FAILURE", objectType: "notes" })]));
  });
});
