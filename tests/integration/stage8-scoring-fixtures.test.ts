import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compareFields } from "../../lib/agents/comparison";
import { MockModelProvider } from "../../lib/agents/extraction";
import { ingestDealContext, type DealContextPackage } from "../../lib/agents/ingestion";
import { scoreOpportunity, type HygieneScoreResult } from "../../lib/agents/scoring";
import { validateFacts, type ValidationFact } from "../../lib/agents/validation";
import { seedCrmFixtures } from "../../prisma/seed";

process.env.DATABASE_URL = "file:./test.db";

const prisma = new PrismaClient();
const extractor = new MockModelProvider();
const referenceDate = new Date("2026-05-30T12:00:00.000Z");

describe("Stage 8 scoring fixture-backed flow", () => {
  beforeAll(async () => {
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], { cwd: process.cwd(), stdio: "pipe" });
    await seedCrmFixtures(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("gives the seeded healthy deal a healthy score", async () => {
    const scored = await scoreSeededDeal("OPP-001-HEALTHY");

    expect(scored.score).toBeGreaterThanOrEqual(80);
    expect(scored.riskLevel).toBe("Low");
    expect(scored.explanation).toContain("Hygiene score");
  });

  it("classifies the seeded Commit deal with a procurement blocker as high risk", async () => {
    const scored = await scoreSeededDeal("OPP-004-COMMIT-PROCUREMENT");

    expect(scored.riskLevel).toBe("High");
    expect(scored.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ dimension: "risk_visibility", severity: "high" })]));
  });

  it("classifies a deal with no notes but current CRM fields as medium risk, not critical", async () => {
    const scored = await scoreSeededDeal("OPP-013-NO-NOTES");

    expect(scored.riskLevel).toBe("Medium");
    expect(scored.riskLevel).not.toBe("Critical");
    expect(scored.explanation).toContain("No authorized notes/source items");
  });

  it("classifies a deal with contradictory manager and customer notes as high risk", async () => {
    const context = await ingestDealContext(prisma, "OPP-011-CONFLICTING-NOTES");
    const facts = [
      testFact({ factId: "manager-commit", sourceId: "SRC-011-A", sourceTimestamp: new Date("2026-05-25T15:00:00.000Z"), rawValue: "commit", normalizedValue: "commit", evidenceText: "Manager note says budget is approved and signature is targeted for next Friday." }),
      testFact({ factId: "customer-not-commit", sourceId: "SRC-011-B", sourceTimestamp: new Date("2026-05-28T11:00:00.000Z"), rawValue: "not commit-ready", normalizedValue: "not commit-ready", evidenceText: "Customer email says budget is not approved because the board moved the vote to next month." }),
      testFact({ factId: "timeline-next-month", factType: "timeline_signal", sourceId: "SRC-011-B", sourceTimestamp: new Date("2026-05-28T11:00:00.000Z"), rawValue: "next month", normalizedValue: "next month", evidenceText: "Customer email says the board moved the vote to next month.", suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "TimelineSignal__c", fieldLabel: "Timeline Signal", confidence: 1 } }),
    ];
    const scored = scoreContext(context, facts);

    expect(scored.riskLevel).toBe("High");
    expect(scored.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ comparisonIssueType: "timeline_mismatch" })]));
  });
});

async function scoreSeededDeal(opportunityId: string): Promise<HygieneScoreResult> {
  const context = await ingestDealContext(prisma, opportunityId);
  const facts = await extractor.extractDealFacts({ sourceItems: context.sourceItems });
  return scoreContext(context, facts);
}

function scoreContext(context: DealContextPackage, facts: ValidationFact[]): HygieneScoreResult {
  const validationResults = validateFacts({
    facts,
    sources: context.sourceItems.map((source) => ({ id: source.id, visibility: source.visibility, metadata: source.metadata })),
    options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
  });
  const comparisons = compareFields({ opportunity: context.opportunity, crmSnapshot: context.crmSnapshot, facts, validationResults, options: { referenceDate } });

  return scoreOpportunity({
    opportunity: context.opportunity,
    crmSnapshot: context.crmSnapshot,
    contacts: context.contacts,
    sourceItems: context.sourceItems,
    facts,
    validationResults,
    comparisons,
    options: { referenceDate },
  });
}

function testFact(overrides: Partial<ValidationFact>): ValidationFact {
  return {
    factId: "forecast",
    factType: "forecast_signal",
    rawValue: "commit",
    normalizedValue: "commit",
    evidenceText: "Forecast signal: commit.",
    sourceId: "SRC-011-A",
    sourceTimestamp: new Date("2026-05-25T15:00:00.000Z"),
    confidence: 0.9,
    confidenceBand: "high",
    suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "ForecastSignal__c", fieldLabel: "Forecast Signal", confidence: 1 },
    recommendationEligible: true,
    sourceMatchStatus: "matched",
    ...overrides,
  };
}
