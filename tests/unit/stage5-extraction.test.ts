import { describe, expect, it } from "vitest";

import { extractedFactSchema, MockModelProvider, StructuredExtractionAgent, type ExtractedFact } from "../../lib/agents/extraction";

function expectFact(facts: ExtractedFact[], partial: Partial<ExtractedFact>) {
  expect(facts).toEqual(expect.arrayContaining([expect.objectContaining(partial)]));
}

describe("Structured Extraction Agent", () => {
  it("extracts schema-valid MBP facts with source evidence and CRM field mappings", async () => {
    const provider = new MockModelProvider();

    const facts = await provider.extractDealFacts({
      sourceItems: [
        {
          id: "src-mbp-1",
          title: "Executive sponsor recap",
          body: "Next step: send security questionnaire. Next-step owner: Maya Chen. Next-step due date: 2026-06-05. Decision-maker: CFO Dana Lee. Approver: procurement. Champion: Jordan Lee. Risk severity: high. Risk: legal redlines may delay signature. Timeline signal: launch by end of month. Close date risk: close date slipping. Stage signal: moving to procurement. Forecast signal: commit. Procurement status: reviewing order form. Legal status: redlines open. Security status: questionnaire pending. Internal owner needed: deal desk.",
          occurredAt: new Date("2026-05-30T10:00:00.000Z"),
          ingestedAt: new Date("2026-05-30T10:05:00.000Z"),
          metadata: {},
        },
      ],
    });

    expect(facts.length).toBeGreaterThanOrEqual(16);
    expect(facts.every((fact) => extractedFactSchema.safeParse(fact).success)).toBe(true);
    expect(facts.every((fact) => fact.evidenceText.length > 0)).toBe(true);
    expect(facts.every((fact) => fact.sourceId === "src-mbp-1")).toBe(true);
    expect(facts.every((fact) => fact.sourceTimestamp.toISOString() === "2026-05-30T10:00:00.000Z")).toBe(true);
    expect(facts.every((fact) => fact.suggestedCrmFieldMapping.objectName === "Opportunity")).toBe(true);
    expectFact(facts, { factType: "next_step", rawValue: "send security questionnaire", normalizedValue: "send security questionnaire" });
    expectFact(facts, { factType: "next_step_owner", rawValue: "Maya Chen", normalizedValue: "maya chen" });
    expectFact(facts, { factType: "risk_severity", rawValue: "high", normalizedValue: "high" });
    expectFact(facts, { factType: "internal_owner_needed", rawValue: "deal desk", normalizedValue: "deal desk" });
  });

  it("marks lower-confidence keyword facts as non-high confidence while preserving evidence", async () => {
    const facts = await new MockModelProvider().extractDealFacts({
      sourceItems: [
        {
          id: "src-keyword",
          body: "The close date is at risk because security is delayed.",
          occurredAt: new Date("2026-05-30T11:00:00.000Z"),
        },
      ],
    });

    const risk = facts.find((fact) => fact.factType === "risk");
    expect(risk).toMatchObject({ confidenceBand: "medium", recommendationEligible: true, sourceId: "src-keyword" });
    expect(risk?.evidenceText).toContain("at risk");
  });

  it("keeps ambiguous and unmatched source facts out of recommendation eligibility by default", async () => {
    const facts = await new MockModelProvider().extractDealFacts({
      sourceItems: [
        {
          id: "src-ambiguous",
          body: "Next step: confirm final approver.",
          occurredAt: new Date("2026-05-30T12:00:00.000Z"),
          matchStatus: "ambiguous",
        },
      ],
    });

    expectFact(facts, {
      factType: "next_step",
      sourceMatchStatus: "ambiguous",
      recommendationEligible: false,
    });
  });

  it("does not emit facts when evidence source timestamp is missing", async () => {
    const facts = await new MockModelProvider().extractDealFacts({
      sourceItems: [
        {
          id: "src-no-timestamp",
          body: "Next step: send the proposal.",
        },
      ],
    });

    expect(facts).toEqual([]);
  });

  it("validates facts returned by wrapped model providers", async () => {
    const agent = new StructuredExtractionAgent({
      async extractDealFacts() {
        return [
          {
            factType: "next_step",
            rawValue: "send proposal",
            normalizedValue: "send proposal",
            evidenceText: "Next step: send proposal.",
            sourceId: "src-wrapper",
            sourceTimestamp: new Date("2026-05-30T13:00:00.000Z"),
            confidence: 0.9,
            confidenceBand: "high",
            suggestedCrmFieldMapping: {
              objectName: "Opportunity",
              fieldName: "NextStep",
              fieldLabel: "Next Step",
              confidence: 1,
            },
            recommendationEligible: true,
            sourceMatchStatus: "matched",
          },
        ];
      },
    });

    await expect(agent.extractDealFacts({ sourceItems: [] })).resolves.toHaveLength(1);
  });
});
