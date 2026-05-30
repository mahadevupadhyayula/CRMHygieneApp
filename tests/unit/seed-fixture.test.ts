import { describe, expect, it } from "vitest";
import { SourceItemType, SourceVisibility } from "@prisma/client";
import { buildStageOneSeedFixture } from "../../prisma/seed";

describe("Stage 1 seed fixture shape", () => {
  const fixture = buildStageOneSeedFixture();

  it("contains the required realistic opportunity scenarios", () => {
    expect(fixture.opportunities.map((opportunity) => opportunity.scenarioKey)).toEqual([
      "healthy-deal",
      "missing-decision-maker",
      "stale-next-step",
      "commit-procurement-blocker",
      "close-date-unrealistic",
      "stage-mismatch",
      "forecast-mismatch",
      "legal-pending",
      "security-review-pending",
      "no-activity-21-days",
      "multiple-conflicting-notes",
      "ambiguous-source-matching",
    ]);
  });

  it("covers edge fixture scenarios", () => {
    const byScenario = new Map(fixture.opportunities.map((opportunity) => [opportunity.scenarioKey, opportunity]));

    expect(byScenario.get("ambiguous-source-matching")?.sources.every((item) => item.type !== SourceItemType.NOTE)).toBe(true);
    expect(byScenario.get("multiple-conflicting-notes")?.sources.filter((item) => item.title === "Duplicate buyer update")).toHaveLength(2);
    expect(byScenario.get("ambiguous-source-matching")?.sources[0].occurredAt.toISOString()).toBe("2026-03-01T12:00:00.000Z");
    expect(byScenario.get("security-review-pending")?.sources.some((item) => item.visibility === SourceVisibility.PRIVATE && item.isAuthorized === false)).toBe(true);
    expect(byScenario.get("healthy-deal")?.contactIds).toHaveLength(2);
    expect(byScenario.get("no-activity-21-days")?.contactIds).toHaveLength(0);
  });

  it("gives every opportunity at least one CRM field snapshot and source item", () => {
    for (const opportunity of fixture.opportunities) {
      expect(Object.keys(opportunity.snapshotFields).length).toBeGreaterThan(0);
      expect(opportunity.sources.length).toBeGreaterThan(0);
      expect(opportunity.sources.every((item) => item.authorName && item.authorEmail && item.occurredAt && item.type && item.visibility)).toBe(true);
    }
  });
});
