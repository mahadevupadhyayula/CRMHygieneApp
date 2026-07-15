"use client";

import React from "react";
import Link from "next/link";

import { approvalCards, auditEntries, evidenceById, findDeal, formatDate, formatDateTime, scoreBand, workflowDeals, type ApprovalCard, type AuditEntry, type Deal, type EvidenceItem, type RiskLevel, type RecommendationStatus } from "@/lib/ui-workflow-data";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <Link className="brand" href="/">CRM Hygiene</Link>
        <nav>
          <Link href="/">Home</Link>
          <Link href="/demo">Live Demo</Link>
          <Link href="/dashboard">Deal Dashboard</Link>
          <Link href="/approvals">Approval Inbox</Link>
          <Link href="/audit">Audit Log</Link>
          <Link href="/evaluations">Evaluations</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action ? <div className="page-action">{action}</div> : null}
    </header>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <span className={`badge risk-${risk}`}>{risk} risk</span>;
}

export function ScoreBadge({ score }: { score: number }) {
  return <span className={`badge score-${scoreBand(score)}`}>{score} · {scoreBand(score)}</span>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="empty-state" aria-label={title}>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

export function DashboardView({ deals = workflowDeals, selectedRisk = "all" }: { deals?: Deal[]; selectedRisk?: RiskLevel | "all" }) {
  const filteredDeals = selectedRisk === "all" ? deals : deals.filter((deal) => deal.risk === selectedRisk);

  return (
    <AppShell>
      <PageHeader eyebrow="MBP workflow" title="Deal Hygiene Dashboard" description="Prioritize the opportunities that need evidence-backed CRM updates before forecast review." />
      <section className="toolbar" aria-label="Dashboard filters">
        <label htmlFor="risk-filter">Filter by risk</label>
        <select id="risk-filter" name="risk" defaultValue={selectedRisk} aria-label="Filter by risk">
          <option value="all">All risks</option>
          <option value="high">High risk</option>
          <option value="medium">Medium risk</option>
          <option value="low">Low risk</option>
        </select>
      </section>
      {filteredDeals.length === 0 ? <EmptyState title="No deals to review" description="No opportunities match the current filter. Try another risk level or rerun analysis." /> : <DealTable deals={filteredDeals} />}
    </AppShell>
  );
}

export function DealTable({ deals }: { deals: Deal[] }) {
  return (
    <div className="table-card">
      <table>
        <thead>
          <tr>
            <th>Deal</th>
            <th>Owner</th>
            <th>Stage</th>
            <th>Forecast</th>
            <th>Close date</th>
            <th>Hygiene score</th>
            <th>Risk level</th>
            <th>Main issue</th>
            <th>Suggested action</th>
            <th>Last analyzed</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => (
            <tr key={deal.id}>
              <td><Link href={`/deals/${deal.id}`}>{deal.name}</Link></td>
              <td>{deal.owner}</td>
              <td>{deal.stage}</td>
              <td>{deal.forecast}</td>
              <td>{formatDate(deal.closeDate)}</td>
              <td><ScoreBadge score={deal.hygieneScore} /></td>
              <td><RiskBadge risk={deal.risk} /></td>
              <td>{deal.mainIssue}</td>
              <td>{deal.suggestedAction}</td>
              <td>{formatDateTime(deal.lastAnalyzedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DealReviewView({ deal }: { deal?: Deal }) {
  if (!deal) {
    return (
      <AppShell>
        <EmptyState title="Deal not found" description="The requested opportunity does not exist in the sample workflow data." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader eyebrow="Deal review" title={deal.name} description="Review CRM data, extracted facts, evidence, conflicts, risks, recommendations, follow-ups, and audit history in one place." action={<RiskBadge risk={deal.risk} />} />
      <div className="review-grid">
        <Section title="CRM snapshot"><KeyValueGrid values={deal.crmSnapshot} /></Section>
        <Section title="Hygiene score breakdown">
          <div className="score-hero"><ScoreBadge score={deal.hygieneScore} /></div>
          {deal.scoreBreakdown.map((dimension) => <ProgressRow key={dimension.label} label={`${dimension.label} (${dimension.weight})`} value={dimension.score} />)}
        </Section>
        <Section title="Extracted facts">{deal.extractedFacts.length === 0 ? <InlineEmpty text="No extracted facts available." /> : deal.extractedFacts.map((fact) => <article className="mini-card" key={fact.id}><strong>{fact.label}</strong><p>{fact.value}</p><span>{fact.confidence} confidence</span></article>)}</Section>
        <Section title="Evidence panel"><EvidencePanel evidence={deal.evidence} /></Section>
        <Section title="Field conflicts">{deal.conflicts.length === 0 ? <InlineEmpty text="No field conflicts detected." /> : deal.conflicts.map((conflict) => <article className="mini-card" key={conflict.field}><RiskBadge risk={conflict.severity} /><h3>{conflict.field}</h3><p>CRM: {conflict.crmValue}</p><p>Evidence: {conflict.evidenceValue}</p></article>)}</Section>
        <Section title="Risks">{deal.risks.length === 0 ? <InlineEmpty text="No open risks." /> : <ul className="stack-list">{deal.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>}</Section>
        <Section title="Suggested updates">{deal.suggestedUpdates.length === 0 ? <InlineEmpty text="No recommended CRM updates." /> : deal.suggestedUpdates.map((update) => <article className="mini-card" key={update.field}><h3>{update.field}</h3><p><strong>Current:</strong> {update.currentValue}</p><p><strong>Suggested:</strong> {update.suggestedValue}</p><p>{update.reason}</p></article>)}</Section>
        <Section title="Suggested follow-ups">{deal.suggestedFollowUps.length === 0 ? <InlineEmpty text="No follow-ups recommended." /> : <ul className="stack-list">{deal.suggestedFollowUps.map((item) => <li key={item}>{item}</li>)}</ul>}</Section>
        <Section title="Audit history"><AuditList entries={auditEntries.filter((entry) => entry.dealId === deal.id)} /></Section>
      </div>
    </AppShell>
  );
}

export function EvidencePanel({ evidence }: { evidence: EvidenceItem[] }) {
  if (evidence.length === 0) return <InlineEmpty text="No evidence available for this deal." />;
  return (
    <div className="evidence-list">
      {evidence.map((item) => (
        <article className={`evidence-card ${item.available ? "" : "is-restricted"}`} key={item.id}>
          <div className="evidence-meta">
            <span>{item.sourceType}</span>
            <span>Source {item.sourceId}</span>
            <span>{formatDateTime(item.capturedAt)}</span>
          </div>
          <h3>{item.title}</h3>
          <p className="evidence-author">Captured from {item.author}</p>
          {item.available ? <p className="evidence-text">{item.text}</p> : <p className="evidence-text">Permission-restricted source. Metadata is visible, but source text is unavailable.</p>}
        </article>
      ))}
    </div>
  );
}

export function ApprovalInboxView({ cards = approvalCards, selectedRisk = "all", selectedField = "all", onAction }: { cards?: ApprovalCard[]; selectedRisk?: RiskLevel | "all"; selectedField?: string; onAction?: (id: string, action: RecommendationStatus, value?: string) => void }) {
  const filteredCards = cards.filter((card) => (selectedRisk === "all" || card.risk === selectedRisk) && (selectedField === "all" || card.field === selectedField));
  const fields = Array.from(new Set(cards.map((card) => card.field)));
  return (
    <AppShell>
      <PageHeader eyebrow="Human approval" title="Approval Inbox" description="Approve, edit, reject, or snooze evidence-backed recommendations before writeback." />
      <section className="toolbar" aria-label="Approval filters">
        <label htmlFor="approval-risk-filter">Risk</label>
        <select id="approval-risk-filter" defaultValue={selectedRisk} aria-label="Filter approval cards by risk"><option value="all">All risks</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        <label htmlFor="approval-field-filter">Field</label>
        <select id="approval-field-filter" defaultValue={selectedField} aria-label="Filter approval cards by field"><option value="all">All fields</option>{fields.map((field) => <option key={field} value={field}>{field}</option>)}</select>
      </section>
      {filteredCards.length === 0 ? <EmptyState title="No pending approvals" description="No approval cards match the selected risk and field filters." /> : <div className="approval-grid">{filteredCards.map((card) => <ApprovalCardView card={card} key={card.id} onAction={onAction} />)}</div>}
    </AppShell>
  );
}

export function ApprovalCardView({ card, onAction }: { card: ApprovalCard; onAction?: (id: string, action: RecommendationStatus, value?: string) => void }) {
  const evidence = card.evidenceIds.map(evidenceById).filter((item): item is EvidenceItem => Boolean(item));
  return (
    <article className={`approval-card status-${card.status}`} data-testid="approval-card">
      <div className="card-topline"><RiskBadge risk={card.risk} /><span className="status-pill">{card.status}</span>{card.failedWriteback ? <span className="status-pill failed">failed writeback</span> : null}</div>
      <h2>{card.dealName}</h2>
      <dl className="card-fields">
        <div><dt>Field</dt><dd>{card.field}</dd></div>
        <div><dt>Current</dt><dd>{card.currentValue}</dd></div>
        <div><dt>Suggested</dt><dd>{card.suggestedValue}</dd></div>
      </dl>
      <p>{card.rationale}</p>
      <EvidencePanel evidence={evidence} />
      {onAction ? <ApprovalActions card={card} onAction={onAction} /> : null}
    </article>
  );
}

function ApprovalActions({ card, onAction }: { card: ApprovalCard; onAction: (id: string, action: RecommendationStatus, value?: string) => void }) {
  return (
    <div className="approval-actions">
      <input aria-label={`Edit value for ${card.dealName}`} defaultValue={card.suggestedValue} id={`edit-${card.id}`} />
      <input aria-label={`Reject reason for ${card.dealName}`} placeholder="Reason for rejection" id={`reject-${card.id}`} />
      <button type="button" onClick={() => onAction(card.id, "approved")}>Approve</button>
      <button type="button" onClick={() => { const input = document.getElementById(`edit-${card.id}`) as HTMLInputElement | null; onAction(card.id, "edited", input?.value); }}>Edit</button>
      <button type="button" onClick={() => { const input = document.getElementById(`reject-${card.id}`) as HTMLInputElement | null; onAction(card.id, "rejected", input?.value || "Rejected from inbox"); }}>Reject</button>
      <button type="button" onClick={() => onAction(card.id, "snoozed", "Snoozed until tomorrow")}>Snooze</button>
    </div>
  );
}

export function AuditLogView({ entries = auditEntries }: { entries?: AuditEntry[] }) {
  return (
    <AppShell>
      <PageHeader eyebrow="Controls" title="Audit Log" description="Trace every recommendation, human decision, and simulated writeback outcome." />
      <AuditList entries={entries} />
    </AppShell>
  );
}

export function AuditList({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return <EmptyState title="No audit events" description="Workflow decisions will appear here after recommendations are generated or reviewed." />;
  return (
    <ol className="audit-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <span className="status-pill">{entry.action}</span>
          <strong>{entry.dealName}</strong>
          <p>{entry.message}</p>
          <small>{entry.actor} · {formatDateTime(entry.createdAt)}</small>
        </li>
      ))}
    </ol>
  );
}

export function SettingsView() {
  return (
    <AppShell>
      <PageHeader eyebrow="Workspace" title="Settings" description="Configure safe defaults for approval policy and simulated writeback. Live CRM integration remains disabled unless explicitly connected by an administrator." />
      <div className="settings-grid">
        <Section title="Approval policy"><KeyValueGrid values={{ "High-risk approvals": "Manager required", "AEs may approve": "NextStep and dated follow-ups", "Evidence required": "Yes", "Stale recommendations": "Blocked" }} /></Section>
        <Section title="Data sources"><KeyValueGrid values={{ CRM: "Sample snapshot", Email: "Mock evidence", Calls: "Mock transcripts", "Live CRM writeback": "Disabled" }} /></Section>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

function InlineEmpty({ text }: { text: string }) {
  return <p className="inline-empty">{text}</p>;
}

function KeyValueGrid({ values }: { values: Record<string, string> }) {
  return <dl className="key-grid">{Object.entries(values).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return <div className="progress-row"><span>{label}</span><meter min="0" max="100" value={value}>{value}</meter><strong>{value}</strong></div>;
}
