import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import DemoPage from "../../app/demo/page";

beforeAll(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
});

describe("Phase 4 demo UI route", () => {
  it("/demo renders the disclaimer and backend-analysis shell", () => {
    const html = renderToStaticMarkup(<DemoPage />);

    expect(html).toContain("Demo environment disclaimer");
    expect(html).toContain("Extraction is deterministic");
    expect(html).toContain("CRM writeback is simulated");
    expect(html).toContain("Run Hygiene Analysis");
    expect(html).toContain("data-testid=\"scenario-selector\"");
  });
});
