import { describe, expect, it } from "vitest";

import { demoScenarioSchema, demoScenarios } from "../../lib/demo";

const ids = demoScenarios.map((scenario) => scenario.scenarioId);

describe("demo scenarios", () => {
  it("schema-validates every curated scenario", () => {
    for (const scenario of demoScenarios) expect(() => demoScenarioSchema.parse(scenario)).not.toThrow();
  });

  it("contains all four required Phase 2 scenarios", () => {
    expect(ids).toEqual(expect.arrayContaining(["nimbus-happy-path", "ambiguous-close-date", "orbit-crm-timeout", "solo-healthy-crm"]));
    expect(new Set(ids).size).toBe(4);
  });

  it("keeps ambiguous close-date review-only without an invented executable date", () => {
    const scenario = demoScenarios.find((item) => item.scenarioId === "ambiguous-close-date")!;
    expect(scenario.defaultEditableTranscript).toContain("The commercial review went well. Procurement expects to decide soon, and we may be able to close this month, but legal has not confirmed its timeline.");
    expect(scenario.expectedDemoBehavior.finalStatus).toBe("clarification_required");
    expect(scenario.expectedDemoBehavior.writebackExpectation).toMatch(/no invented executable CloseDate/i);
  });

  it("defines Solo as a no-op healthy CRM scenario", () => {
    const scenario = demoScenarios.find((item) => item.scenarioId === "solo-healthy-crm")!;
    expect(scenario.expectedDemoBehavior.finalStatus).toBe("no_action_required");
    expect(scenario.expectedDemoBehavior.recommendationHints).toHaveLength(0);
    expect(scenario.failurePolicy.mode).toBe("none");
  });
});
