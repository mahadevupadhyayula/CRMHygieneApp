import { dealEvalFixtures } from "./fixtures";
import { runEvalSuite, type EvalMetrics } from "./harness";

export const EVALUATION_DISCLAIMER = "Curated regression fixture results — not production metrics";

export type PublicEvaluationReport = {
  label: typeof EVALUATION_DISCLAIMER;
  fixtureCount: number;
  metrics: Pick<EvalMetrics, "evidenceCoverage" | "invalidRecommendationRate" | "falsePositiveRecommendationRate" | "approvalPolicyCorrectness" | "auditCoverage" | "writebackSafety"> & { goldenFixtures: number };
};

export async function buildPublicEvaluationReport(): Promise<PublicEvaluationReport> {
  const suite = await runEvalSuite(dealEvalFixtures);
  return {
    label: EVALUATION_DISCLAIMER,
    fixtureCount: dealEvalFixtures.length,
    metrics: {
      goldenFixtures: dealEvalFixtures.length,
      evidenceCoverage: suite.metrics.evidenceCoverage,
      invalidRecommendationRate: suite.metrics.invalidRecommendationRate,
      falsePositiveRecommendationRate: suite.metrics.falsePositiveRecommendationRate,
      approvalPolicyCorrectness: suite.metrics.approvalPolicyCorrectness,
      auditCoverage: suite.metrics.auditCoverage,
      writebackSafety: suite.metrics.writebackSafety,
    },
  };
}

export function formatPercentMetric(value: number): string {
  return `${Math.round(value * 100)}%`;
}
