import { execFileSync } from "node:child_process";

import { PrismaClient, SourceVisibility } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fixtures, seedCrmFixtures } from "../../prisma/seed";

const prisma = new PrismaClient();

const expectedAccountCount = new Set(fixtures.map((fixture) => fixture.account.externalId)).size;
const expectedContactCount = fixtures.reduce((count, fixture) => count + fixture.contacts.length, 0);
const expectedOpportunityCount = fixtures.length;
const expectedSnapshotCount = fixtures.reduce((count, fixture) => count + fixture.snapshots.length, 0);
const expectedSourceItemCount = fixtures.reduce((count, fixture) => count + fixture.sources.length, 0);

function parseMetadata(metadataJson: string | null) {
  expect(metadataJson).toBeTruthy();
  return JSON.parse(metadataJson ?? "{}");
}

describe("Stage 1 deterministic seed integration", () => {
  beforeAll(async () => {
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    await seedCrmFixtures(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates the expected accounts, contacts, opportunities, CRM snapshots, and source items", async () => {
    await expect(prisma.account.count()).resolves.toBe(expectedAccountCount);
    await expect(prisma.contact.count()).resolves.toBe(expectedContactCount);
    await expect(prisma.opportunity.count()).resolves.toBe(expectedOpportunityCount);
    await expect(prisma.cRMFieldSnapshot.count()).resolves.toBe(expectedSnapshotCount);
    await expect(prisma.sourceItem.count()).resolves.toBe(expectedSourceItemCount);

    await expect(prisma.opportunity.findUnique({ where: { id: "OPP-001-HEALTHY" } })).resolves.toMatchObject({
      externalId: "OPP-001-HEALTHY",
      name: "Northstar Analytics - Expansion",
    });
  });

  it("gives every opportunity at least one CRM snapshot", async () => {
    const opportunities = await prisma.opportunity.findMany({
      orderBy: { externalId: "asc" },
      select: { externalId: true, _count: { select: { fieldSnapshots: true } } },
    });

    expect(opportunities).toHaveLength(expectedOpportunityCount);
    for (const opportunity of opportunities) {
      expect(opportunity._count.fieldSnapshots, opportunity.externalId ?? "missing externalId").toBeGreaterThan(0);
    }
  });

  it("preserves source author, timestamp, type, visibility, and linked record metadata", async () => {
    for (const fixture of fixtures) {
      for (const source of fixture.sources) {
        const seeded = await prisma.sourceItem.findUniqueOrThrow({
          where: { id: source.externalId },
          select: {
            id: true,
            opportunityId: true,
            accountId: true,
            contactId: true,
            type: true,
            visibility: true,
            occurredAt: true,
            ingestedAt: true,
            metadataJson: true,
          },
        });
        const metadata = parseMetadata(seeded.metadataJson);

        expect(seeded.id).toBe(source.externalId);
        expect(seeded.opportunityId).toBe(fixture.externalId);
        expect(seeded.accountId).toBe(fixture.account.externalId);
        expect(seeded.type).toBe(source.type);
        expect(seeded.visibility).toBe(source.visibility);
        expect(seeded.occurredAt?.toISOString()).toBe(source.occurredAt.toISOString());
        expect(seeded.ingestedAt.toISOString()).toBe("2026-05-30T12:00:00.000Z");
        expect(metadata).toMatchObject({
          author: source.author,
          externalId: source.externalId,
          sourceSystem: "fixture-seed",
          linkedRecord: {
            type: "Opportunity",
            externalId: fixture.externalId,
          },
          authorization: {
            authorized: source.authorized ?? true,
            scope: source.authorizationScope ?? source.visibility.toLowerCase(),
          },
        });

        if (source.contactExternalId) {
          expect(seeded.contactId).toBe(source.contactExternalId);
        } else {
          expect(seeded.contactId).toBeNull();
        }
      }
    }
  });

  it("contains edge fixtures for no notes, duplicate notes, old notes only, private sources, multiple contacts, and no contacts", async () => {
    await expect(prisma.sourceItem.count({ where: { opportunityId: "OPP-013-NO-NOTES" } })).resolves.toBe(0);

    const duplicateNote = await prisma.sourceItem.findUniqueOrThrow({ where: { id: "SRC-014-B" } });
    expect(parseMetadata(duplicateNote.metadataJson)).toMatchObject({ duplicateOf: "SRC-014-A" });

    const oldNote = await prisma.sourceItem.findUniqueOrThrow({ where: { id: "SRC-015-A" } });
    expect(oldNote.occurredAt?.toISOString()).toBe("2026-01-30T14:00:00.000Z");

    const privateSource = await prisma.sourceItem.findUniqueOrThrow({ where: { id: "SRC-016-A" } });
    expect(privateSource.visibility).toBe(SourceVisibility.PRIVATE);
    expect(parseMetadata(privateSource.metadataJson)).toMatchObject({
      authorization: { authorized: false, scope: "owner-only" },
    });

    await expect(prisma.opportunityContact.count({ where: { opportunityId: "OPP-001-HEALTHY" } })).resolves.toBe(2);
    await expect(prisma.opportunityContact.count({ where: { opportunityId: "OPP-016-PRIVATE-SOURCE-NO-CONTACTS" } })).resolves.toBe(0);
  });
});
