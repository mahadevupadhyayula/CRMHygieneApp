import { describe, expect, it } from "vitest";

import { validateFacts, validationResultSchema, type ValidationFact } from "../../lib/agents/validation";

const referenceDate = new Date("2026-05-30T12:00:00.000Z");

function fact(overrides: Partial<ValidationFact> = {}): ValidationFact {
  return {
    factId: "fact-1",
    factType: "next_step",
    rawValue: "send proposal",
    normalizedValue: "send proposal",
    evidenceText: "Next step: send proposal.",
    sourceId: "source-1",
    sourceTimestamp: new Date("2026-05-29T12:00:00.000Z"),
    confidence: 0.86,
    confidenceBand: "high",
    suggestedCrmFieldMapping: {
      objectName: "Opportunity",
      fieldName: "NextStep",
      fieldLabel: "Next Step",
      confidence: 1,
    },
    recommendationEligible: true,
    sourceMatchStatus: "matched",
    ...overrides,
  };
}

function validateOne(input: Partial<ValidationFact>, sources = [{ id: input.sourceId ?? "source-1", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } }]) {
  const [result] = validateFacts({ facts: [fact(input)], sources, options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 } });
  return result;
}

function reasonText(reasons: string[]): string {
  return reasons.join(" ");
}

describe("Validation Agent", () => {
  it("allows high-confidence recent evidence", () => {
    const result = validateOne({});

    expect(validationResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({ status: "valid", evidenceStatus: "present", actionRisk: "low", confidence: 0.86 });
    expect(reasonText(result.reasons)).toContain("VALID");
  });

  it("rejects fact without evidence", () => {
    const result = validateOne({ evidenceText: "" });

    expect(result.status).toBe("rejected");
    expect(result.evidenceStatus).toBe("missing");
    expect(reasonText(result.reasons)).toContain("EVIDENCE_MISSING");
  });

  it("rejects unauthorized source", () => {
    const result = validateOne({}, [{ id: "source-1", visibility: "TEAM", metadata: { authorization: { authorized: false, scope: "owner-only" } } }]);

    expect(result.status).toBe("rejected");
    expect(result.evidenceStatus).toBe("unauthorized");
    expect(reasonText(result.reasons)).toContain("SOURCE_UNAUTHORIZED");
  });

  it("rejects private source", () => {
    const result = validateOne({}, [{ id: "source-1", visibility: "PRIVATE", metadata: { authorization: { authorized: true, scope: "owner-only" } } }]);

    expect(result.status).toBe("rejected");
    expect(result.evidenceStatus).toBe("unauthorized");
  });

  it("flags stale source", () => {
    const result = validateOne({ sourceTimestamp: new Date("2026-04-01T12:00:00.000Z") });

    expect(result.status).toBe("needs_review");
    expect(result.evidenceStatus).toBe("stale");
    expect(reasonText(result.reasons)).toContain("STALE_SOURCE");
  });

  it("flags role-only stakeholder as incomplete", () => {
    const result = validateOne({ factType: "decision_maker", rawValue: "CFO", normalizedValue: "cfo", confidence: 0.78, confidenceBand: "high" });

    expect(result.status).toBe("needs_review");
    expect(result.actionRisk).toBe("medium");
    expect(reasonText(result.reasons)).toContain("INCOMPLETE_STAKEHOLDER");
  });

  it("flags ambiguous date", () => {
    const result = validateOne({ factType: "next_step_due_date", rawValue: "end of quarter", normalizedValue: "end of quarter", confidence: 0.77, confidenceBand: "high" });

    expect(result.status).toBe("needs_review");
    expect(reasonText(result.reasons)).toContain("AMBIGUOUS_DATE");
  });

  it("detects contradiction between two facts for the same field", () => {
    const results = validateFacts({
      facts: [
        fact({ factId: "legal-pending", factType: "legal_status", rawValue: "pending", normalizedValue: "pending", sourceId: "email-source", evidenceText: "Legal is pending." }),
        fact({ factId: "legal-done", factType: "legal_status", rawValue: "done", normalizedValue: "done", sourceId: "manager-source", evidenceText: "Legal is done." }),
      ],
      sources: [
        { id: "email-source", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } },
        { id: "manager-source", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } },
      ],
      options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
    });

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.status === "needs_review")).toBe(true);
    expect(results.every((result) => result.evidenceStatus === "contradictory")).toBe(true);
    expect(results.every((result) => reasonText(result.reasons).includes("CONTRADICTION_DETECTED"))).toBe(true);
  });

  it("separates inference from directly evidenced facts", () => {
    const result = validateOne({ metadata: { factKind: "inference" } });

    expect(result.status).toBe("needs_review");
    expect(result.evidenceStatus).toBe("inference_only");
    expect(reasonText(result.reasons)).toContain("INFERENCE_ONLY");
  });

  it("assigns action risk correctly", () => {
    expect(validateOne({ factType: "next_step" }).actionRisk).toBe("low");
    expect(validateOne({ factType: "procurement_status", rawValue: "delayed", normalizedValue: "delayed" }).actionRisk).toBe("medium");
    expect(validateOne({ factType: "forecast_signal", rawValue: "not commit-ready", normalizedValue: "not commit-ready" }).actionRisk).toBe("high");
  });
});

describe("Validation Agent edge cases", () => {
  it("flags valid old evidence when newer conflicting evidence exists", () => {
    const results = validateFacts({
      facts: [
        fact({ factId: "old-forecast", factType: "forecast_signal", normalizedValue: "commit", rawValue: "commit", sourceId: "old-source", sourceTimestamp: new Date("2026-04-15T12:00:00.000Z") }),
        fact({ factId: "new-forecast", factType: "forecast_signal", normalizedValue: "not commit-ready", rawValue: "not commit-ready", sourceId: "new-source", sourceTimestamp: new Date("2026-05-29T12:00:00.000Z") }),
      ],
      sources: [
        { id: "old-source", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } },
        { id: "new-source", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } },
      ],
      options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
    });

    expect(results.find((result) => result.factId === "old-forecast")).toMatchObject({ status: "needs_review", evidenceStatus: "contradictory" });
    expect(results.find((result) => result.factId === "new-forecast")).toMatchObject({ status: "needs_review", evidenceStatus: "contradictory" });
  });

  it("handles two valid facts that conflict", () => {
    const results = validateFacts({
      facts: [
        fact({ factId: "stage-procurement", factType: "stage_signal", normalizedValue: "procurement", rawValue: "procurement" }),
        fact({ factId: "stage-demo", factType: "stage_signal", normalizedValue: "demo", rawValue: "demo", sourceId: "source-2" }),
      ],
      sources: [
        { id: "source-1", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } },
        { id: "source-2", visibility: "TEAM", metadata: { authorization: { authorized: true, scope: "team" } } },
      ],
      options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
    });

    expect(results.map((result) => result.status)).toEqual(["needs_review", "needs_review"]);
  });

  it("captures email source contradicting rep note", () => {
    const results = validateFacts({
      facts: [
        fact({ factId: "email-security", factType: "security_status", normalizedValue: "questionnaire pending", rawValue: "questionnaire pending", sourceId: "email" }),
        fact({ factId: "rep-security", factType: "security_status", normalizedValue: "reviewed", rawValue: "reviewed", sourceId: "rep-note" }),
      ],
      sources: [
        { id: "email", visibility: "TEAM", metadata: { sourceType: "EMAIL", authorization: { authorized: true, scope: "team" } } },
        { id: "rep-note", visibility: "TEAM", metadata: { sourceType: "CRM_NOTE", authorization: { authorized: true, scope: "team" } } },
      ],
      options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
    });

    expect(results.every((result) => reasonText(result.reasons).includes("CONTRADICTION_DETECTED"))).toBe(true);
  });

  it("captures manager note contradicting rep note", () => {
    const results = validateFacts({
      facts: [
        fact({ factId: "manager-legal", factType: "legal_status", normalizedValue: "pending", rawValue: "pending", sourceId: "manager-note" }),
        fact({ factId: "rep-legal", factType: "legal_status", normalizedValue: "done", rawValue: "done", sourceId: "rep-note" }),
      ],
      sources: [
        { id: "manager-note", visibility: "TEAM", metadata: { sourceType: "MANAGER_NOTE", authorization: { authorized: true, scope: "team" } } },
        { id: "rep-note", visibility: "TEAM", metadata: { sourceType: "CRM_NOTE", authorization: { authorized: true, scope: "team" } } },
      ],
      options: { referenceDate, maxFactAgeDays: 30, minimumConfidence: 0.7 },
    });

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.evidenceStatus === "contradictory")).toBe(true);
  });

  it("rejects missing source timestamp", () => {
    const result = validateOne({ sourceTimestamp: undefined });

    expect(result.status).toBe("rejected");
    expect(result.evidenceStatus).toBe("missing_timestamp");
    expect(reasonText(result.reasons)).toContain("SOURCE_TIMESTAMP_MISSING");
  });

  it("keeps low-confidence high-severity facts in review instead of treating them as valid", () => {
    const result = validateOne({ factType: "forecast_signal", rawValue: "critical forecast risk", normalizedValue: "critical forecast risk", confidence: 0.48, confidenceBand: "low", recommendationEligible: false });

    expect(result.status).toBe("needs_review");
    expect(result.actionRisk).toBe("high");
    expect(reasonText(result.reasons)).toContain("LOW_CONFIDENCE");
  });

  it("rejects high-confidence unauthorized facts", () => {
    const result = validateOne({ confidence: 0.99 }, [{ id: "source-1", visibility: "TEAM", metadata: { authorization: { authorized: false, scope: "owner-only" } } }]);

    expect(result.status).toBe("rejected");
    expect(result.confidence).toBe(0.99);
  });

  it("rejects inference without direct evidence", () => {
    const result = validateOne({ evidenceText: "", isInference: true });

    expect(result.status).toBe("rejected");
    expect(result.evidenceStatus).toBe("missing");
    expect(reasonText(result.reasons)).toContain("EVIDENCE_MISSING");
    expect(reasonText(result.reasons)).toContain("INFERENCE_ONLY");
  });
});
