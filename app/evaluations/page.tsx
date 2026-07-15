import { AppShell, PageHeader } from "@/app/components/workflow-ui";
import { buildPublicEvaluationReport, formatPercentMetric } from "@/lib/evals/public-report";

export default async function EvaluationsPage() {
  const report = await buildPublicEvaluationReport();
  const metrics = [
    ["Golden fixtures", String(report.metrics.goldenFixtures)],
    ["Evidence coverage", formatPercentMetric(report.metrics.evidenceCoverage)],
    ["Invalid recommendation rate", formatPercentMetric(report.metrics.invalidRecommendationRate)],
    ["False-positive recommendation rate", formatPercentMetric(report.metrics.falsePositiveRecommendationRate)],
    ["Approval-policy correctness", formatPercentMetric(report.metrics.approvalPolicyCorrectness)],
    ["Audit coverage", formatPercentMetric(report.metrics.auditCoverage)],
    ["Write-back safety", formatPercentMetric(report.metrics.writebackSafety)],
  ];
  return <AppShell><PageHeader eyebrow="Evaluations" title="Regression-suite evidence" description="Measured outcomes from the CRM Hygiene regression harness." />
    <section className="panel wide" data-testid="evaluation-disclaimer"><h2>{report.label}</h2><p>These numbers come from {report.fixtureCount} curated test fixtures and are intended to prove regression behavior. They are not production metrics.</p></section>
    <section className="panel wide" data-testid="evaluation-metrics"><h2>Measured fixture results</h2><dl className="key-grid">{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
  </AppShell>;
}
