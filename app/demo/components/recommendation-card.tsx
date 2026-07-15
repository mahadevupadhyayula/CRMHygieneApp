"use client";

import React from "react";
import type { ApprovalRecommendation } from "../../../lib/agents/approval";
import { RecommendationActions, type RecommendationActionPayload } from "./recommendation-actions";

function valueText(value: unknown) { return value === null || value === undefined || value === "" ? "—" : String(value); }

function approvalRequirement(rec: ApprovalRecommendation) {
  if (rec.riskLevel === "high") return "Manager approval required";
  if (["CloseDate", "Amount", "StageName", "ForecastCategoryName"].includes(rec.crmField ?? "")) return "Approval required";
  return "Standard approval";
}

export function RecommendationCard({ recommendation, onAction }: { recommendation: ApprovalRecommendation; onAction: (id: string, payload: RecommendationActionPayload) => Promise<void> }) {
  return <article className="mini-card recommendation-card" data-testid={`recommendation-card-${recommendation.id}`}>
    <h3>{recommendation.crmField ?? recommendation.actionType}</h3>
    <p><strong>Current value:</strong> <span data-testid={`current-value-${recommendation.id}`}>{valueText(recommendation.currentValue)}</span></p>
    <p><strong>Suggested value:</strong> <span data-testid={`suggested-value-${recommendation.id}`}>{valueText(recommendation.suggestedValue)}</span></p>
    <p><strong>Rationale:</strong> {recommendation.actionType}</p>
    <p><strong>Evidence:</strong></p>
    <ul>{recommendation.evidence.map((item) => <li key={`${item.sourceId}-${item.factId ?? "fact"}`}>{item.evidenceText ?? item.sourceId}</li>)}</ul>
    <p><strong>Risk level:</strong> {recommendation.riskLevel}</p>
    <p><strong>Approval requirement:</strong> {approvalRequirement(recommendation)}</p>
    <p><strong>Current status:</strong> <span data-testid={`status-${recommendation.id}`}>{recommendation.status}</span></p>
    <p><strong>Version:</strong> <span data-testid={`version-${recommendation.id}`}>{recommendation.version}</span></p>
    <RecommendationActions recommendation={recommendation} onAction={(payload) => onAction(recommendation.id, payload)} />
  </article>;
}
