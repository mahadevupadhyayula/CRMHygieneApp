import type { z } from "zod";

import type { RecommendationCard } from "../agents/recommendation";
import type { ApprovalAuditEvent, ApprovalRecommendation } from "../agents/approval";
import type { ExtractionOpportunity, ExtractionSourceItem } from "../agents/extraction";
import type { SimulatedCrmSnapshot, WritebackAttempt } from "../agents/writeback";
import type { HygieneWorkflowResult, HygieneWorkflowFinalStatus } from "../workflows";
import type { demoScenarioSchema, demoSessionSchema, sessionStoreErrorSchema } from "./schemas";

export type DemoScenarioId = "nimbus-happy-path" | "ambiguous-close-date" | "orbit-crm-timeout" | "solo-healthy-crm";

export type DemoFailurePolicy =
  | { mode: "none" }
  | { mode: "api_timeout"; errorCode: "API_TIMEOUT"; maxRetries: number; targetRecommendationHint: string };

export type ExpectedDemoBehavior = {
  finalStatus: HygieneWorkflowFinalStatus;
  recommendationHints: string[];
  writebackExpectation: string;
};

export type DemoScenario = z.infer<typeof demoScenarioSchema>;
export type DemoSession = z.infer<typeof demoSessionSchema>;
export type SessionStoreError = z.infer<typeof sessionStoreErrorSchema>;

export type DemoSessionUpdate = Partial<{
  transcript: string;
  workflowResult: HygieneWorkflowResult;
  recommendations: ApprovalRecommendation[];
  crmSnapshot: SimulatedCrmSnapshot;
  writebackSnapshot: SimulatedCrmSnapshot;
  auditEvents: ApprovalAuditEvent[];
  writebackAttempts: WritebackAttempt[];
}>;

export type { ExtractionOpportunity, ExtractionSourceItem, SimulatedCrmSnapshot, RecommendationCard, ApprovalRecommendation };
