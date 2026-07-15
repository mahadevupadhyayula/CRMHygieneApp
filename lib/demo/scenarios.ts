import type { DemoScenario, DemoScenarioId } from "./types";
import { demoScenarioSchema } from "./schemas";

const capturedAt = new Date("2026-07-01T12:00:00.000Z");
const occurredAt = new Date("2026-07-10T16:00:00.000Z");

function snapshot(opportunityId: string, fields: Record<string, { value: string | number | boolean | null; dataType: "string" | "number" | "boolean" | "date" | "picklist"; label?: string }>) {
  return { opportunities: { [opportunityId]: { id: opportunityId, fields, version: 0, sourceCapturedAt: capturedAt, updatedAt: capturedAt } }, tasks: [], riskTags: [], noteSummaries: [], ownerAssignments: {}, writebackAttempts: [], auditEvents: [] };
}

const disclaimerText = "Demo data is synthetic and stored only in an in-memory server-side session. Browser localStorage is not the source of truth for CRM, recommendation, approval, or writeback state.";

const rawScenarios: DemoScenario[] = [
  {
    scenarioId: "nimbus-happy-path",
    name: "Nimbus happy path",
    description: "Multi-signal interview demo with stale CRM fields, a questionable close date, missing buying-process details, and legal risk evidence absent from CRM.",
    disclaimerText,
    opportunity: { id: "opp-nimbus", name: "Nimbus Analytics Expansion", stage: "Proposal", forecastCategory: "Best Case", closeDate: new Date("2026-07-31T00:00:00.000Z"), ownerName: "Avery AE" },
    initialCrmSnapshot: snapshot("opp-nimbus", {
      NextStep: { value: "Send recap from May discovery call", dataType: "string", label: "Next Step" },
      NextStepDueDate__c: { value: "2026-05-22", dataType: "date" },
      CloseDate: { value: "2026-07-31", dataType: "date" },
      StageName: { value: "Proposal", dataType: "picklist" },
      ForecastCategoryName: { value: "Best Case", dataType: "picklist" },
      DecisionMaker__c: { value: null, dataType: "string" },
      ProcurementStatus__c: { value: null, dataType: "string" },
      LegalStatus__c: { value: null, dataType: "string" },
      Risk__c: { value: "none", dataType: "string" },
    }),
    initialWritebackSnapshot: snapshot("opp-nimbus", {
      NextStep: { value: "Send recap from May discovery call", dataType: "string", label: "Next Step" },
      NextStepDueDate__c: { value: "2026-05-22", dataType: "date" },
      CloseDate: { value: "2026-07-31", dataType: "date" },
      StageName: { value: "Proposal", dataType: "picklist" },
      ForecastCategoryName: { value: "Best Case", dataType: "picklist" },
      DecisionMaker__c: { value: null, dataType: "string" },
      ProcurementStatus__c: { value: null, dataType: "string" },
      LegalStatus__c: { value: null, dataType: "string" },
      Risk__c: { value: "none", dataType: "string" },
    }),
    defaultEditableTranscript: "Next step: schedule a procurement mapping call with Priya in procurement by 2026-07-17. Decision-maker: Dana CFO owns final approval. Procurement status: packet requested but not yet received. Legal status: customer legal flagged non-standard indemnity language as a high risk. Close date risk: July 31 is questionable unless legal confirms by next week.",
    sourceItemTemplate: { id: "src-nimbus-transcript", title: "Nimbus stakeholder call", body: "{{transcript}}", occurredAt, ingestedAt: occurredAt, matchStatus: "matched", metadata: { scenarioId: "nimbus-happy-path" } },
    failurePolicy: { mode: "none" },
    expectedDemoBehavior: { finalStatus: "completed", recommendationHints: ["update stale next step", "capture decision-maker", "capture procurement status", "add legal risk", "review questionable close date"], writebackExpectation: "Approved low-risk field and risk updates can be written to the simulated server-side snapshot." },
  },
  {
    scenarioId: "ambiguous-close-date",
    name: "Ambiguous close date",
    description: "Timeline evidence suggests momentum, but legal timing is unresolved so the workflow should ask for clarification rather than inventing a close date.",
    disclaimerText,
    opportunity: { id: "opp-ambiguous", name: "Aster Commercial Review", stage: "Negotiation", forecastCategory: "Best Case", closeDate: null, ownerName: "Avery AE" },
    initialCrmSnapshot: snapshot("opp-ambiguous", { CloseDate: { value: null, dataType: "date" }, LegalStatus__c: { value: null, dataType: "string" }, Risk__c: { value: "none", dataType: "string" }, StageName: { value: "Negotiation", dataType: "picklist" } }),
    initialWritebackSnapshot: snapshot("opp-ambiguous", { CloseDate: { value: null, dataType: "date" }, LegalStatus__c: { value: null, dataType: "string" }, Risk__c: { value: "none", dataType: "string" }, StageName: { value: "Negotiation", dataType: "picklist" } }),
    defaultEditableTranscript: "The commercial review went well. Procurement expects to decide soon, and we may be able to close this month, but legal has not confirmed its timeline.",
    sourceItemTemplate: { id: "src-ambiguous-transcript", title: "Ambiguous commercial review", body: "{{transcript}}", occurredAt, ingestedAt: occurredAt, matchStatus: "ambiguous", metadata: { scenarioId: "ambiguous-close-date" } },
    failurePolicy: { mode: "none" },
    expectedDemoBehavior: { finalStatus: "clarification_required", recommendationHints: ["extract timeline signal", "extract legal-risk signal", "do not create executable close-date writeback"], writebackExpectation: "Review-only or clarification-required; no invented executable CloseDate value should be written." },
  },
  {
    scenarioId: "orbit-crm-timeout",
    name: "Orbit CRM timeout",
    description: "Valid security follow-up recommendation where simulated CRM writeback times out with bounded retries and leaves CRM state unchanged.",
    disclaimerText,
    opportunity: { id: "opp-orbit", name: "Orbit Security Review", stage: "Security Review", forecastCategory: "Pipeline", closeDate: new Date("2026-08-15T00:00:00.000Z"), ownerName: "Owen AE" },
    initialCrmSnapshot: snapshot("opp-orbit", { NextStep: { value: "Wait for security questionnaire", dataType: "string" }, SecurityStatus__c: { value: "pending", dataType: "string" }, StageName: { value: "Security Review", dataType: "picklist" } }),
    initialWritebackSnapshot: snapshot("opp-orbit", { NextStep: { value: "Wait for security questionnaire", dataType: "string" }, SecurityStatus__c: { value: "pending", dataType: "string" }, StageName: { value: "Security Review", dataType: "picklist" } }),
    defaultEditableTranscript: "Security status: the buyer requested SOC 2 and pen-test follow-up. Next step: send the security evidence package and schedule CISO review by 2026-07-18.",
    sourceItemTemplate: { id: "src-orbit-transcript", title: "Orbit security call", body: "{{transcript}}", occurredAt, ingestedAt: occurredAt, matchStatus: "matched", metadata: { scenarioId: "orbit-crm-timeout" } },
    failurePolicy: { mode: "api_timeout", errorCode: "API_TIMEOUT", maxRetries: 2, targetRecommendationHint: "security follow-up" },
    expectedDemoBehavior: { finalStatus: "completed", recommendationHints: ["valid next step", "security follow-up"], writebackExpectation: "Writeback attempts fail with API_TIMEOUT after bounded retries; CRM snapshot remains unchanged." },
  },
  {
    scenarioId: "solo-healthy-crm",
    name: "Solo healthy CRM",
    description: "CRM fields already match the transcript evidence, producing no material recommendations.",
    disclaimerText,
    opportunity: { id: "opp-solo", name: "Solo Renewal", stage: "Negotiation", forecastCategory: "Commit", closeDate: new Date("2026-08-01T00:00:00.000Z"), ownerName: "Sam AE" },
    initialCrmSnapshot: snapshot("opp-solo", { NextStep: { value: "run executive close-plan review", dataType: "string" }, NextStepDueDate__c: { value: "2026-07-20", dataType: "date" }, DecisionMaker__c: { value: "Morgan CFO", dataType: "string" }, Risk__c: { value: "none", dataType: "string" }, ForecastCategoryName: { value: "Commit", dataType: "picklist" } }),
    initialWritebackSnapshot: snapshot("opp-solo", { NextStep: { value: "run executive close-plan review", dataType: "string" }, NextStepDueDate__c: { value: "2026-07-20", dataType: "date" }, DecisionMaker__c: { value: "Morgan CFO", dataType: "string" }, Risk__c: { value: "none", dataType: "string" }, ForecastCategoryName: { value: "Commit", dataType: "picklist" } }),
    defaultEditableTranscript: "Next step: run executive close-plan review by 2026-07-20. Decision-maker: Morgan CFO. Risk: none. Forecast signal: Commit remains supported by the buyer plan.",
    sourceItemTemplate: { id: "src-solo-transcript", title: "Solo healthy CRM call", body: "{{transcript}}", occurredAt, ingestedAt: occurredAt, matchStatus: "matched", metadata: { scenarioId: "solo-healthy-crm" } },
    failurePolicy: { mode: "none" },
    expectedDemoBehavior: { finalStatus: "no_action_required", recommendationHints: [], writebackExpectation: "No-op state: no material recommendations and no writeback required." },
  },
];

export const demoScenarios = rawScenarios.map((scenario) => demoScenarioSchema.parse(scenario));
export const demoScenarioById = new Map<DemoScenarioId, DemoScenario>(demoScenarios.map((scenario) => [scenario.scenarioId, scenario]));

export function getDemoScenario(scenarioId: DemoScenarioId): DemoScenario {
  const scenario = demoScenarioById.get(scenarioId);
  if (!scenario) throw new Error(`Unknown demo scenario: ${scenarioId}`);
  return scenario;
}
