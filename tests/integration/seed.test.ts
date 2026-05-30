import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStageOneSeedFixture, seedDatabase } from "../../prisma/seed";

const fixture = buildStageOneSeedFixture();
const tempDir = mkdtempSync(join(tmpdir(), "crm-hygiene-stage-1-"));
const databaseUrl = `file:${join(tempDir, "stage-1.db")}`;
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

beforeAll(async () => {
  execFileSync("npx", ["prisma", "db", "push", "--force-reset", "--skip-generate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
  await seedDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Stage 1 seed integration", () => {
  it("creates expected fixture counts", async () => {
    await expect(prisma.account.count()).resolves.toBe(fixture.accounts.length);
    await expect(prisma.contact.count()).resolves.toBe(fixture.contacts.length);
    await expect(prisma.opportunity.count()).resolves.toBe(12);
    await expect(prisma.sourceItem.count()).resolves.toBe(14);
    await expect(prisma.hygieneScore.count()).resolves.toBe(12);
    await expect(prisma.recommendation.count()).resolves.toBe(11);
    await expect(prisma.approvalAction.count()).resolves.toBe(11);
    await expect(prisma.auditEvent.count()).resolves.toBe(12);
    await expect(prisma.feedbackEvent.count()).resolves.toBe(1);
  });

  it("creates at least one CRM field snapshot for every opportunity", async () => {
    const opportunities = await prisma.opportunity.findMany({ include: { crmFieldSnapshots: true } });

    expect(opportunities).toHaveLength(12);
    for (const opportunity of opportunities) {
      expect(opportunity.crmFieldSnapshots.length).toBeGreaterThan(0);
    }
  });

  it("preserves source item author, timestamp, source type, visibility, and linked record metadata", async () => {
    const sourceItems = await prisma.sourceItem.findMany({ orderBy: { id: "asc" } });

    expect(sourceItems.length).toBeGreaterThan(0);
    for (const item of sourceItems) {
      expect(item.authorName).toMatch(/\w/);
      expect(item.authorEmail).toContain("@");
      expect(item.occurredAt).toBeInstanceOf(Date);
      expect(item.type).toMatch(/NOTE|EMAIL|CALL|MEETING|CRM_UPDATE|SUPPORT_TICKET|DOCUMENT/);
      expect(item.visibility).toMatch(/PUBLIC|INTERNAL|PRIVATE|RESTRICTED/);
      expect(item.authorization).toMatch(/AUTHORIZED|UNAUTHORIZED|NEEDS_REVIEW/);
      expect(item.linkedRecordType).toMatch(/Account|Opportunity/);
      expect(item.linkedRecordId).toMatch(/^(acct|opp)_/);
    }
  });

  it("persists relationship assumptions for contacts and evidence", async () => {
    const multiContact = await prisma.opportunity.findUniqueOrThrow({ where: { scenarioKey: "healthy-deal" }, include: { contacts: true, sourceItems: true } });
    const noContact = await prisma.opportunity.findUniqueOrThrow({ where: { scenarioKey: "no-activity-21-days" }, include: { contacts: true, sourceItems: true } });
    const privateSource = await prisma.sourceItem.findFirstOrThrow({ where: { visibility: "PRIVATE" } });

    expect(multiContact.contacts).toHaveLength(2);
    expect(multiContact.sourceItems).toHaveLength(1);
    expect(noContact.contacts).toHaveLength(0);
    expect(privateSource.authorization).toBe("UNAUTHORIZED");
    expect(privateSource.isAuthorized).toBe(false);
  });
});
