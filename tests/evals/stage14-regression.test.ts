import { describe, expect, it } from "vitest";

import { dealEvalFixtures, staleEvidenceFixture } from "./fixtures";
import { metricsReport, runDealEval, runEvalSuite } from "./harness";

describe("Stage 14 evaluation harness and regression suite", () => {
  it("contains at least 50 deal-context fixtures across required categories", () => {
    expect(dealEvalFixtures).toHaveLength(53);
    expect(dealEvalFixtures.filter((fixture) => fixture.category === "clean")).toHaveLength(10);
    expect(dealEvalFixtures.filter((fixture) => fixture.category === "missing_field")).toHaveLength(10);
    expect(dealEvalFixtures.filter((fixture) => fixture.category === "stale_field")).toHaveLength(10);
    expect(dealEvalFixtures.filter((fixture) => fixture.category === "contradiction")).toHaveLength(10);
    expect(dealEvalFixtures.filter((fixture) => fixture.category === "high_risk_forecast")).toHaveLength(10);
  });

  it("passes golden end-to-end extraction, validation, comparison, scoring, recommendation, and safety evals", async () => {
    const suite = await runEvalSuite(dealEvalFixtures);
    const report = metricsReport(suite.metrics);

    expect(report).toContain("extraction_precision=");
    expect(suite.metrics.extractionPrecision).toBe(1);
    expect(suite.metrics.evidenceCoverage).toBe(1);
    expect(suite.metrics.invalidRecommendationRate).toBe(0);
    expect(suite.metrics.missingRecommendationRate).toBe(0);
    expect(suite.metrics.falsePositiveRecommendationRate).toBe(0);
    expect(suite.metrics.approvalPolicyCorrectness).toBe(1);
    expect(suite.metrics.auditCoverage).toBe(1);
    expect(suite.metrics.writebackSafety).toBe(1);

    for (const result of suite.results) {
      expect(result.facts.length, `${result.fixture.id} fact count`).toBeGreaterThanOrEqual(result.fixture.expected.minFacts);
      expect(result.metrics.evidenceCoverage, `${result.fixture.id} evidence coverage`).toBeGreaterThanOrEqual(result.fixture.expected.minEvidenceCoverage);
      expect(result.safety.highRiskAutoExecutableCount, `${result.fixture.id} high-risk auto executable`).toBe(result.fixture.expected.maxAutoExecutableHighRisk);
      expect(result.safety.ambiguousUpdateCount, `${result.fixture.id} ambiguous update count`).toBe(0);
      expect(result.safety.customerFacingAutoSendCount, `${result.fixture.id} customer auto send count`).toBe(0);
      expect(result.metrics.auditCoverage, `${result.fixture.id} audit coverage`).toBe(1);
    }
  });

  it("proves every recommendation is backed by available evidence", async () => {
    const suite = await runEvalSuite(dealEvalFixtures);
    const recommendations = suite.results.flatMap((result) => result.recommendations);

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.every((recommendation) => recommendation.evidence.length > 0)).toBe(true);
    expect(recommendations.every((recommendation) => recommendation.evidence.every((evidence) => evidence.evidenceText.trim().length > 0 && evidence.sourceId && evidence.factId))).toBe(true);
  });

  it("blocks unsafe recommendation and writeback paths", async () => {
    const suite = await runEvalSuite(dealEvalFixtures);
    const recommendations = suite.results.flatMap((result) => result.recommendations);

    expect(recommendations.filter((recommendation) => recommendation.riskLevel === "high").every((recommendation) => recommendation.approvalPolicy === "strict_approval" || recommendation.approvalPolicy === "blocked")).toBe(true);
    expect(recommendations.filter((recommendation) => recommendation.riskLevel === "high").every((recommendation) => recommendation.status !== "ready")).toBe(true);
    expect(suite.results.every((result) => result.safety.aeHighRiskWritebackBlocked)).toBe(true);
    expect(suite.results.every((result) => result.safety.customerFacingAutoSendCount === 0)).toBe(true);
  });

  it("excludes unauthorized evidence and prevents ambiguous-source updates", async () => {
    const unauthorized = await runDealEval(dealEvalFixtures.find((fixture) => fixture.id === "eval-safety-unauthorized")!);
    const ambiguous = await runDealEval(dealEvalFixtures.find((fixture) => fixture.id === "eval-safety-ambiguous")!);

    expect(unauthorized.validationResults.every((result) => result.evidenceStatus === "unauthorized")).toBe(true);
    expect(unauthorized.recommendations).toHaveLength(0);
    expect(unauthorized.safety.unauthorizedEvidenceCount).toBe(0);
    expect(ambiguous.recommendations).toHaveLength(0);
    expect(ambiguous.safety.ambiguousUpdateCount).toBe(0);
  });

  it("keeps stale evidence out of automatic recommendations", async () => {
    const stale = await runDealEval(staleEvidenceFixture);

    expect(stale.facts.length).toBeGreaterThanOrEqual(1);
    expect(stale.validationResults.every((result) => result.evidenceStatus === "stale")).toBe(true);
    expect(stale.recommendations).toHaveLength(0);
  });
});
