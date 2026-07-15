"use client";

import React from "react";
import { useMemo, useState } from "react";

import { ApprovalInboxView } from "@/app/components/workflow-ui";
import { approvalCards, type ApprovalCard, type RecommendationStatus, type RiskLevel } from "@/lib/ui-workflow-data";

export function ApprovalInboxClient() {
  const [cards, setCards] = useState<ApprovalCard[]>(approvalCards);
  const [risk, setRisk] = useState<RiskLevel | "all">("all");
  const [field, setField] = useState("all");
  const visibleCards = useMemo(() => cards.filter((card) => card.status === "pending" || card.status === "failed"), [cards]);

  function handleAction(id: string, action: RecommendationStatus, value?: string) {
    setCards((current) => current.map((card) => card.id === id ? { ...card, status: action, suggestedValue: action === "edited" && value ? value : card.suggestedValue } : card));
  }

  return (
    <div onChange={(event) => {
      const target = event.target as unknown as HTMLSelectElement;
      if (target?.id === "approval-risk-filter") setRisk(target.value as RiskLevel | "all");
      if (target?.id === "approval-field-filter") setField(target.value);
    }}>
      <ApprovalInboxView cards={visibleCards} selectedRisk={risk} selectedField={field} onAction={handleAction} />
      <section className="panel live-audit" aria-label="Live audit updates"><h2>Latest inbox activity</h2><p>Founder-demo approval actions are reflected in component state; backend-backed approval state is demonstrated on Live Demo.</p></section>
    </div>
  );
}
