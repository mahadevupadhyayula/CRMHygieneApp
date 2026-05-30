import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compareFields, type FieldComparison } from "../../lib/agents/comparison";
import { MockModelProvider } from "../../lib/agents/extraction";
import { ingestDealContext, type DealContextPackage } from "../../lib/agents/ingestion";
import { validateFacts, type ValidationFact } from "../../lib/agents/validation";
import { seedCrmFixtures } from "../../prisma/seed";

process.env.DATABASE_URL = "file:./test.db";

const prisma = new PrismaClient();
const extractor = new MockModelProvider();
const referenceDate = new Date("2026-05-30T12:00:00.000Z");

describe("Stage 7 comparison fixture-backed flow", () => {
  beforeAll(async () => {
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], { cwd: process.cwd(), stdio: "pipe" });
    await seedCrmFixtures(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("flags the seeded Commit deal with procurement delay", async () => {
    const comparisons = await compareSeededDeal("OPP-004-COMMIT-PROCUREMENT");

    expect(comparisons).toEqual(expect.arrayContaining([expect.objectContaining({ crmField: "ForecastCategoryName", issueType: "forecast_mismatch", severity: "high" })]));
    expect(comparisons).toEqual(expect.arrayContaining([expect.objectContaining({ crmField: "ProcurementStatus__c", issueType: "contradiction" })]));
  });

  it("keeps the healthy seeded deal free of high-risk comparisons", async () => {
    const comparisons = await compareSeededDeal("OPP-001-HEALTHY");

    expect(comparisons.filter((comparison) => comparison.severity === "high")).toEqual([]);
  });

  it("does not create a comparison from an ambiguous source match", async () => {
    const context = await ingestDealContext(prisma, "OPP-012-AMBIGUOUS-MATCH");
    const facts = [
      extractedFact({
        factId: "ambiguous-next-step",
        factType: "next_step",
        sourceId: context.sourceItems[0].id,
        rawValue: "send proposal",
        normalizedValue: "send proposal",
        evidenceText: "Next step: send proposal.",
        sourceTimestamp: context.sourceItems[0].occurredAt ?? referenceDate,
        sourceMatchStatus: "ambiguous",
        recommendationEligible: false,
        suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "NextStep", fieldLabel: "Next Step", confidence: 1 },
      }),
    ];
    const comparisons = compareContext(context, facts);

    expect(facts).toHaveLength(1);
    expect(comparisons).toEqual([]);
  });

  it("lets a resolved newer note override an older note", () => {
    const older = extractedFact({
      factId: "older-stage",
      sourceId: "source-old",
      sourceTimestamp: new Date("2026-05-28T12:00:00.000Z"),
      rawValue: "still defining requirements",
      normalizedValue: "still defining requirements",
      evidenceText: "Stage signal: still defining requirements.",
    });
    const newer = extractedFact({
      factId: "newer-stage",
      sourceId: "source-new",
      sourceTimestamp: new Date("2026-05-30T09:00:00.000Z"),
      rawValue: "quote and discount requested",
      normalizedValue: "quote and discount requested",
      evidenceText: "Stage signal: quote and discount requested.",
    });
    const validationResults = validateFacts({
      facts: [older, newer],
      sources: [
        { id: "source-old", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } },
        { id: "source-new", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } },
      ],
      options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
    });

    const comparisons = compareFields({
      opportunity: { stage: "NEGOTIATION" },
      crmSnapshot: [{ fieldName: "StageName", value: "NEGOTIATION", capturedAt: referenceDate }],
      facts: [older, newer],
      validationResults,
      options: { referenceDate },
    });

    expect(comparisons).toEqual([]);
  });
});

async function compareSeededDeal(opportunityId: string): Promise<FieldComparison[]> {
  const context = await ingestDealContext(prisma, opportunityId);
  const facts = await extractor.extractDealFacts({ sourceItems: context.sourceItems });
  return compareContext(context, facts);
}

function compareContext(context: DealContextPackage, facts: ValidationFact[]): FieldComparison[] {
  const validationResults = validateFacts({
    facts,
    sources: context.sourceItems.map((source) => ({ id: source.id, visibility: source.visibility, metadata: source.metadata })),
    options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
  });

  return compareFields({
    opportunity: context.opportunity,
    crmSnapshot: context.crmSnapshot,
    facts,
    validationResults,
    options: { referenceDate },
  });
}

function extractedFact(overrides: Partial<ValidationFact>): ValidationFact {
  return {
    factType: "stage_signal",
    rawValue: "quote and discount requested",
    normalizedValue: "quote and discount requested",
    evidenceText: "Stage signal: quote and discount requested.",
    sourceId: "source-new",
    sourceTimestamp: new Date("2026-05-30T09:00:00.000Z"),
    confidence: 0.84,
    confidenceBand: "high",
    suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "StageSignal__c", fieldLabel: "Stage Signal", confidence: 1 },
    recommendationEligible: true,
    sourceMatchStatus: "matched",
    ...overrides,
  };
}
