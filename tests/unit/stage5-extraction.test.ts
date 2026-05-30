import { describe, expect, it } from "vitest";

import { extractedFactSchema, MockModelProvider, StructuredExtractionAgent, type ExtractedFact, type ExtractedFactType, type ExtractionSourceItem } from "../../lib/agents/extraction";

const BASE_TIME = new Date("2026-05-30T10:00:00.000Z");

type ExpectedFact = Pick<ExtractedFact, "factType" | "rawValue" | "normalizedValue" | "confidenceBand" | "recommendationEligible">;

function source(body: string, overrides: Partial<ExtractionSourceItem> = {}): ExtractionSourceItem {
  return {
    id: overrides.id ?? "src-test",
    body,
    occurredAt: overrides.occurredAt ?? BASE_TIME,
    ...overrides,
  };
}

async function extract(sourceItems: ExtractionSourceItem[]): Promise<ExtractedFact[]> {
  return new MockModelProvider().extractDealFacts({ sourceItems });
}

function projectFacts(facts: ExtractedFact[]): ExpectedFact[] {
  return facts.map(({ factType, rawValue, normalizedValue, confidenceBand, recommendationEligible }) => ({
    factType,
    rawValue,
    normalizedValue,
    confidenceBand,
    recommendationEligible,
  }));
}

function expectFact(facts: ExtractedFact[], partial: Partial<ExtractedFact>) {
  expect(facts).toEqual(expect.arrayContaining([expect.objectContaining(partial)]));
}

function expectNoFactType(facts: ExtractedFact[], factType: ExtractedFactType) {
  expect(facts.some((fact) => fact.factType === factType)).toBe(false);
}

describe("Structured Extraction Agent targeted fact extraction", () => {
  it.each([
    ["extracts next step", "Next step: send proposal.", { factType: "next_step", rawValue: "send proposal", normalizedValue: "send proposal" }],
    ["extracts due date", "Next-step due date: 2026-06-05.", { factType: "next_step_due_date", rawValue: "2026-06-05", normalizedValue: "2026-06-05" }],
    ["extracts decision-maker role", "Decision-maker: CFO.", { factType: "decision_maker", rawValue: "CFO", normalizedValue: "cfo" }],
    ["extracts risk", "Risk: legal redlines may delay signature.", { factType: "risk", rawValue: "legal redlines may delay signature", normalizedValue: "legal redlines may delay signature" }],
    ["extracts stage signal", "Stage signal: moving to procurement.", { factType: "stage_signal", rawValue: "moving to procurement", normalizedValue: "moving to procurement" }],
    ["extracts forecast signal", "Forecast signal: best case.", { factType: "forecast_signal", rawValue: "best case", normalizedValue: "best case" }],
    ["extracts legal status", "Legal status: pending review.", { factType: "legal_status", rawValue: "pending review", normalizedValue: "pending review" }],
    ["extracts security status", "Security status: questionnaire pending.", { factType: "security_status", rawValue: "questionnaire pending", normalizedValue: "questionnaire pending" }],
    ["extracts procurement status", "Procurement status: delayed by vendor setup.", { factType: "procurement_status", rawValue: "delayed by vendor setup", normalizedValue: "delayed by vendor setup" }],
  ] as const)("%s", async (_name, body, expected) => {
    const facts = await extract([source(body)]);

    expect(facts.every((fact) => extractedFactSchema.safeParse(fact).success)).toBe(true);
    expectFact(facts, expected);
  });

  it("does not create fact without evidence", async () => {
    const facts = await extract([source("The buyer sounded positive and the account is strategic.")]);

    expect(facts).toEqual([]);
  });

  it("marks low-confidence facts", async () => {
    const facts = await extract([source("Follow up soon.")]);

    expectFact(facts, {
      factType: "next_step",
      rawValue: "Follow up soon",
      normalizedValue: "follow up soon",
      confidenceBand: "low",
      recommendationEligible: false,
    });
  });
});

describe("Structured Extraction Agent golden fixtures", () => {
  const fixtures: Array<{ name: string; body: string; expected: ExpectedFact[] }> = [
    {
      name: "clean next step",
      body: "Next step: send proposal.",
      expected: [{ factType: "next_step", rawValue: "send proposal", normalizedValue: "send proposal", confidenceBand: "high", recommendationEligible: true }],
    },
    {
      name: "vague next step",
      body: "Follow up soon.",
      expected: [{ factType: "next_step", rawValue: "Follow up soon", normalizedValue: "follow up soon", confidenceBand: "low", recommendationEligible: false }],
    },
    {
      name: "CFO approval required",
      body: "CFO approval required before signature.",
      expected: [{ factType: "decision_maker", rawValue: "CFO", normalizedValue: "cfo", confidenceBand: "medium", recommendationEligible: true }],
    },
    {
      name: "procurement delay",
      body: "Procurement is delayed by vendor setup.",
      expected: [
        { factType: "procurement_status", rawValue: "delayed by vendor setup", normalizedValue: "delayed by vendor setup", confidenceBand: "high", recommendationEligible: true },
        { factType: "risk", rawValue: "delayed", normalizedValue: "delayed", confidenceBand: "medium", recommendationEligible: true },
      ],
    },
    {
      name: "legal review pending",
      body: "Legal is pending final review.",
      expected: [{ factType: "legal_status", rawValue: "pending final review", normalizedValue: "pending final review", confidenceBand: "high", recommendationEligible: true }],
    },
    {
      name: "security questionnaire pending",
      body: "Security status: questionnaire pending.",
      expected: [{ factType: "security_status", rawValue: "questionnaire pending", normalizedValue: "questionnaire pending", confidenceBand: "high", recommendationEligible: true }],
    },
    {
      name: "budget pushed",
      body: "Budget pushed to next quarter.",
      expected: [
        { factType: "risk", rawValue: "Budget pushed", normalizedValue: "budget pushed", confidenceBand: "medium", recommendationEligible: true },
        { factType: "timeline_signal", rawValue: "next quarter", normalizedValue: "next quarter", confidenceBand: "medium", recommendationEligible: true },
      ],
    },
    {
      name: "competitor mentioned",
      body: "Competitor mentioned in final evaluation.",
      expected: [{ factType: "risk", rawValue: "Competitor mentioned", normalizedValue: "competitor mentioned", confidenceBand: "medium", recommendationEligible: true }],
    },
    {
      name: "discount requested",
      body: "Discount requested by procurement.",
      expected: [
        { factType: "procurement_status", rawValue: "requested by procurement", normalizedValue: "requested by procurement", confidenceBand: "medium", recommendationEligible: true },
        { factType: "risk", rawValue: "Discount requested", normalizedValue: "discount requested", confidenceBand: "medium", recommendationEligible: true },
      ],
    },
    {
      name: "technical blocker",
      body: "Technical blocker: SSO integration failed.",
      expected: [{ factType: "risk", rawValue: "blocker", normalizedValue: "blocker", confidenceBand: "medium", recommendationEligible: true }],
    },
    {
      name: "close date risk",
      body: "Close date is at risk after redlines expanded.",
      expected: [
        { factType: "close_date_risk", rawValue: "Close date is at risk", normalizedValue: "close date is at risk", confidenceBand: "medium", recommendationEligible: true },
        { factType: "risk", rawValue: "at risk", normalizedValue: "at risk", confidenceBand: "medium", recommendationEligible: true },
      ],
    },
    {
      name: "forecast not commit-ready",
      body: "Forecast signal: not commit-ready.",
      expected: [{ factType: "forecast_signal", rawValue: "not commit-ready", normalizedValue: "not commit-ready", confidenceBand: "high", recommendationEligible: true }],
    },
    {
      name: "conflicting notes",
      body: "Legal is pending. Legal is done.",
      expected: [
        { factType: "legal_status", rawValue: "pending", normalizedValue: "pending", confidenceBand: "high", recommendationEligible: true },
        { factType: "legal_status", rawValue: "done", normalizedValue: "done", confidenceBand: "high", recommendationEligible: true },
      ],
    },
    {
      name: "multiple facts in one note",
      body: "Next step: send order form. Next-step due date: 2026-06-05. Procurement status: reviewing order form.",
      expected: [
        { factType: "next_step", rawValue: "send order form", normalizedValue: "send order form", confidenceBand: "high", recommendationEligible: true },
        { factType: "next_step_due_date", rawValue: "2026-06-05", normalizedValue: "2026-06-05", confidenceBand: "high", recommendationEligible: true },
        { factType: "procurement_status", rawValue: "reviewing order form", normalizedValue: "reviewing order form", confidenceBand: "high", recommendationEligible: true },
      ],
    },
    {
      name: "no extractable facts",
      body: "Great discussion with the team today.",
      expected: [],
    },
  ];

  it.each(fixtures)("matches expected JSON for $name", async ({ body, expected }) => {
    const facts = await extract([source(body)]);

    expect(projectFacts(facts)).toEqual(expected);
  });
});

describe("Structured Extraction Agent edge cases", () => {
  it("extracts a low-confidence vague next step without a due date from `Follow up soon`", async () => {
    const facts = await extract([source("Follow up soon.")]);

    expectFact(facts, { factType: "next_step", rawValue: "Follow up soon", confidenceBand: "low" });
    expectNoFactType(facts, "next_step_due_date");
  });

  it("does not extract next step from `Need to send it` without an object", async () => {
    const facts = await extract([source("Need to send it.")]);

    expect(facts).toEqual([]);
  });

  it("extracts CFO as a decision-maker role even when no person name is supplied", async () => {
    const facts = await extract([source("CFO approval required.")]);

    expectFact(facts, { factType: "decision_maker", rawValue: "CFO", normalizedValue: "cfo", confidenceBand: "medium" });
  });

  it("keeps distinct legal status evidence for `Legal is done` and `legal is pending`", async () => {
    const facts = await extract([source("Legal is done. legal is pending.")]);

    expectFact(facts, { factType: "legal_status", rawValue: "done", normalizedValue: "done" });
    expectFact(facts, { factType: "legal_status", rawValue: "pending", normalizedValue: "pending" });
  });

  it("keeps distinct security status evidence for `Security reviewed` and `security review needed`", async () => {
    const facts = await extract([source("Security reviewed. security review needed.")]);

    expectFact(facts, { factType: "security_status", rawValue: "reviewed", normalizedValue: "reviewed" });
    expectFact(facts, { factType: "security_status", rawValue: "review needed", normalizedValue: "review needed" });
  });

  it("preserves newer resolved risk evidence without deleting the older risk", async () => {
    const facts = await extract([
      source("Risk: legal redlines may delay signature.", { id: "old-risk", occurredAt: new Date("2026-05-29T10:00:00.000Z") }),
      source("Risk: legal redlines resolved.", { id: "new-risk", occurredAt: new Date("2026-05-30T10:00:00.000Z") }),
    ]);

    expectFact(facts, { factType: "risk", sourceId: "old-risk", rawValue: "legal redlines may delay signature" });
    expectFact(facts, { factType: "risk", sourceId: "new-risk", rawValue: "legal redlines resolved" });
  });

  it("extracts multiple next steps from one note", async () => {
    const facts = await extract([source("Next step: send pricing. Next step: schedule legal review.")]);

    expectFact(facts, { factType: "next_step", rawValue: "send pricing" });
    expectFact(facts, { factType: "next_step", rawValue: "schedule legal review" });
  });

  it("does not infer an owner when the customer asked for a document but no owner is provided", async () => {
    const facts = await extract([source("Customer asked for the SOC 2 document.")]);

    expectNoFactType(facts, "next_step_owner");
    expectNoFactType(facts, "internal_owner_needed");
  });

  it("does not emit unsupported inferences", async () => {
    const facts = await extract([source("The meeting had strong energy, so this must be commit.")]);

    expect(facts).toEqual([]);
  });
});


describe("Structured Extraction Agent contract coverage", () => {
  it("extracts schema-valid MBP facts with source evidence and CRM field mappings", async () => {
    const facts = await extract([
      {
        id: "src-mbp-1",
        title: "Executive sponsor recap",
        body: "Next step: send security questionnaire. Next-step owner: Maya Chen. Next-step due date: 2026-06-05. Decision-maker: CFO Dana Lee. Approver: procurement. Champion: Jordan Lee. Risk severity: high. Risk: legal redlines may delay signature. Timeline signal: launch by end of month. Close date risk: close date slipping. Stage signal: moving to procurement. Forecast signal: commit. Procurement status: reviewing order form. Legal status: redlines open. Security status: questionnaire pending. Internal owner needed: deal desk.",
        occurredAt: new Date("2026-05-30T10:00:00.000Z"),
        ingestedAt: new Date("2026-05-30T10:05:00.000Z"),
        metadata: {},
      },
    ]);

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

  it("keeps ambiguous and unmatched source facts out of recommendation eligibility by default", async () => {
    const facts = await extract([
      source("Next step: confirm final approver.", {
        id: "src-ambiguous",
        occurredAt: new Date("2026-05-30T12:00:00.000Z"),
        matchStatus: "ambiguous",
      }),
    ]);

    expectFact(facts, {
      factType: "next_step",
      sourceMatchStatus: "ambiguous",
      recommendationEligible: false,
    });
  });

  it("does not emit facts when evidence source timestamp is missing", async () => {
    const facts = await extract([
      {
        id: "src-no-timestamp",
        body: "Next step: send the proposal.",
      },
    ]);

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
