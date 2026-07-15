import { describe, expect, it } from "vitest";

import { runHygieneWorkflow } from "../../lib/workflows";

const opportunity = { id: "opp-telemetry", name: "Telemetry Deal", stage: "Proposal", forecastCategory: "Best Case", closeDate: new Date("2026-07-31T00:00:00.000Z"), ownerName: "Avery AE" };
const occurredAt = new Date("2026-07-10T16:00:00.000Z");

describe("demo workflow telemetry", () => {
  it("captures duration, fact, validation, recommendation, and retry counts", async () => {
    let tick = 0;
    const result = await runHygieneWorkflow({
      workflowRunId: "telemetry-demo-run",
      opportunity,
      crmSnapshot: [{ fieldName: "NextStep", value: "Send old recap", capturedAt: occurredAt }],
      sourceItems: [{ id: "src-1", body: "Next step: schedule procurement mapping call by 2026-07-17.", occurredAt, matchStatus: "matched", metadata: { visibility: "public" } }],
      options: { referenceDate: new Date("2026-07-15T00:00:00.000Z"), retryCount: 2, now: () => new Date(Date.UTC(2026, 6, 15, 0, 0, tick++)) },
    });

    expect(result.telemetry.durationMs).toBeGreaterThan(0);
    expect(result.telemetry.retryCount).toBe(2);
    expect(result.telemetry.factCount).toBe(result.extractedFacts.length);
    expect(result.telemetry.validFactCount + result.telemetry.needsReviewFactCount + result.telemetry.rejectedFactCount).toBe(result.validationResults.length);
    expect(result.telemetry.recommendationCount).toBe(result.recommendations.length);
  });
});
