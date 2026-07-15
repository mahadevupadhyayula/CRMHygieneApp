import { z } from "zod";

import { recommendationCardSchema } from "../agents/recommendation/schemas";
import { approvalAuditEventSchema } from "../agents/approval/schemas";
import { extractionOpportunitySchema, extractionSourceItemSchema } from "../agents/extraction/schemas";
import { simulatedCrmSnapshotSchema, writebackAttemptSchema } from "../agents/writeback/schemas";

export const demoScenarioIdSchema = z.enum(["nimbus-happy-path", "ambiguous-close-date", "orbit-crm-timeout", "solo-healthy-crm"]);

export const demoFailurePolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }).strict(),
  z.object({ mode: z.literal("api_timeout"), errorCode: z.literal("API_TIMEOUT"), maxRetries: z.number().int().nonnegative(), targetRecommendationHint: z.string().min(1) }).strict(),
]);

export const expectedDemoBehaviorSchema = z.object({
  finalStatus: z.enum(["completed", "no_action_required", "clarification_required", "failed"]),
  recommendationHints: z.array(z.string().min(1)),
  writebackExpectation: z.string().min(1),
}).strict();

export const demoScenarioSchema = z.object({
  scenarioId: demoScenarioIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  disclaimerText: z.string().min(1),
  opportunity: extractionOpportunitySchema,
  initialCrmSnapshot: simulatedCrmSnapshotSchema,
  initialWritebackSnapshot: simulatedCrmSnapshotSchema,
  defaultEditableTranscript: z.string().min(1),
  sourceItemTemplate: extractionSourceItemSchema,
  failurePolicy: demoFailurePolicySchema,
  expectedDemoBehavior: expectedDemoBehaviorSchema,
}).strict();

export const demoSessionSchema = z.object({
  sessionId: z.string().min(1),
  scenarioId: demoScenarioIdSchema,
  transcript: z.string(),
  workflowResult: z.unknown().optional(),
  recommendations: z.array(recommendationCardSchema),
  crmSnapshot: simulatedCrmSnapshotSchema,
  writebackSnapshot: simulatedCrmSnapshotSchema,
  auditEvents: z.array(approvalAuditEventSchema),
  writebackAttempts: z.array(writebackAttemptSchema),
  version: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
}).strict();

export const sessionStoreErrorSchema = z.object({
  code: z.literal("SESSION_NOT_FOUND"),
  message: z.string().min(1),
  recoverable: z.literal(true),
  sessionId: z.string().min(1),
}).strict();
