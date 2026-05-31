import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compareFields, type FieldComparison } from "../../lib/agents/comparison";
import { MockModelProvider } from "../../lib/agents/extraction";
import { ingestDealContext, type DealContextPackage } from "../../lib/agents/ingestion";
import { generateRecommendations, type RecommendationCard } from "../../lib/agents/recommendation";
import { validateFacts, type ValidationFact, type ValidationResult } from "../../lib/agents/validation";
import { seedCrmFixtures } from "../../prisma/seed";

process.env.DATABASE_URL = "file:./test.db";

const prisma = new PrismaClient();
const extractor = new MockModelProvider();
const referenceDate = new Date("2026-05-30T12:00:00.000Z");

describe("Stage 9 recommendation fixture-backed flow", () => {
  beforeAll(async () => {
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], { cwd: process.cwd(), stdio: "pipe" });
    await seedCrmFixtures(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("turns a procurement blocker into a risk recommendation and manager review", async () => {
    const cards = await recommendSeededDeal("OPP-004-COMMIT-PROCUREMENT");

    expect(cards).toEqual(expect.arrayContaining([expect.objectContaining({ actionType: "add_risk_tag", riskLevel: "medium" })]));
    expect(cards).toEqual(expect.arrayContaining([expect.objectContaining({ actionType: "request_manager_review", requiredApprover: "manager" })]));
  });

  it("turns a missing next step into a task recommendation", async () => {
    const cards = recommendFromSynthetic({ comparisons: [comparison({ crmField: "NextStepDueDate__c", currentValue: "", extractedValue: "Send mutual action plan by 2026-06-03", issueType: "missing_task", severity: "medium" })] });

    expect(cards).toEqual([expect.objectContaining({ actionType: "create_task", approvalPolicy: "none", riskLevel: "low" })]);
  });

  it("turns legal pending evidence into an internal owner recommendation", () => {
    const fact = testFact({ factId: "legal", factType: "legal_status", rawValue: "legal pending redlines", normalizedValue: "legal pending redlines", evidenceText: "Legal review is pending redlines.", suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "LegalStatus__c", fieldLabel: "Legal Status", confidence: 1 } });
    const cards = recommendFromSynthetic({ facts: [fact], validationResults: [result("legal")] });

    expect(cards).toEqual([expect.objectContaining({ actionType: "assign_internal_owner", crmField: "LegalStatus__c", suggestedValue: "legal owner", approvalPolicy: "standard_approval" })]);
  });

  it("turns a forecast conflict into an approval card", () => {
    const cards = recommendFromSynthetic({ comparisons: [comparison({ crmField: "ForecastCategoryName", currentValue: "COMMIT", extractedValue: "PIPELINE", issueType: "forecast_mismatch", severity: "high" })], options: { approvers: { manager: "mgr-1", revOps: "ops-1" } } });

    expect(cards).toEqual(expect.arrayContaining([expect.objectContaining({ actionType: "update_crm_field", approvalPolicy: "strict_approval", requiredApprover: "manager", missingRequiredApprover: false })]));
  });

  it("does not create recommendations for a healthy deal", async () => {
    const cards = await recommendSeededDeal("OPP-001-HEALTHY");

    expect(cards).toEqual([]);
  });
});

async function recommendSeededDeal(opportunityId: string): Promise<RecommendationCard[]> {
  const context = await ingestDealContext(prisma, opportunityId);
  const facts = await extractor.extractDealFacts({ sourceItems: context.sourceItems });
  const validationResults = validateContext(context, facts);
  const comparisons = compareFields({ opportunity: context.opportunity, crmSnapshot: context.crmSnapshot, facts, validationResults, options: { referenceDate } });

  return generateRecommendations({ opportunity: context.opportunity, facts, validationResults, comparisons, options: { approvers: { manager: "mgr-1", revOps: "ops-1", dealOwner: "owner-1" } } });
}

function validateContext(context: DealContextPackage, facts: ValidationFact[]): ValidationResult[] {
  return validateFacts({
    facts,
    sources: context.sourceItems.map((source) => ({ id: source.id, visibility: source.visibility, metadata: source.metadata })),
    options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
  });
}

function recommendFromSynthetic(overrides: Partial<Parameters<typeof generateRecommendations>[0]>): RecommendationCard[] {
  const comparisons = overrides.comparisons ?? [];
  return generateRecommendations({
    opportunity: { id: "opp-synthetic", ownerName: "Alex Rivera" },
    facts: [],
    comparisons,
    validationResults: comparisons.map((item) => result(item.evidence.factId)),
    ...overrides,
  });
}

function comparison(overrides: Partial<FieldComparison> = {}): FieldComparison {
  return {
    crmField: "ForecastCategoryName",
    currentValue: "COMMIT",
    extractedValue: "PIPELINE",
    issueType: "forecast_mismatch",
    severity: "high",
    evidence: { factId: "forecast", sourceId: "src-1", sourceTimestamp: referenceDate, evidenceText: "Manager note says the deal is not commit-ready.", validationStatus: "valid", confidence: 0.9 },
    recommendationEligible: true,
    ...overrides,
  };
}

function result(factId: string): ValidationResult {
  return { factId, status: "valid", reasons: ["VALID"], confidence: 0.9, actionRisk: "low", evidenceStatus: "present" };
}

function testFact(overrides: Partial<ValidationFact>): ValidationFact {
  return {
    factId: "fact",
    factType: "procurement_status",
    rawValue: "procurement pending",
    normalizedValue: "procurement pending",
    evidenceText: "Procurement is pending vendor setup.",
    sourceId: "src-1",
    sourceTimestamp: referenceDate,
    confidence: 0.9,
    confidenceBand: "high",
    suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "ProcurementStatus__c", fieldLabel: "Procurement Status", confidence: 1 },
    recommendationEligible: true,
    sourceMatchStatus: "matched",
    ...overrides,
  };
}
