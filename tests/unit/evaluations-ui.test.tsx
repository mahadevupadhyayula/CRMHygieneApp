import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import { AppShell } from "../../app/components/workflow-ui";
import Home from "../../app/page";
import EvaluationsPage from "../../app/evaluations/page";
import { DemoClient } from "../../app/demo/demo-client";
import { demoScenarios } from "../../lib/demo";

beforeAll(() => { (globalThis as typeof globalThis & { React: typeof React }).React = React; });

describe("Phase 7 evaluation and polish UI", () => {
  it("navigation contains required labels", () => {
    const html = renderToStaticMarkup(<AppShell><p>content</p></AppShell>);
    ["Home", "Live Demo", "Deal Dashboard", "Approval Inbox", "Audit Log", "Evaluations", "Settings"].forEach((label) => expect(html).toContain(label));
  });

  it("home page no longer says Stage 12", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).not.toContain("Stage 12");
  });

  it("evaluations page has disclaimer and no fake metric language", async () => {
    const html = renderToStaticMarkup(await EvaluationsPage());
    expect(html).toContain("Curated regression fixture results — not production metrics");
    expect(html).toContain("Golden fixtures");
    expect(html).toContain("Evidence coverage");
    expect(html).toContain("Invalid recommendation rate");
    expect(html).toContain("False-positive recommendation rate");
    expect(html).toContain("Approval-policy correctness");
    expect(html).toContain("Audit coverage");
    expect(html).toContain("Write-back safety");
    expect(html).not.toMatch(/token cost|model cost|revenue impact/i);
  });

  it("demo telemetry renders measured fields only and does not read localStorage", () => {
    const scenarios = demoScenarios.map(({ scenarioId, name, description, disclaimerText, defaultEditableTranscript }) => ({ scenarioId, name, description, disclaimerText, defaultEditableTranscript }));
    const html = renderToStaticMarkup(<DemoClient scenarios={scenarios} />);
    ["Workflow duration", "Extracted fact count", "Recommendation count", "Approval count", "Retry count", "Final workflow status"].forEach((label) => expect(html).toContain(label));
    expect(html).not.toMatch(/token cost|model cost|revenue impact/i);
  });
});
