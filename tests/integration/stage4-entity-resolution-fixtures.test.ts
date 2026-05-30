import { describe, expect, it } from "vitest";

import { fixtures, type OpportunityFixture, type SourceFixture } from "../../prisma/seed";
import { resolveEntities, type EntityResolutionContext, type ResolvedEntity } from "../../lib/agents/entity-resolution";

function fixtureByExternalId(externalId: string): OpportunityFixture {
  const fixture = fixtures.find((candidate) => candidate.externalId === externalId);
  if (!fixture) {
    throw new Error(`Missing fixture ${externalId}`);
  }
  return fixture;
}

function sourceByExternalId(fixture: OpportunityFixture, externalId: string): SourceFixture {
  const source = fixture.sources.find((candidate) => candidate.externalId === externalId);
  if (!source) {
    throw new Error(`Missing source fixture ${externalId}`);
  }
  return source;
}

function contextForFixture(fixture: OpportunityFixture, sources = fixture.sources): EntityResolutionContext {
  return {
    account: {
      id: fixture.account.externalId,
      externalId: fixture.account.externalId,
      name: fixture.account.name,
    },
    opportunity: {
      id: fixture.externalId,
      externalId: fixture.externalId,
      name: fixture.name,
      closeDate: fixture.closeDate,
      amount: fixture.amount,
      ownerName: fixture.ownerName,
    },
    contacts: fixture.contacts.map((contact) => ({
      id: contact.externalId,
      externalId: contact.externalId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      title: contact.title,
      opportunityRole: contact.role,
      isPrimary: contact.isPrimary,
    })),
    sourceItems: sources.map((source) => ({
      id: source.externalId,
      title: source.title,
      body: source.body,
      occurredAt: source.occurredAt,
      ingestedAt: new Date("2026-05-30T12:00:00.000Z"),
      metadata: source.matchedText ? { matchedText: source.matchedText } : {},
    })),
  };
}

function expectEntity(entities: ResolvedEntity[], partial: Partial<ResolvedEntity>) {
  expect(entities).toEqual(expect.arrayContaining([expect.objectContaining(partial)]));
}

describe("Entity Resolution Agent fixture-backed integration", () => {
  it("extracts contact and normalized date evidence from the healthy Northstar fixture", () => {
    const fixture = fixtureByExternalId("OPP-001-HEALTHY");
    const entities = resolveEntities(contextForFixture(fixture));

    expectEntity(entities, { entityType: "contact", rawText: "Priya", normalizedValue: "CON-001-A" });
    expectEntity(entities, { entityType: "date", rawText: "2026-06-02", normalizedValue: "2026-06-02" });
  });

  it("extracts legal document and risk signals from Evergreen fixture notes", () => {
    const fixture = fixtureByExternalId("OPP-008-LEGAL-PENDING");
    const entities = resolveEntities(contextForFixture(fixture));

    expectEntity(entities, { entityType: "document", rawText: "MSA", normalizedValue: "MSA" });
    expectEntity(entities, { entityType: "role", rawText: "legal", normalizedValue: "legal" });
  });

  it("extracts security questionnaire and security review entities from Nimbus fixture notes", () => {
    const fixture = fixtureByExternalId("OPP-009-SECURITY-PENDING");
    const entities = resolveEntities(contextForFixture(fixture));

    expectEntity(entities, { entityType: "document", rawText: "Security questionnaire", normalizedValue: "security questionnaire" });
    expectEntity(entities, { entityType: "role", rawText: "Security", normalizedValue: "security" });
    expectEntity(entities, { entityType: "risk keyword", rawText: "pending", normalizedValue: "pending" });
  });

  it("extracts CFO approval without a CFO name and resolves next Friday from Bluebird fixture timestamps", () => {
    const fixture = fixtureByExternalId("OPP-011-CONFLICTING-NOTES");
    const entities = resolveEntities(contextForFixture(fixture, [sourceByExternalId(fixture, "SRC-011-A"), sourceByExternalId(fixture, "SRC-011-C")]));

    expectEntity(entities, { entityType: "contact", rawText: "Maya", normalizedValue: "CON-011-A" });
    expectEntity(entities, { entityType: "date", rawText: "next Friday", normalizedValue: "2026-05-29" });
    expectEntity(entities, { entityType: "role", rawText: "CFO", normalizedValue: "Chief Financial Officer" });
  });
});
