"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";

import { ApprovalInboxView } from "@/app/components/workflow-ui";
import { approvalCards, auditEntries, type ApprovalCard, type AuditEntry, type RecommendationStatus, type RiskLevel } from "@/lib/ui-workflow-data";

const CARD_KEY = "crm-hygiene-stage12-approval-cards";
const AUDIT_KEY = "crm-hygiene-stage12-audit";

export function ApprovalInboxClient() {
  const [cards, setCards] = useState<ApprovalCard[]>(approvalCards);
  const [risk, setRisk] = useState<RiskLevel | "all">("all");
  const [field, setField] = useState("all");

  useEffect(() => {
    const savedCards = window.localStorage.getItem(CARD_KEY);
    if (savedCards) setCards(JSON.parse(savedCards));
    if (!window.localStorage.getItem(AUDIT_KEY)) window.localStorage.setItem(AUDIT_KEY, JSON.stringify(auditEntries));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CARD_KEY, JSON.stringify(cards));
  }, [cards]);

  const visibleCards = useMemo(() => cards.filter((card) => card.status === "pending" || card.status === "failed"), [cards]);

  function handleAction(id: string, action: RecommendationStatus, value?: string) {
    let auditEntry: AuditEntry | undefined;
    setCards((current) => current.map((card) => {
      if (card.id !== id) return card;
      const nextCard = { ...card, status: action, suggestedValue: action === "edited" && value ? value : card.suggestedValue };
      auditEntry = {
        id: `audit-${id}-${action}-${Date.now()}`,
        dealId: card.dealId,
        dealName: card.dealName,
        actor: "Mira Manager",
        action,
        message: `${action} ${card.field} recommendation${value ? `: ${value}` : ""}.`,
        createdAt: new Date().toISOString(),
      };
      return nextCard;
    }));
    if (auditEntry) {
      const saved = window.localStorage.getItem(AUDIT_KEY);
      const entries: AuditEntry[] = saved ? JSON.parse(saved) : auditEntries;
      window.localStorage.setItem(AUDIT_KEY, JSON.stringify([auditEntry, ...entries]));
    }
  }

  return (
    <div
      onChange={(event) => {
        const target = event.target as unknown as HTMLSelectElement;
        if (target?.id === "approval-risk-filter") setRisk(target.value as RiskLevel | "all");
        if (target?.id === "approval-field-filter") setField(target.value);
      }}
    >
      <ApprovalInboxView cards={visibleCards} selectedRisk={risk} selectedField={field} onAction={handleAction} />
      <section className="panel live-audit" aria-label="Live audit updates">
        <h2>Latest inbox activity</h2>
        <p>Actions are written to local audit state for this Stage 12 UI.</p>
      </section>
    </div>
  );
}
