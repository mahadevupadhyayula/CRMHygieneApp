import { describe, expect, it } from "vitest";

import { analyzeDemoRequestSchema, createDemoSessionRequestSchema, resetDemoRequestSchema, transitionDemoRecommendationRequestSchema, writebackDemoRequestSchema } from "../../lib/demo/api-schemas";

const actor = { id: "mgr-1", name: "Morgan Manager", role: "manager" };

describe("demo API request validation", () => {
  it("accepts valid create, analyze, transition, writeback, and reset payloads", () => {
    expect(createDemoSessionRequestSchema.safeParse({ scenarioId: "nimbus-happy-path" }).success).toBe(true);
    expect(analyzeDemoRequestSchema.safeParse({ sessionId: "session-1", transcript: "Next step: call buyer.", expectedSessionVersion: 0 }).success).toBe(true);
    expect(transitionDemoRecommendationRequestSchema.safeParse({ sessionId: "session-1", action: "approve", actor, expectedVersion: 0 }).success).toBe(true);
    expect(writebackDemoRequestSchema.safeParse({ sessionId: "session-1", recommendationIds: ["rec-1"], actor, expectedSessionVersion: 1, expectedOpportunityVersion: 0, idempotencyKey: "demo-key" }).success).toBe(true);
    expect(resetDemoRequestSchema.safeParse({ sessionId: "session-1", scenarioId: "orbit-crm-timeout" }).success).toBe(true);
  });

  it("rejects unknown scenarios, missing actors, stale negative versions, and extra fields", () => {
    expect(createDemoSessionRequestSchema.safeParse({ scenarioId: "unknown" }).success).toBe(false);
    expect(analyzeDemoRequestSchema.safeParse({ sessionId: "", transcript: "" }).success).toBe(false);
    expect(transitionDemoRecommendationRequestSchema.safeParse({ sessionId: "session-1", action: "approve", expectedVersion: 0 }).success).toBe(false);
    expect(writebackDemoRequestSchema.safeParse({ sessionId: "session-1", actor, expectedSessionVersion: -1 }).success).toBe(false);
    expect(resetDemoRequestSchema.safeParse({ scenarioId: "nimbus-happy-path", localStorageState: true }).success).toBe(false);
  });
});
