import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import { ApprovalCardView, DashboardView, DealReviewView, EvidencePanel } from "../../app/components/workflow-ui";
import { approvalCards, workflowDeals, type Deal } from "../../lib/ui-workflow-data";

beforeAll(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
});

describe("Stage 12 core UI components", () => {
  it("Dashboard renders deals with required workflow columns", () => {
    const html = renderToStaticMarkup(<DashboardView deals={workflowDeals} />);

    expect(html).toContain("Nimbus Health Expansion");
    expect(html).toContain("Owner");
    expect(html).toContain("Hygiene score");
    expect(html).toContain("Last analyzed");
  });

  it("Risk badges display correctly", () => {
    const html = renderToStaticMarkup(<DashboardView deals={workflowDeals} />);

    expect(html).toContain("high risk");
    expect(html).toContain("medium risk");
    expect(html).toContain("low risk");
  });

  it("Score bands display correctly", () => {
    const html = renderToStaticMarkup(<DashboardView deals={workflowDeals} />);

    expect(html).toContain("42 · poor");
    expect(html).toContain("71 · good");
    expect(html).toContain("91 · excellent");
  });

  it("Evidence panel shows source metadata and permission restriction state", () => {
    const html = renderToStaticMarkup(<EvidencePanel evidence={workflowDeals[0].evidence} />);

    expect(html).toContain("Source email-771");
    expect(html).toContain("Buyer email: legal timing");
    expect(html).toContain("Permission-restricted source");
  });

  it("Approval card renders required fields", () => {
    const html = renderToStaticMarkup(<ApprovalCardView card={approvalCards[0]} />);

    expect(html).toContain("Nimbus Health Expansion");
    expect(html).toContain("CloseDate");
    expect(html).toContain("2026-06-28");
    expect(html).toContain("2026-07-15");
  });

  it("Empty states render for no deals, no recommendations, and no evidence", () => {
    const noDeals = renderToStaticMarkup(<DashboardView deals={[]} />);
    const noEvidence = renderToStaticMarkup(<EvidencePanel evidence={[]} />);
    const dealWithNoRecommendations: Deal = workflowDeals[2];
    const review = renderToStaticMarkup(<DealReviewView deal={dealWithNoRecommendations} />);

    expect(noDeals).toContain("No deals to review");
    expect(noEvidence).toContain("No evidence available");
    expect(review).toContain("No recommended CRM updates");
  });
});
