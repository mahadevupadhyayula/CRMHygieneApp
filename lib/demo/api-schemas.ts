import { z } from "zod";

import { approvalActorSchema, approvalWorkflowActionSchema } from "../agents/approval/schemas";
import { demoScenarioIdSchema } from "./schemas";

export const createDemoSessionRequestSchema = z.object({ scenarioId: demoScenarioIdSchema }).strict();
export const analyzeDemoRequestSchema = z.object({ sessionId: z.string().min(1), transcript: z.string(), expectedSessionVersion: z.number().int().nonnegative().optional() }).strict();
export const transitionDemoRecommendationRequestSchema = z.object({ sessionId: z.string().min(1), action: approvalWorkflowActionSchema, actor: approvalActorSchema, expectedVersion: z.number().int().nonnegative(), editedValue: z.string().min(1).optional(), rejectionReason: z.string().min(1).optional(), snoozedUntil: z.coerce.date().optional(), comment: z.string().min(1).optional() }).strict();
export const writebackDemoRequestSchema = z.object({ sessionId: z.string().min(1), recommendationIds: z.array(z.string().min(1)).optional(), actor: approvalActorSchema, expectedSessionVersion: z.number().int().nonnegative().optional(), expectedOpportunityVersion: z.number().int().nonnegative().optional(), idempotencyKey: z.string().min(1).optional() }).strict();
export const resetDemoRequestSchema = z.object({ sessionId: z.string().min(1).optional(), scenarioId: demoScenarioIdSchema }).strict();
