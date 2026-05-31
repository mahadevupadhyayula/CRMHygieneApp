export type RiskLevel = "low" | "medium" | "high";
export type ScoreBand = "excellent" | "good" | "fair" | "poor";
export type RecommendationStatus = "pending" | "approved" | "edited" | "rejected" | "snoozed" | "failed";

export type EvidenceItem = {
  id: string;
  sourceId: string;
  sourceType: "email" | "call" | "note" | "crm";
  title: string;
  author: string;
  capturedAt: string;
  available: boolean;
  restricted?: boolean;
  text?: string;
};

export type ExtractedFact = {
  id: string;
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
  evidenceId?: string;
};

export type FieldConflict = {
  field: string;
  crmValue: string;
  evidenceValue: string;
  severity: RiskLevel;
};

export type SuggestedUpdate = {
  field: string;
  currentValue: string;
  suggestedValue: string;
  reason: string;
};

export type ApprovalCard = {
  id: string;
  dealId: string;
  dealName: string;
  field: string;
  risk: RiskLevel;
  status: RecommendationStatus;
  currentValue: string;
  suggestedValue: string;
  rationale: string;
  evidenceIds: string[];
  failedWriteback?: boolean;
};

export type AuditEntry = {
  id: string;
  dealId: string;
  dealName: string;
  actor: string;
  action: string;
  message: string;
  createdAt: string;
};

export type Deal = {
  id: string;
  name: string;
  owner: string;
  stage: string;
  forecast: string;
  closeDate: string;
  hygieneScore: number;
  risk: RiskLevel;
  mainIssue: string;
  suggestedAction: string;
  lastAnalyzedAt: string;
  scoreBreakdown: Array<{ label: string; score: number; weight: string }>;
  crmSnapshot: Record<string, string>;
  extractedFacts: ExtractedFact[];
  evidence: EvidenceItem[];
  conflicts: FieldConflict[];
  risks: string[];
  suggestedUpdates: SuggestedUpdate[];
  suggestedFollowUps: string[];
};

export const workflowDeals: Deal[] = [
  {
    id: "opp-nimbus",
    name: "Nimbus Health Expansion",
    owner: "Avery AE",
    stage: "Proposal/Price Quote",
    forecast: "Pipeline",
    closeDate: "2026-06-28",
    hygieneScore: 42,
    risk: "high",
    mainIssue: "Close date and next step conflict with buyer email.",
    suggestedAction: "Move close date to July 15 and schedule procurement follow-up.",
    lastAnalyzedAt: "2026-05-31T08:30:00.000Z",
    scoreBreakdown: [
      { label: "Completeness", score: 55, weight: "30%" },
      { label: "Freshness", score: 35, weight: "25%" },
      { label: "Evidence alignment", score: 28, weight: "30%" },
      { label: "Forecast risk", score: 45, weight: "15%" },
    ],
    crmSnapshot: {
      StageName: "Proposal/Price Quote",
      ForecastCategoryName: "Pipeline",
      CloseDate: "2026-06-28",
      NextStep: "Send final quote",
      Amount: "$145,000",
    },
    extractedFacts: [
      { id: "fact-nimbus-close", label: "Buyer requested legal review", value: "Legal review starts June 24 and decision expected July 15.", confidence: "high", evidenceId: "ev-nimbus-email" },
      { id: "fact-nimbus-procurement", label: "Procurement owner", value: "Priya Shah owns procurement approval.", confidence: "medium", evidenceId: "ev-nimbus-call" },
    ],
    evidence: [
      {
        id: "ev-nimbus-email",
        sourceId: "email-771",
        sourceType: "email",
        title: "Buyer email: legal timing",
        author: "Dana Buyer",
        capturedAt: "2026-05-30T16:22:00.000Z",
        available: true,
        text: "We need legal to start June 24. A realistic decision date is July 15 after procurement signs off. Please send the updated mutual action plan before our steering committee meeting. This long evidence excerpt intentionally continues so the UI can prove that lengthy source text wraps cleanly without pushing approval controls off screen on narrow layouts.",
      },
      {
        id: "ev-nimbus-call",
        sourceId: "call-118",
        sourceType: "call",
        title: "Discovery call transcript",
        author: "Gong ingest",
        capturedAt: "2026-05-29T19:10:00.000Z",
        available: true,
        text: "Priya Shah will validate procurement steps and confirm the purchase order path.",
      },
      {
        id: "ev-nimbus-restricted",
        sourceId: "email-779",
        sourceType: "email",
        title: "Executive thread",
        author: "Restricted mailbox",
        capturedAt: "2026-05-30T20:45:00.000Z",
        available: false,
        restricted: true,
      },
    ],
    conflicts: [
      { field: "CloseDate", crmValue: "2026-06-28", evidenceValue: "2026-07-15", severity: "high" },
      { field: "NextStep", crmValue: "Send final quote", evidenceValue: "Send mutual action plan", severity: "medium" },
    ],
    risks: ["Forecast timing likely overstated", "Procurement owner missing from CRM", "Legal review not represented in stage notes"],
    suggestedUpdates: [
      { field: "CloseDate", currentValue: "2026-06-28", suggestedValue: "2026-07-15", reason: "Buyer email states the decision date moved after legal review." },
      { field: "NextStep", currentValue: "Send final quote", suggestedValue: "Send updated MAP to Priya Shah", reason: "Follow-up is grounded in call evidence." },
    ],
    suggestedFollowUps: ["Ask Priya Shah to confirm PO process.", "Schedule July 1 legal checkpoint."],
  },
  {
    id: "opp-orbit",
    name: "Orbit Logistics Renewal",
    owner: "Mira Manager",
    stage: "Negotiation/Review",
    forecast: "Commit",
    closeDate: "2026-06-14",
    hygieneScore: 71,
    risk: "medium",
    mainIssue: "Security review is missing a dated next step.",
    suggestedAction: "Create a follow-up task for security questionnaire owner.",
    lastAnalyzedAt: "2026-05-31T07:55:00.000Z",
    scoreBreakdown: [
      { label: "Completeness", score: 75, weight: "30%" },
      { label: "Freshness", score: 64, weight: "25%" },
      { label: "Evidence alignment", score: 72, weight: "30%" },
      { label: "Forecast risk", score: 78, weight: "15%" },
    ],
    crmSnapshot: { StageName: "Negotiation/Review", ForecastCategoryName: "Commit", CloseDate: "2026-06-14", NextStep: "Await signature", Amount: "$88,500" },
    extractedFacts: [{ id: "fact-orbit-security", label: "Security questionnaire", value: "Questionnaire due June 5.", confidence: "high", evidenceId: "ev-orbit-note" }],
    evidence: [{ id: "ev-orbit-note", sourceId: "note-204", sourceType: "note", title: "SE handoff note", author: "Sam SE", capturedAt: "2026-05-28T13:00:00.000Z", available: true, text: "Security questionnaire due June 5; owner is Jamie Chen." }],
    conflicts: [{ field: "NextStep", crmValue: "Await signature", evidenceValue: "Complete security questionnaire", severity: "medium" }],
    risks: ["Open security dependency"],
    suggestedUpdates: [{ field: "NextStep", currentValue: "Await signature", suggestedValue: "Jamie Chen to complete security questionnaire by June 5", reason: "Recent SE note names the dependency and owner." }],
    suggestedFollowUps: ["Confirm security questionnaire submission."],
  },
  {
    id: "opp-solo",
    name: "Solo Apps Pilot",
    owner: "Avery AE",
    stage: "Qualification",
    forecast: "Omitted",
    closeDate: "2026-07-31",
    hygieneScore: 91,
    risk: "low",
    mainIssue: "No recommendations; CRM is aligned with available evidence.",
    suggestedAction: "Monitor next buyer meeting.",
    lastAnalyzedAt: "2026-05-31T06:40:00.000Z",
    scoreBreakdown: [
      { label: "Completeness", score: 96, weight: "30%" },
      { label: "Freshness", score: 90, weight: "25%" },
      { label: "Evidence alignment", score: 92, weight: "30%" },
      { label: "Forecast risk", score: 84, weight: "15%" },
    ],
    crmSnapshot: { StageName: "Qualification", ForecastCategoryName: "Omitted", CloseDate: "2026-07-31", NextStep: "Run discovery", Amount: "$22,000" },
    extractedFacts: [],
    evidence: [],
    conflicts: [],
    risks: [],
    suggestedUpdates: [],
    suggestedFollowUps: [],
  },
];

export const approvalCards: ApprovalCard[] = [
  {
    id: "rec-nimbus-close",
    dealId: "opp-nimbus",
    dealName: "Nimbus Health Expansion",
    field: "CloseDate",
    risk: "high",
    status: "pending",
    currentValue: "2026-06-28",
    suggestedValue: "2026-07-15",
    rationale: "Buyer email indicates legal review pushes the decision date into July.",
    evidenceIds: ["ev-nimbus-email"],
  },
  {
    id: "rec-nimbus-next",
    dealId: "opp-nimbus",
    dealName: "Nimbus Health Expansion",
    field: "NextStep",
    risk: "medium",
    status: "pending",
    currentValue: "Send final quote",
    suggestedValue: "Send updated MAP to Priya Shah",
    rationale: "Latest call names Priya as procurement owner.",
    evidenceIds: ["ev-nimbus-call"],
  },
  {
    id: "rec-orbit-security",
    dealId: "opp-orbit",
    dealName: "Orbit Logistics Renewal",
    field: "Task",
    risk: "medium",
    status: "pending",
    currentValue: "No task",
    suggestedValue: "Follow up with Jamie Chen on security questionnaire",
    rationale: "Creates a dated follow-up for the open security dependency.",
    evidenceIds: ["ev-orbit-note"],
  },
  {
    id: "rec-orbit-forecast-failed",
    dealId: "opp-orbit",
    dealName: "Orbit Logistics Renewal",
    field: "ForecastCategoryName",
    risk: "high",
    status: "failed",
    currentValue: "Best Case",
    suggestedValue: "Commit",
    rationale: "Simulated writeback failed and needs RevOps review.",
    evidenceIds: ["ev-orbit-note"],
    failedWriteback: true,
  },
];

export const auditEntries: AuditEntry[] = [
  {
    id: "audit-seed-1",
    dealId: "opp-orbit",
    dealName: "Orbit Logistics Renewal",
    actor: "Writeback simulator",
    action: "failed",
    message: "Failed writeback for ForecastCategoryName: simulated CRM validation error.",
    createdAt: "2026-05-31T08:05:00.000Z",
  },
  {
    id: "audit-seed-2",
    dealId: "opp-nimbus",
    dealName: "Nimbus Health Expansion",
    actor: "Hygiene Agent",
    action: "recommended",
    message: "Created two recommendations from buyer email and call evidence.",
    createdAt: "2026-05-31T08:30:00.000Z",
  },
];

export function scoreBand(score: number): ScoreBand {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

export function formatDate(input: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(input));
}

export function formatDateTime(input: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(input));
}

export function findDeal(id: string): Deal | undefined {
  return workflowDeals.find((deal) => deal.id === id);
}

export function evidenceById(id: string): EvidenceItem | undefined {
  return workflowDeals.flatMap((deal) => deal.evidence).find((item) => item.id === id);
}
