"use client";

import React from "react";
import type { ApprovalAuditEvent } from "../../../lib/agents/approval";
import type { WritebackAttempt } from "../../../lib/agents/writeback";

export function ExecutionTimeline({ attempts, auditEvents }: { attempts: WritebackAttempt[]; auditEvents: ApprovalAuditEvent[] }) {
  const failureEvents = auditEvents.filter((event) => event.action === "fail" || event.metadata?.errorCode);
  return <section className="panel wide" data-testid="execution-timeline" aria-label="audit timeline"><h2>Execution timeline</h2>{attempts.length === 0 && failureEvents.length === 0 ? <p className="inline-empty">No writeback attempts yet.</p> : null}<ol>{attempts.map((attempt) => <li key={attempt.id} data-testid={`timeline-attempt-${attempt.recommendationId}`}><strong>{attempt.status}</strong> recommendation {attempt.recommendationId}; retry count {attempt.retryCount}; actor {attempt.actorId} ({attempt.actorRole}); {attempt.errorCode ? `error ${attempt.errorCode}: ${attempt.errorMessage}` : attempt.message}</li>)}{failureEvents.map((event) => <li key={event.id} data-testid="failure-audit-event"><strong>Failure audit event</strong> {event.recommendationId}: {event.message} {event.metadata?.errorCode ? `(${String(event.metadata.errorCode)})` : ""}</li>)}</ol></section>;
}
