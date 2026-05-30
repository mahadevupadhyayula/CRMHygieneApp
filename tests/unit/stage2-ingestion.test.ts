import { ForecastCategory, OpportunityStage, SourceType, SourceVisibility, type Account, type Contact, type CRMFieldSnapshot, type Opportunity, type OpportunityContact, type SourceItem } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { buildDealContextPackage, ingestDealContext, OpportunityNotFoundError } from "../../lib/agents/ingestion";
import { dealContextPackageSchema } from "../../lib/agents/ingestion/schemas";
import { BASE_NOW, fixtures, type OpportunityFixture, type SourceFixture } from "../../prisma/seed";

const now = BASE_NOW;
const older = new Date("2026-05-29T12:00:00.000Z");

const fixtureById = new Map(fixtures.map((fixture) => [fixture.externalId, fixture]));

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

function loadedOpportunity(
  overrides: Partial<ReturnType<typeof opportunity>> & {
    account?: Account;
    contacts?: Array<OpportunityContact & { contact: Contact }>;
    fieldSnapshots?: CRMFieldSnapshot[];
    sourceItems?: SourceItem[];
  } = {},
) {
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

function requiredFixture(externalId: string): OpportunityFixture {
  const fixture = fixtureById.get(externalId);
  if (!fixture) {
    throw new Error(`Missing Stage 1 fixture ${externalId}`);
  }
  return fixture;
}

function sourceMetadata(fixture: OpportunityFixture, source: SourceFixture, overrides: Record<string, unknown> = {}) {
  return metadata({
    author: source.author,
    externalId: source.externalId,
    sourceSystem: "fixture-seed",
    linkedRecord: { type: "Opportunity", externalId: fixture.externalId },
    authorization: {
      authorized: source.authorized ?? true,
      scope: source.authorizationScope ?? source.visibility.toLowerCase(),
    },
    duplicateOf: source.duplicateOf,
    matchedText: source.matchedText,
    ...overrides,
  });
}

function loadedFromFixture(fixture: OpportunityFixture, overrides: { snapshots?: CRMFieldSnapshot[]; sources?: SourceItem[] } = {}) {
  const accountRecord = account({
    id: fixture.account.externalId,
    externalId: fixture.account.externalId,
    name: fixture.account.name,
    website: fixture.account.website,
    industry: fixture.account.industry,
    segment: fixture.account.segment,
    ownerName: fixture.account.ownerName,
  });
  const contactLinks = fixture.contacts.map((contactFixture) =>
    opportunityContact(
      contact(contactFixture.externalId, {
        accountId: accountRecord.id,
        externalId: contactFixture.externalId,
        firstName: contactFixture.firstName,
        lastName: contactFixture.lastName,
        email: contactFixture.email,
        title: contactFixture.title,
      }),
      {
        opportunityId: fixture.externalId,
        contactId: contactFixture.externalId,
        role: contactFixture.role,
        isPrimary: contactFixture.isPrimary ?? false,
      },
    ),
  );
  const snapshotRecords = fixture.snapshots.map((snapshotFixture, index) =>
    snapshot(`${fixture.externalId}-SNAP-${index + 1}`, new Date(now.getTime() + index * 1000), {
      opportunityId: fixture.externalId,
      fieldName: snapshotFixture.fieldName,
      fieldLabel: snapshotFixture.fieldLabel,
      dataType: snapshotFixture.dataType,
      value: snapshotFixture.value,
      sourceSystem: "salesforce-fixture",
    }),
  );
  const sourceRecords = fixture.sources.map((source) =>
    sourceItem(source.externalId, {
      accountId: accountRecord.id,
      opportunityId: fixture.externalId,
      contactId: source.contactExternalId ?? null,
      type: source.type,
      visibility: source.visibility,
      title: source.title,
      uri: source.uri ?? `fixture://${source.externalId}`,
      body: source.body,
      occurredAt: source.occurredAt,
      ingestedAt: now,
      metadataJson: sourceMetadata(fixture, source),
    }),
  );

  return loadedOpportunity({
    id: fixture.externalId,
    accountId: accountRecord.id,
    externalId: fixture.externalId,
    name: fixture.name,
    stage: fixture.stage as OpportunityStage,
    forecastCategory: fixture.forecastCategory as ForecastCategory,
    amount: fixture.amount,
    closeDate: fixture.closeDate,
    ownerName: fixture.ownerName,
    description: fixture.description,
    account: accountRecord,
    contacts: contactLinks,
    fieldSnapshots: overrides.snapshots ?? snapshotRecords,
    sourceItems: overrides.sources ?? sourceRecords,
  });
}

function warningCodesFor(fixture: OpportunityFixture, overrides: Parameters<typeof loadedFromFixture>[1] = {}) {
  return buildDealContextPackage(loadedFromFixture(fixture, overrides), now).warnings.map((warning) => warning.code);
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

  it("validates packages produced from Stage 1 seeded fixtures against the DealContextPackage schema", () => {
    const context = buildDealContextPackage(loadedFromFixture(requiredFixture("OPP-001-HEALTHY")), now);

    expect(dealContextPackageSchema.safeParse(context).success).toBe(true);
  });

  it("includes every authorized non-private Stage 1 source type represented by the fixtures", () => {
    const includedTypes = new Set<SourceType>();

    for (const fixture of fixtures) {
      const context = buildDealContextPackage(loadedFromFixture(fixture), now);
      for (const source of context.sourceItems) {
        includedTypes.add(source.type);
      }
    }

    expect(includedTypes).toEqual(new Set([SourceType.CALL_TRANSCRIPT, SourceType.CRM_NOTE, SourceType.DOCUMENT, SourceType.EMAIL, SourceType.MEETING_NOTE, SourceType.SUPPORT_TICKET]));
  });

  it("excludes private records from Stage 1 fixtures", () => {
    const fixture = requiredFixture("OPP-016-PRIVATE-SOURCE-NO-CONTACTS");
    const context = buildDealContextPackage(loadedFromFixture(fixture), now);

    expect(context.sourceItems).toHaveLength(0);
    expect(context.warnings.map((warning) => warning.code)).toContain("PRIVATE_SOURCE_EXCLUDED");
    expect(context.metadata.excludedSourceItemCount).toBe(1);
  });

  it("excludes records that Stage 1 source metadata marks unauthorized", () => {
    const fixture = requiredFixture("OPP-016-PRIVATE-SOURCE-NO-CONTACTS");
    const unauthorizedSource = sourceItem("SRC-016-A", {
      opportunityId: fixture.externalId,
      visibility: SourceVisibility.TEAM,
      metadataJson: sourceMetadata(fixture, fixture.sources[0], {
        authorization: { authorized: false, scope: "owner-only" },
      }),
    });

    const context = buildDealContextPackage(loadedFromFixture(fixture, { sources: [unauthorizedSource] }), now);

    expect(context.sourceItems).toHaveLength(0);
    expect(context.warnings.map((warning) => warning.code)).toContain("UNAUTHORIZED_SOURCE_EXCLUDED");
    expect(context.metadata.excludedSourceItemCount).toBe(1);
  });

  it("removes duplicate Stage 1 source notes", () => {
    const context = buildDealContextPackage(loadedFromFixture(requiredFixture("OPP-014-DUPLICATE-NOTES")), now);

    expect(context.sourceItems.map((source) => source.id)).toEqual(["SRC-014-A"]);
    expect(context.metadata.duplicateSourceItemCount).toBe(1);
    expect(context.warnings.filter((warning) => warning.code === "DUPLICATE_SOURCE_SUPPRESSED")).toHaveLength(1);
  });

  it("sorts included Stage 1 sources by timestamp descending with deterministic ties", () => {
    const fixture = requiredFixture("OPP-001-HEALTHY");
    const [seededSource] = loadedFromFixture(fixture).sourceItems;
    const newest = sourceItem("SRC-SORT-NEWEST", { ...seededSource, id: "SRC-SORT-NEWEST", occurredAt: new Date("2026-05-30T10:00:00.000Z"), metadataJson: metadata({ externalId: "SRC-SORT-NEWEST" }) });
    const olderTieA = sourceItem("SRC-SORT-A", { ...seededSource, id: "SRC-SORT-A", title: "Sort tie A", body: "Tie A body", occurredAt: new Date("2026-05-28T10:00:00.000Z"), ingestedAt: older, metadataJson: metadata({ externalId: "SRC-SORT-A" }) });
    const olderTieB = sourceItem("SRC-SORT-B", { ...seededSource, id: "SRC-SORT-B", title: "Sort tie B", body: "Tie B body", occurredAt: new Date("2026-05-28T10:00:00.000Z"), ingestedAt: older, metadataJson: metadata({ externalId: "SRC-SORT-B" }) });

    const context = buildDealContextPackage(loadedFromFixture(fixture, { sources: [olderTieB, newest, olderTieA] }), now);

    expect(context.sourceItems.map((source) => source.id)).toEqual(["SRC-SORT-NEWEST", "SRC-SORT-A", "SRC-SORT-B"]);
  });

  it("warns when a Stage 1 opportunity has no source notes", () => {
    expect(warningCodesFor(requiredFixture("OPP-013-NO-NOTES"))).toContain("MISSING_AUTHORIZED_SOURCE_ITEMS");
  });

  it("warns when a Stage 1 opportunity has no CRM snapshots", () => {
    expect(warningCodesFor(requiredFixture("OPP-001-HEALTHY"), { snapshots: [] })).toContain("MISSING_CRM_SNAPSHOT");
  });

  it("warns when Stage 1 source author metadata is missing", () => {
    const fixture = requiredFixture("OPP-001-HEALTHY");
    const source = sourceItem("SRC-MISSING-AUTHOR", {
      opportunityId: fixture.externalId,
      metadataJson: sourceMetadata(fixture, fixture.sources[0], { author: undefined }),
    });

    expect(warningCodesFor(fixture, { sources: [source] })).toContain("MISSING_SOURCE_AUTHOR_METADATA");
  });

  it("warns when a Stage 1 source timestamp is missing", () => {
    const fixture = requiredFixture("OPP-001-HEALTHY");
    const source = sourceItem("SRC-MISSING-TIMESTAMP", {
      opportunityId: fixture.externalId,
      occurredAt: null,
      metadataJson: sourceMetadata(fixture, fixture.sources[0]),
    });

    expect(warningCodesFor(fixture, { sources: [source] })).toContain("MISSING_SOURCE_TIMESTAMP");
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
