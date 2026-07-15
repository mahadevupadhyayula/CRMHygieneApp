"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ApprovalRecommendation } from "../../lib/agents/approval";
import type { DemoSession } from "../../lib/demo/types";
import { RecommendationCard } from "./components/recommendation-card";
import { WritebackPanel } from "./components/writeback-panel";
import type { RecommendationActionPayload } from "./components/recommendation-actions";

type Scenario = { scenarioId: string; name: string; description: string; disclaimerText: string; defaultEditableTranscript: string };
type WorkflowResult = {
  workflowRunId: string;
  extractedFacts: Array<{ factType: string; rawValue: string; normalizedValue: string; evidenceText: string; confidence: number; confidenceBand: string; sourceId: string }>;
  validationResults: Array<{ factId: string; status: string; reasons: string[]; confidence: number; actionRisk: string; evidenceStatus: string }>;
  fieldComparisons: Array<{ crmField: string; currentValue: string | null; extractedValue: string; issueType: string; severity: string; recommendationEligible: boolean; evidence: { evidenceText: string; confidence: number; validationStatus: string } }>;
  hygieneScore: null | { score: number; riskLevel: string; explanation: string; dimensions: Array<{ name?: string; label?: string; score: number; rationale?: string }>; evidence: Array<{ description?: string; evidenceText?: string }> };
  recommendations: Array<{ id: string; proposedAction: string; reason: string; crmField?: string; currentCrmValue: string | null; suggestedValue: string | null; confidence: number; riskLevel: string; status: string }>;
  telemetry?: { durationMs: number; factCount: number; validFactCount: number; needsReviewFactCount: number; rejectedFactCount: number; comparisonCount: number; recommendationCount: number; retryCount: number };
  finalStatus: string;
  error?: { message: string };
};

type ApiState = { session?: DemoSession; workflowResult?: WorkflowResult };
const DEFAULT_SCENARIO = "nimbus-happy-path";

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw Object.assign(new Error(payload.error?.message ?? "Demo API request failed"), { code: payload.error?.code, payload });
  return payload.data as ApiState;
}

function valueText(value: unknown) { return value === null || value === undefined || value === "" ? "—" : String(value); }
function pct(value: number) { return `${Math.round(value * 100)}%`; }

export function DemoClient({ scenarios }: { scenarios: Scenario[] }) {
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO);
  const [session, setSession] = useState<DemoSession>();
  const [transcript, setTranscript] = useState("");
  const [workflowResult, setWorkflowResult] = useState<WorkflowResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string; recoverable?: boolean }>();
  const scenario = useMemo(() => scenarios.find((item) => item.scenarioId === scenarioId) ?? scenarios[0], [scenarioId, scenarios]);

  async function createSession(nextScenarioId = scenarioId) {
    setLoading(true); setError(undefined); setWorkflowResult(undefined);
    try {
      const data = await postJson("/api/demo/sessions", { scenarioId: nextScenarioId });
      setSession(data.session); setTranscript(data.session?.transcript ?? "");
    } catch (err) { setError({ code: (err as { code?: string }).code, message: (err as Error).message }); }
    finally { setLoading(false); }
  }

  useEffect(() => { void createSession(DEFAULT_SCENARIO); }, []);

  async function runAnalysis() {
    if (!session) return;
    setLoading(true); setError(undefined);
    try {
      const data = await postJson("/api/demo/analyze", { sessionId: session.sessionId, transcript, expectedSessionVersion: session.version });
      setSession(data.session); setWorkflowResult(data.workflowResult);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError({ code, message: (err as Error).message, recoverable: code === "SESSION_NOT_FOUND" });
    } finally { setLoading(false); }
  }

  async function resetScenario() {
    setLoading(true); setError(undefined); setWorkflowResult(undefined);
    try {
      const data = await postJson("/api/demo/reset", { sessionId: session?.sessionId, scenarioId });
      setSession(data.session); setTranscript(data.session?.transcript ?? scenario.defaultEditableTranscript);
    } catch (err) { setError({ code: (err as { code?: string }).code, message: (err as Error).message }); }
    finally { setLoading(false); }
  }

  const fields = Object.values(session?.crmSnapshot.opportunities ?? {})[0]?.fields ?? {};

  return <div className="demo-grid">
    <section className="panel demo-disclaimer" data-testid="demo-disclaimer"><h2>Demo environment disclaimer</h2><p>{scenario.disclaimerText}</p><p><strong>Extraction is deterministic.</strong> CRM writeback is simulated; approval actions and writeback attempts call backend engines with server-side audit state.</p></section>
    <section className="panel" data-testid="scenario-panel"><h2>Scenario selector</h2><select data-testid="scenario-selector" value={scenarioId} onChange={(event) => { const next = event.target.value; setScenarioId(next); void createSession(next); }}>{scenarios.map((item) => <option key={item.scenarioId} value={item.scenarioId}>{item.name}</option>)}</select><p>{scenario.description}</p><button data-testid="reset-scenario" onClick={resetScenario} disabled={loading}>Reset Scenario</button></section>
    <section className="panel wide"><h2>Editable source transcript</h2><textarea data-testid="transcript-input" value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={8} /></section>
    <section className="panel"><h2>Current CRM snapshot</h2><dl className="key-grid" data-testid="crm-snapshot">{Object.entries(fields).map(([field, info]) => <div key={field}><dt>{info.label ?? field}</dt><dd>{valueText(info.value)}</dd></div>)}</dl></section>
    <section className="panel"><h2>Run analysis</h2><button data-testid="run-analysis" onClick={runAnalysis} disabled={loading || !session}>{loading ? "Analyzing…" : "Run Hygiene Analysis"}</button>{loading ? <p data-testid="loading-state">Loading backend analysis…</p> : null}{error ? <div className="error-box" data-testid="error-state"><strong>{error.code ?? "ERROR"}</strong><p>{error.message}</p>{error.recoverable ? <button onClick={() => createSession(scenarioId)}>Recreate session</button> : null}</div> : null}</section>
    {workflowResult ? <Results result={workflowResult} session={session} onSessionUpdate={(nextSession) => setSession(nextSession)} /> : <section className="panel wide" data-testid="empty-results"><h2>Analysis results</h2><p className="inline-empty">Run backend hygiene analysis to populate extracted facts, evidence, comparisons, score, recommendations, final status, and telemetry.</p></section>}
  </div>;
}

function Results({ result, session, onSessionUpdate }: { result: WorkflowResult; session?: DemoSession; onSessionUpdate: (session: DemoSession) => void }) {
  const [actionError, setActionError] = useState<string>();
  async function actOnRecommendation(id: string, payload: RecommendationActionPayload) {
    if (!session) return;
    setActionError(undefined);
    try {
      const data = await postJson(`/api/demo/recommendations/${id}`, { sessionId: session.sessionId, actor: { id: "mgr-1", name: "Morgan Manager", role: "manager" }, ...payload });
      if (data.session) onSessionUpdate(data.session);
    } catch (error) {
      const code = (error as { code?: string }).code;
      const message = code === "VERSION_CONFLICT" ? `${(error as Error).message} Refresh or re-run analysis before trying again.` : (error as Error).message;
      setActionError(message);
      throw new Error(message);
    }
  }
  return <>
    <section className="panel" data-testid="extracted-facts"><h2>Extracted facts</h2>{result.extractedFacts.map((fact, index) => <article className="mini-card" key={`${fact.factType}-${index}`}><h3>{fact.factType}</h3><p>{fact.normalizedValue}</p><span>{fact.confidenceBand} confidence ({pct(fact.confidence)})</span></article>)}</section>
    <section className="panel" data-testid="validation-statuses"><h2>Confidence and validation status</h2>{result.validationResults.map((item) => <article className="mini-card" key={item.factId}><strong>{item.status}</strong><p>Confidence {pct(item.confidence)} · evidence {item.evidenceStatus} · action risk {item.actionRisk}</p><p>{item.reasons.join("; ")}</p></article>)}</section>
    <section className="panel" data-testid="evidence-excerpts"><h2>Evidence excerpts</h2>{result.extractedFacts.map((fact, index) => <blockquote className="mini-card" key={`${fact.sourceId}-${index}`}>{fact.evidenceText}</blockquote>)}</section>
    <section className="panel" data-testid="crm-comparisons"><h2>CRM comparisons</h2>{result.fieldComparisons.length ? result.fieldComparisons.map((item) => <article className="mini-card" key={`${item.crmField}-${item.extractedValue}`}><h3>{item.crmField}</h3><p>CRM: {valueText(item.currentValue)}</p><p>Extracted: {item.extractedValue}</p><p>{item.issueType} · {item.severity} · {item.recommendationEligible ? "eligible" : "not eligible"}</p></article>) : <p className="inline-empty">No CRM differences detected.</p>}</section>
    <section className="panel" data-testid="hygiene-score"><h2>Hygiene score</h2>{result.hygieneScore ? <><p className="score-hero"><span className="badge">{result.hygieneScore.score} · {result.hygieneScore.riskLevel}</span></p><p>{result.hygieneScore.explanation}</p></> : <p>No score available.</p>}</section>
    <section className="panel" data-testid="recommendations"><h2>Recommendations</h2>{actionError ? <p role="alert" data-testid="recommendation-error">{actionError}</p> : null}{session?.recommendations.length ? session.recommendations.map((item) => <RecommendationCard key={item.id} recommendation={item} onAction={actOnRecommendation} />) : result.recommendations.length ? result.recommendations.map((item) => <article className="mini-card" key={item.id}><h3>{item.proposedAction}</h3><p>{item.reason}</p><p>{item.crmField ?? "No field"}: {valueText(item.currentCrmValue)} → {valueText(item.suggestedValue)}</p><span>{item.status} · {item.riskLevel} · {pct(item.confidence)}</span></article>) : <p className="inline-empty">No recommendations.</p>}</section>
    <section className="panel wide" data-testid="final-status"><h2>Final workflow status</h2><p><strong>{result.finalStatus}</strong></p>{result.telemetry ? <p data-testid="telemetry-summary">Telemetry: {result.telemetry.factCount} facts, {result.telemetry.comparisonCount} comparisons, {result.telemetry.recommendationCount} recommendations, {result.telemetry.durationMs}ms, {result.telemetry.retryCount} retries.</p> : null}</section>
    {session ? <WritebackPanel session={session} onSessionUpdate={onSessionUpdate} /> : null}
  </>;
}
