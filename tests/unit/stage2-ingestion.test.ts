import { ForecastCategory, OpportunityStage, SourceType, SourceVisibility, type Account, type Contact, type CRMFieldSnapshot, type Opportunity, type OpportunityContact, type SourceItem } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { buildDealContextPackage, ingestDealContext, OpportunityNotFoundError } from "../../lib/agents/ingestion";

const now = new Date("2026-05-30T12:00:00.000Z");
const older = new Date("2026-05-29T12:00:00.000Z");

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "acct-1",
    externalId: "ACC-001",
    name: "Acme Corp",
    website: null,
    industry: "Software",
    segment: "Enterprise",
    ownerName: "Owner One",
    createdAt: older,
    updatedAt: now,
    ...overrides,
  };
}

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp-1",
    accountId: "acct-1",
    externalId: "OPP-001",
    name: "Acme Expansion",
    stage: OpportunityStage.NEGOTIATION,
    forecastCategory: ForecastCategory.COMMIT,
    amount: 100000,
    closeDate: new Date("2026-06-30T00:00:00.000Z"),
    ownerName: "Owner One",
    description: null,
    createdAt: older,
    updatedAt: now,
    ...overrides,
  };
}

function contact(id: string, overrides: Partial<Contact> = {}): Contact {
  return {
    id,
    accountId: "acct-1",
    externalId: id.toUpperCase(),
    firstName: "First",
    lastName: id,
    email: `${id}@example.com`,
    title: "VP",
    phone: null,
    createdAt: older,
    updatedAt: now,
    ...overrides,
  };
}

function opportunityContact(contactRecord: Contact, overrides: Partial<OpportunityContact> = {}): OpportunityContact & { contact: Contact } {
  return {
    opportunityId: "opp-1",
    contactId: contactRecord.id,
    role: "Evaluator",
    isPrimary: false,
    createdAt: older,
    ...overrides,
    contact: contactRecord,
  };
}

function snapshot(id: string, capturedAt: Date, overrides: Partial<CRMFieldSnapshot> = {}): CRMFieldSnapshot {
  return {
    id,
    opportunityId: "opp-1",
    fieldName: "StageName",
    fieldLabel: "Stage",
    dataType: "picklist",
    value: "Negotiation",
    sourceSystem: "crm",
    capturedAt,
    ...overrides,
  };
}

function metadata(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    author: "Alex Rivera",
    externalId: "SRC-001",
    sourceSystem: "fixture",
    linkedRecord: { type: "Opportunity", externalId: "OPP-001" },
    authorization: { authorized: true, scope: "team" },
    ...overrides,
  });
}

function sourceItem(id: string, overrides: Partial<SourceItem> = {}): SourceItem {
  return {
    id,
    accountId: "acct-1",
    opportunityId: "opp-1",
    contactId: "contact-a",
    type: SourceType.CRM_NOTE,
    visibility: SourceVisibility.TEAM,
    title: "Mutual action plan",
    uri: `fixture://${id}`,
    body: "Budget confirmed and procurement next steps agreed.",
    occurredAt: older,
    ingestedAt: now,
    metadataJson: metadata({ externalId: id }),
    ...overrides,
  };
}

function loadedOpportunity(overrides: Partial<ReturnType<typeof opportunity>> & {
  account?: Account;
  contacts?: Array<OpportunityContact & { contact: Contact }>;
  fieldSnapshots?: CRMFieldSnapshot[];
  sourceItems?: SourceItem[];
} = {}) {
  const primary = opportunityContact(contact("contact-a", { lastName: "Zephyr" }), { role: "Decision Maker", isPrimary: true });
  const secondary = opportunityContact(contact("contact-b", { lastName: "Alpha" }), { role: "Evaluator", isPrimary: false });

  return {
    ...opportunity(overrides),
    account: overrides.account ?? account(),
    contacts: overrides.contacts ?? [secondary, primary],
    fieldSnapshots: overrides.fieldSnapshots ?? [snapshot("snap-old", older), snapshot("snap-new", now)],
    sourceItems: overrides.sourceItems ?? [sourceItem("src-1")],
  };
}

describe("Stage 2 ingestion agent", () => {
  it("builds a deterministic DealContextPackage with sorted contacts, snapshots, sources, and activities", () => {
    const sourceA = sourceItem("src-a", { occurredAt: older, ingestedAt: now, title: "Older" });
    const sourceB = sourceItem("src-b", { occurredAt: now, ingestedAt: older, title: "Newer" });

    const context = buildDealContextPackage(loadedOpportunity({ sourceItems: [sourceA, sourceB] }), now);

    expect(context).toMatchObject({
      opportunity: { id: "opp-1", name: "Acme Expansion" },
      account: { id: "acct-1", name: "Acme Corp" },
      metadata: { opportunityId: "opp-1", sourceItemCount: 2, excludedSourceItemCount: 0, duplicateSourceItemCount: 0 },
    });
    expect(context.contacts.map((item) => item.id)).toEqual(["contact-a", "contact-b"]);
    expect(context.crmSnapshot.map((item) => item.id)).toEqual(["snap-new", "snap-old"]);
    expect(context.sourceItems.map((item) => item.id)).toEqual(["src-b", "src-a"]);
    expect(context.activityHistory.map((item) => item.sourceItemId)).toEqual(["src-b", "src-a"]);
  });

  it("filters private and unauthorized source items while preserving authorized metadata", () => {
    const authorized = sourceItem("src-authorized", { metadataJson: metadata({ matchedText: "budget confirmed" }) });
    const privateSource = sourceItem("src-private", { visibility: SourceVisibility.PRIVATE });
    const unauthorized = sourceItem("src-unauthorized", {
      metadataJson: metadata({ authorization: { authorized: false, scope: "owner-only" } }),
    });

    const context = buildDealContextPackage(loadedOpportunity({ sourceItems: [privateSource, unauthorized, authorized] }), now);

    expect(context.sourceItems.map((item) => item.id)).toEqual(["src-authorized"]);
    expect(context.sourceItems[0].metadata.matchedText).toBe("budget confirmed");
    expect(context.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["PRIVATE_SOURCE_EXCLUDED", "UNAUTHORIZED_SOURCE_EXCLUDED"]));
    expect(context.metadata.excludedSourceItemCount).toBe(2);
  });

  it("deduplicates sources with duplicateOf metadata and normalized content fallback", () => {
    const canonical = sourceItem("src-canonical");
    const explicitDuplicate = sourceItem("src-explicit-duplicate", {
      metadataJson: metadata({ externalId: "src-explicit-duplicate", duplicateOf: "src-canonical" }),
    });
    const fallbackDuplicate = sourceItem("src-fallback-duplicate", {
      title: "  mutual ACTION plan ",
      body: "Budget confirmed and procurement next steps agreed.",
      occurredAt: older,
    });

    const context = buildDealContextPackage(loadedOpportunity({ sourceItems: [explicitDuplicate, fallbackDuplicate, canonical] }), now);

    expect(context.sourceItems.map((item) => item.id)).toEqual(["src-canonical"]);
    expect(context.metadata.duplicateSourceItemCount).toBe(2);
    expect(context.warnings.filter((warning) => warning.code === "DUPLICATE_SOURCE_SUPPRESSED")).toHaveLength(2);
  });

  it("emits warnings for missing contacts, snapshots, timestamps, authors, and incomplete metadata", () => {
    const incomplete = sourceItem("src-incomplete", {
      occurredAt: null,
      metadataJson: JSON.stringify({ authorization: { authorized: true } }),
    });

    const context = buildDealContextPackage(
      loadedOpportunity({
        contacts: [],
        fieldSnapshots: [],
        sourceItems: [incomplete],
      }),
      now,
    );

    expect(context.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["MISSING_CONTACTS", "MISSING_CRM_SNAPSHOT", "MISSING_SOURCE_TIMESTAMP", "MISSING_SOURCE_AUTHOR_METADATA", "INCOMPLETE_SOURCE_METADATA"]),
    );
  });

  it("throws a documented not-found error when the opportunity is missing", async () => {
    const prisma = {
      opportunity: {
        findUnique: async () => null,
      },
    } as unknown as Parameters<typeof ingestDealContext>[0];

    await expect(ingestDealContext(prisma, "missing-opp")).rejects.toBeInstanceOf(OpportunityNotFoundError);
  });
});
