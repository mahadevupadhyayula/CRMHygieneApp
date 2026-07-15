"use client";

import React, { useMemo, useRef, useState } from "react";
import type { ApprovalActor, ApprovalRecommendation } from "../../../lib/agents/approval";
import type { SimulatedCrmSnapshot, WritebackAttempt } from "../../../lib/agents/writeback";
import type { DemoSession } from "../../../lib/demo/types";
import { CrmDiff } from "./crm-diff";
import { ExecutionTimeline } from "./execution-timeline";

type ApiResult = { recommendationId: string; attempt: WritebackAttempt; retryCount: number; errorCode?: string; errorMessage?: string; crmChanged: boolean };
type Row = { recommendationId: string; field: string; status: string; retryCount: number; errorCode?: string; errorMessage?: string; approvalRequirement?: string; crmChanged: boolean };

const actor: ApprovalActor = { id: "mgr-1", name: "Morgan Manager", role: "manager" };
function value(value: unknown) { return value === null || value === undefined || value === "" ? "—" : String(value); }
function field(rec: ApprovalRecommendation) { return rec.crmField ?? rec.actionType; }
function isApproved(rec: ApprovalRecommendation) { return rec.status === "approved" || rec.status === "edited"; }
function oppVersion(snapshot: SimulatedCrmSnapshot) { return Object.values(snapshot.opportunities)[0]?.version ?? 0; }

async function postWriteback(body: unknown) {
  const response = await fetch("/api/demo/writeback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw Object.assign(new Error(payload.error?.message ?? "Writeback failed"), { code: payload.error?.code, payload });
  return payload.data as { session: DemoSession; results: ApiResult[] };
}

export function WritebackPanel({ session, onSessionUpdate }: { session: DemoSession; onSessionUpdate: (session: DemoSession) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [before, setBefore] = useState<SimulatedCrmSnapshot | undefined>();
  const [after, setAfter] = useState<SimulatedCrmSnapshot | undefined>();
  const [error, setError] = useState<{ code?: string; message: string }>();
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef(`demo-writeback-${session.sessionId}`);
  const eligible = useMemo(() => session.recommendations.filter(isApproved), [session.recommendations]);
  if (eligible.length === 0) return null;

  async function apply() {
    setBusy(true); setError(undefined);
    const beforeSnapshot = session.crmSnapshot;
    setBefore(beforeSnapshot);
    try {
      const data = await postWriteback({ sessionId: session.sessionId, actor, expectedSessionVersion: session.version, expectedOpportunityVersion: oppVersion(session.crmSnapshot), idempotencyKey: idempotencyKey.current });
      const resultRows: Row[] = data.results.map((result) => ({ recommendationId: result.recommendationId, field: field(session.recommendations.find((rec) => rec.id === result.recommendationId)!), status: result.attempt.status, retryCount: result.retryCount, errorCode: result.errorCode, errorMessage: result.errorMessage, approvalRequirement: result.attempt.approvalRequirement, crmChanged: result.crmChanged }));
      const skipped = session.recommendations.filter((rec) => !isApproved(rec)).map((rec) => ({ recommendationId: rec.id, field: field(rec), status: "skipped", retryCount: 0, approvalRequirement: rec.riskLevel === "high" ? "manager_approval" : "standard_approval", crmChanged: false }));
      setRows([...resultRows, ...skipped]);
      setAfter(data.session.crmSnapshot);
      onSessionUpdate(data.session);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError({ code, message: code === "VERSION_CONFLICT" ? `${(err as Error).message} Reset or reanalyze before retrying writeback.` : (err as Error).message });
      setAfter(beforeSnapshot);
    } finally { setBusy(false); }
  }

  const unchangedFailure = rows.some((row) => row.status === "failed") && before && after && JSON.stringify(before.opportunities) === JSON.stringify(after.opportunities);
  return <>
    <section className="panel wide" data-testid="writeback-panel"><h2>Simulated CRM write-back</h2><p>Actor: {actor.name} ({actor.role}). Approval requirement and duplicate writeback handling come from the backend attempt log.</p><button data-testid="apply-approved-crm-changes" onClick={apply} disabled={busy}>{busy ? "Applying…" : "Apply Approved CRM Changes"}</button>{error ? <div className="error-box" data-testid="writeback-error"><strong>{error.code ?? "ERROR"}</strong><p>{error.message}</p></div> : null}{unchangedFailure ? <p role="status" data-testid="crm-unchanged-failure-confirmation"><strong>CRM state remained unchanged after failed writeback.</strong></p> : null}{rows.length ? <table data-testid="writeback-results"><thead><tr><th>recommendationId</th><th>field/action</th><th>status</th><th>retryCount</th><th>errorCode</th><th>errorMessage</th><th>actor</th><th>approvalRequirement</th><th>crmChanged</th></tr></thead><tbody>{rows.map((row) => <tr key={row.recommendationId}><td>{row.recommendationId}</td><td>{row.field}</td><td>{row.status}</td><td data-testid={`retry-count-${row.recommendationId}`}>{row.retryCount}</td><td data-testid={`error-code-${row.recommendationId}`}>{row.errorCode ?? "—"}</td><td>{row.errorMessage ?? "—"}</td><td>{actor.name}</td><td>{row.approvalRequirement ?? "—"}</td><td>{row.crmChanged ? "yes" : "no"}</td></tr>)}</tbody></table> : null}</section>
    {before && after ? <CrmDiff before={before} after={after} /> : null}
    <ExecutionTimeline attempts={session.writebackAttempts ?? []} auditEvents={session.auditEvents ?? []} />
  </>;
}
