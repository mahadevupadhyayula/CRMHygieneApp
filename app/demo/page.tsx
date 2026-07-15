import { demoScenarios } from "@/lib/demo";
import { AppShell, PageHeader } from "@/app/components/workflow-ui";
import { DemoClient } from "./demo-client";

export default function DemoPage() {
  const scenarios = demoScenarios.map((scenario) => ({
    scenarioId: scenario.scenarioId,
    name: scenario.name,
    description: scenario.description,
    disclaimerText: scenario.disclaimerText,
    defaultEditableTranscript: scenario.defaultEditableTranscript,
  }));

  return (
    <AppShell>
      <PageHeader eyebrow="Live Demo" title="Backend-backed Hygiene Analysis Demo" description="Inspect deterministic extraction, validation, scoring, recommendations, approval state, writeback safety, and measured workflow telemetry from backend APIs." />
      <DemoClient scenarios={scenarios} />
    </AppShell>
  );
}
