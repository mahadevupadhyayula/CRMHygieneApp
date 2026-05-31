import { describe, expect, it } from "vitest";

import { createReadOnlyHubSpotClient, CrmIntegrationError, hubSpotPage, syncHubSpotReadOnly } from "../../lib/agents/crm-readonly";
import { MockHubSpotReadOnlyClient } from "../../lib/agents/crm-readonly/mock-hubspot";

const now = new Date("2026-05-31T12:00:00.000Z");

function client(overrides: Partial<ConstructorParameters<typeof MockHubSpotReadOnlyClient>[0]> = { pages: {} }) {
  return new MockHubSpotReadOnlyClient({
    pages: {
      owners: [hubSpotPage([{ id: "owner-1", properties: { email: "owner@example.com", firstName: "Olivia", lastName: "Owner" } }])],
      companies: [hubSpotPage([{ id: "company-1", properties: { name: "Acme", website: "https://acme.example", industry: "Software", hubspot_owner_id: "owner-1", hs_lastmodifieddate: "2026-05-30T00:00:00.000Z" } }])],
      contacts: [hubSpotPage([{ id: "contact-1", properties: { firstname: "Casey", lastname: "Champion", email: "casey@example.com", jobtitle: "CFO", phone: "555-0100", associatedcompanyid: "company-1", hubspot_owner_id: "owner-1" } }])],
      deals: [hubSpotPage([{ id: "deal-1", properties: { dealname: "Acme Expansion", amount: "125000", dealstage: "contractsent", pipeline: "default", closedate: "2026-06-30", associatedcompanyid: "company-1", hubspot_owner_id: "owner-1", custom_risk__c: "legal" } }])],
      notes: [hubSpotPage([{ id: "note-1", properties: { hs_note_body: "CFO asked for legal review.", associateddealid: "deal-1", associatedcontactid: "contact-1", hubspot_owner_id: "owner-1", hs_timestamp: "2026-05-29T10:00:00.000Z" } }])],
      tasks: [hubSpotPage([{ id: "task-1", properties: { hs_task_subject: "Send order form", hs_task_body: "Follow up", hs_task_status: "NOT_STARTED", associateddealid: "deal-1", hubspot_owner_id: "owner-1" } }])],
      emails: [hubSpotPage([{ id: "email-1", properties: { hs_email_subject: "Security review", hs_email_text: "Security review is complete.", associateddealid: "deal-1", associatedcontactid: "contact-1" } }])],
      ...overrides.pages,
    },
    failOn: overrides.failOn,
  });
}

describe("Stage 15 HubSpot read-only CRM adapter", () => {
  it("maps HubSpot API responses into normalized CRM objects and field snapshots", async () => {
    const snapshot = await syncHubSpotReadOnly(client(), { now, selectedDealFields: ["dealname", "amount", "custom_risk__c"], fieldLabels: { custom_risk__c: "Custom Risk" }, fieldTypes: { amount: "number" } });

    expect(snapshot.readOnly).toBe(true);
    expect(snapshot.accounts[0]).toEqual(expect.objectContaining({ externalId: "company-1", name: "Acme", ownerExternalId: "owner-1" }));
    expect(snapshot.contacts[0]).toEqual(expect.objectContaining({ email: "casey@example.com", accountExternalId: "company-1" }));
    expect(snapshot.deals[0]).toEqual(expect.objectContaining({ name: "Acme Expansion", amount: 125000, accountExternalId: "company-1" }));
    expect(snapshot.notes[0]).toEqual(expect.objectContaining({ activityType: "note", body: "CFO asked for legal review.", dealExternalId: "deal-1" }));
    expect(snapshot.tasks[0]).toEqual(expect.objectContaining({ activityType: "task", title: "Send order form", status: "NOT_STARTED" }));
    expect(snapshot.emailActivities[0]).toEqual(expect.objectContaining({ activityType: "email", title: "Security review" }));
    expect(snapshot.owners[0]).toEqual(expect.objectContaining({ email: "owner@example.com", name: "Olivia Owner" }));
    expect(snapshot.fieldSnapshots).toEqual(expect.arrayContaining([expect.objectContaining({ fieldName: "custom_risk__c", fieldLabel: "Custom Risk", value: "legal" })]));
  });

  it("paginates through each HubSpot object endpoint", async () => {
    const mock = client({ pages: { deals: [hubSpotPage([{ id: "deal-1", properties: { dealname: "First" } }], "1"), hubSpotPage([{ id: "deal-2", properties: { dealname: "Second" } }])] } });

    const snapshot = await syncHubSpotReadOnly(mock, { now, pageSize: 1 });

    expect(snapshot.deals.map((deal) => deal.externalId)).toEqual(["deal-1", "deal-2"]);
    expect(mock.calls.filter((call) => call.objectType === "deals")).toEqual([{ objectType: "deals", after: undefined, limit: 1 }, { objectType: "deals", after: "1", limit: 1 }]);
  });

  it("logs rate limits, expired tokens, missing permissions, and partial sync failures", async () => {
    const rateLimited = await syncHubSpotReadOnly(client({ failOn: { tasks: new CrmIntegrationError("RATE_LIMITED", "HubSpot rate limit exceeded.", { retryAfterMs: 1000 }) } }), { now });
    const expired = await syncHubSpotReadOnly(client({ failOn: { contacts: new CrmIntegrationError("AUTH_EXPIRED", "OAuth token expired.") } }), { now });
    const permissions = await syncHubSpotReadOnly(client({ failOn: { notes: new CrmIntegrationError("MISSING_PERMISSIONS", "Missing crm.objects.notes.read scope.") } }), { now });

    expect(rateLimited.logs).toEqual(expect.arrayContaining([expect.objectContaining({ code: "RATE_LIMITED" }), expect.objectContaining({ code: "PARTIAL_SYNC_FAILURE", objectType: "tasks" })]));
    expect(expired.logs).toEqual(expect.arrayContaining([expect.objectContaining({ code: "AUTH_EXPIRED", objectType: "contacts" })]));
    expect(permissions.logs).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_PERMISSIONS", objectType: "notes" })]));
  });

  it("logs missing fields, deleted records, absent custom fields, type mismatches, and duplicates", async () => {
    const snapshot = await syncHubSpotReadOnly(client({
      pages: {
        companies: [hubSpotPage([{ id: "company-1", archived: true, properties: { website: "https://missing-name.example" } }])],
        deals: [hubSpotPage([
          { id: "deal-1", properties: { dealname: "Bad Amount", amount: "not-a-number" } },
          { id: "deal-1", properties: { dealname: "Duplicate", amount: "10" } },
        ])],
      },
    }), { now, selectedDealFields: ["dealname", "missing_custom__c", "amount"], expectedFieldTypes: { amount: "number" } });

    expect(snapshot.deals[0].amount).toBeNull();
    expect(snapshot.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_FIELD", objectType: "companies", recordId: "company-1" }),
      expect.objectContaining({ code: "DELETED_RECORD", objectType: "companies", recordId: "company-1" }),
      expect.objectContaining({ code: "MISSING_FIELD", objectType: "deals", recordId: "deal-1", details: { fieldName: "missing_custom__c" } }),
      expect.objectContaining({ code: "FIELD_TYPE_MISMATCH", objectType: "deals", recordId: "deal-1" }),
      expect.objectContaining({ code: "DUPLICATE_RECORD", objectType: "deals", recordId: "deal-1" }),
    ]));
  });

  it("enforces read-only mode and never calls writeback during sync", async () => {
    const mock = client();
    await syncHubSpotReadOnly(mock, { now });

    expect(mock.writeCalls).toHaveLength(0);
    await expect(createReadOnlyHubSpotClient(mock).writeObject?.({ objectType: "deals", id: "deal-1" })).rejects.toMatchObject({ code: "READ_ONLY_WRITE_FORBIDDEN" });
  });
});
