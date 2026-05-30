import { execFileSync } from "node:child_process";

import { PrismaClient, SourceVisibility } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ingestDealContext } from "../../lib/agents/ingestion";
import { dealContextPackageSchema } from "../../lib/agents/ingestion/schemas";
import { fixtures, seedCrmFixtures } from "../../prisma/seed";

process.env.DATABASE_URL = "file:./test.db";

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

  it("ingests every seeded opportunity into schema-valid deal context packages", async () => {
    const opportunities = await prisma.opportunity.findMany({
      orderBy: { externalId: "asc" },
      select: { id: true, externalId: true },
    });

    expect(opportunities).toHaveLength(expectedOpportunityCount);

    for (const opportunity of opportunities) {
      const context = await ingestDealContext(prisma, opportunity.id);
      expect(dealContextPackageSchema.safeParse(context).success, opportunity.externalId ?? opportunity.id).toBe(true);
      expect(context.metadata.opportunityId).toBe(opportunity.id);
    }
  });

  it("never returns private or unauthorized seeded sources during ingestion", async () => {
    const opportunities = await prisma.opportunity.findMany({
      orderBy: { externalId: "asc" },
      select: { id: true, externalId: true },
    });

    for (const opportunity of opportunities) {
      const context = await ingestDealContext(prisma, opportunity.id);

      for (const source of context.sourceItems) {
        expect(source.visibility, `${opportunity.externalId}:${source.id}`).not.toBe(SourceVisibility.PRIVATE);
        expect(source.metadata.authorized, `${opportunity.externalId}:${source.id}`).not.toBe(false);
        expect(source.metadata.authorization?.authorized, `${opportunity.externalId}:${source.id}`).not.toBe(false);
      }
    }
  });

  it("deduplicates seeded duplicate notes during ingestion", async () => {
    const context = await ingestDealContext(prisma, "OPP-014-DUPLICATE-NOTES");

    expect(context.sourceItems.map((source) => source.id)).toEqual(["SRC-014-A"]);
    expect(context.metadata.duplicateSourceItemCount).toBe(1);
    expect(context.warnings.map((warning) => warning.code)).toContain("DUPLICATE_SOURCE_SUPPRESSED");
  });

  it("preserves source metadata for returned ingestion sources", async () => {
    const opportunities = await prisma.opportunity.findMany({
      orderBy: { externalId: "asc" },
      select: { id: true, externalId: true },
    });

    for (const opportunity of opportunities) {
      const context = await ingestDealContext(prisma, opportunity.id);

      for (const source of context.sourceItems) {
        const seeded = await prisma.sourceItem.findUniqueOrThrow({
          where: { id: source.id },
          select: { type: true, visibility: true, occurredAt: true, ingestedAt: true, metadataJson: true },
        });
        const metadata = parseMetadata(seeded.metadataJson);

        expect(source).toMatchObject({
          type: seeded.type,
          visibility: seeded.visibility,
          occurredAt: seeded.occurredAt,
          ingestedAt: seeded.ingestedAt,
          metadata,
        });
      }
    }
  });

  it("does not create extraction, scoring, comparison, recommendation, or approval records during ingestion", async () => {
    const opportunities = await prisma.opportunity.findMany({ select: { id: true } });

    for (const opportunity of opportunities) {
      await ingestDealContext(prisma, opportunity.id);
    }

    await expect(prisma.extractedFact.count()).resolves.toBe(0);
    await expect(prisma.fieldComparison.count()).resolves.toBe(0);
    await expect(prisma.hygieneScore.count()).resolves.toBe(0);
    await expect(prisma.recommendation.count()).resolves.toBe(0);
    await expect(prisma.approvalAction.count()).resolves.toBe(0);
  });

});
