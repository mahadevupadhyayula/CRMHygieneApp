import { describe, expect, it } from "vitest";

import { MockModelProvider, StructuredExtractionAgent } from "../../lib/agents/extraction";
import { validateFacts } from "../../lib/agents/validation";

const referenceDate = new Date("2026-05-30T12:00:00.000Z");
const extractor = new StructuredExtractionAgent(new MockModelProvider());

describe("Stage 6 validation fixture-backed flow", () => {
  it("validates high-confidence extracted evidence from an authorized matched source", async () => {
    const facts = await extractor.extractDealFacts({
      sourceItems: [
        {
          id: "fixture-source-valid",
          title: "Next step recap",
          body: "Next step: send mutual action plan. Forecast signal: commit.",
          occurredAt: new Date("2026-05-29T10:00:00.000Z"),
          matchStatus: "matched",
          metadata: { authorization: { authorized: true, scope: "team" } },
        },
      ],
    });

    const results = validateFacts({
      facts,
      sources: [{ id: "fixture-source-valid", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } }],
      options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
    });

    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ status: "valid", evidenceStatus: "present" })]));
    expect(results.find((result) => result.factId.includes("forecast_signal"))?.actionRisk).toBe("high");
  });

  it("keeps vague low-confidence extracted facts out of valid recommendation flow", async () => {
    const facts = await extractor.extractDealFacts({
      sourceItems: [
        {
          id: "fixture-source-vague",
          title: "Vague follow-up",
          body: "Follow up soon.",
          occurredAt: new Date("2026-05-29T10:00:00.000Z"),
          matchStatus: "matched",
          metadata: { authorization: { authorized: true, scope: "team" } },
        },
      ],
    });

    const results = validateFacts({
      facts,
      sources: [{ id: "fixture-source-vague", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } }],
      options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "needs_review", evidenceStatus: "present", actionRisk: "low" });
    expect(results[0].reasons.join(" ")).toContain("LOW_CONFIDENCE");
    expect(results[0].reasons.join(" ")).toContain("NOT_RECOMMENDATION_ELIGIBLE");
  });

  it("rejects extracted facts when their source authorization metadata is unsafe", async () => {
    const facts = await extractor.extractDealFacts({
      sourceItems: [
        {
          id: "fixture-source-private",
          title: "Private legal update",
          body: "Legal status: redlines pending.",
          occurredAt: new Date("2026-05-29T10:00:00.000Z"),
          matchStatus: "matched",
          metadata: { authorization: { authorized: false, scope: "owner-only" } },
        },
      ],
    });

    const results = validateFacts({
      facts,
      sources: [{ id: "fixture-source-private", visibility: "PRIVATE", metadata: { authorization: { authorized: false, scope: "owner-only" } } }],
      options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(results.every((result) => result.evidenceStatus === "unauthorized")).toBe(true);
  });

  it("detects conflicting extracted legal status facts without discarding either evidence item", async () => {
    const facts = await extractor.extractDealFacts({
      sourceItems: [
        {
          id: "fixture-source-email",
          title: "Customer email",
          body: "Legal is pending.",
          occurredAt: new Date("2026-05-29T10:00:00.000Z"),
          matchStatus: "matched",
          metadata: { authorization: { authorized: true, scope: "team" } },
        },
        {
          id: "fixture-source-manager",
          title: "Manager note",
          body: "Legal is done.",
          occurredAt: new Date("2026-05-30T10:00:00.000Z"),
          matchStatus: "matched",
          metadata: { authorization: { authorized: true, scope: "team" } },
        },
      ],
    });

    const results = validateFacts({
      facts,
      sources: [
        { id: "fixture-source-email", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } },
        { id: "fixture-source-manager", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } },
      ],
      options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
    });

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.status === "needs_review")).toBe(true);
    expect(results.every((result) => result.evidenceStatus === "contradictory")).toBe(true);
  });
});
