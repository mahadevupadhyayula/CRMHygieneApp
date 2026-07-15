"use client";

import React, { useState } from "react";
import type { ApprovalRecommendation } from "../../../lib/agents/approval";

export type RecommendationActionPayload =
  | { action: "approve"; expectedVersion: number }
  | { action: "edit"; expectedVersion: number; editedValue: string }
  | { action: "reject"; expectedVersion: number; rejectionReason: string }
  | { action: "snooze"; expectedVersion: number; snoozedUntil: string };

export function RecommendationActions({ recommendation, onAction, disabled = false }: { recommendation: ApprovalRecommendation; onAction: (payload: RecommendationActionPayload) => Promise<void>; disabled?: boolean }) {
  const [editedValue, setEditedValue] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [snoozedUntil, setSnoozedUntil] = useState("");
  const [message, setMessage] = useState<string>();
  const [pendingAction, setPendingAction] = useState<string>();

  async function submit(payload: RecommendationActionPayload) {
    setMessage(undefined);
    if (payload.action === "edit" && payload.editedValue.trim().length === 0) return setMessage("Edited value is required.");
    if (payload.action === "reject" && payload.rejectionReason.trim().length === 0) return setMessage("Rejection reason is required.");
    if (payload.action === "snooze") {
      const due = new Date(payload.snoozedUntil);
      if (!payload.snoozedUntil || Number.isNaN(due.valueOf()) || due <= new Date()) return setMessage("Choose a future snooze date.");
    }
    setPendingAction(payload.action);
    try { await onAction(payload); }
    catch (error) { setMessage((error as Error).message); }
    finally { setPendingAction(undefined); }
  }

  const blocked = disabled || Boolean(pendingAction) || ["approved", "edited", "rejected", "executed", "failed", "cancelled"].includes(recommendation.status);
  return <div className="recommendation-actions">
    <button data-testid={`approve-${recommendation.id}`} disabled={blocked} onClick={() => submit({ action: "approve", expectedVersion: recommendation.version })}>{pendingAction === "approve" ? "Approving…" : "Approve"}</button>
    <label>Edit value<input aria-label={`Edit value for ${recommendation.crmField ?? recommendation.id}`} data-testid={`edit-value-${recommendation.id}`} value={editedValue} onChange={(event) => setEditedValue(event.target.value)} /></label>
    <button data-testid={`edit-approve-${recommendation.id}`} disabled={blocked} onClick={() => submit({ action: "edit", expectedVersion: recommendation.version, editedValue })}>Edit and approve</button>
    <label>Reject reason<input aria-label={`Reject reason for ${recommendation.crmField ?? recommendation.id}`} data-testid={`reject-reason-${recommendation.id}`} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} /></label>
    <button data-testid={`reject-${recommendation.id}`} disabled={blocked} onClick={() => submit({ action: "reject", expectedVersion: recommendation.version, rejectionReason })}>Reject</button>
    <label>Snooze until<input aria-label={`Snooze date for ${recommendation.crmField ?? recommendation.id}`} data-testid={`snooze-date-${recommendation.id}`} type="datetime-local" value={snoozedUntil} onChange={(event) => setSnoozedUntil(event.target.value)} /></label>
    <button data-testid={`snooze-${recommendation.id}`} disabled={blocked} onClick={() => submit({ action: "snooze", expectedVersion: recommendation.version, snoozedUntil })}>Defer / snooze</button>
    {message ? <p role="alert" data-testid={`action-message-${recommendation.id}`}>{message}</p> : null}
  </div>;
}
