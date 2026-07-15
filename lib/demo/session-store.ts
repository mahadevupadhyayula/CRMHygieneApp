import { randomUUID } from "node:crypto";

import type { DemoScenarioId, DemoSession, DemoSessionUpdate, SessionStoreError } from "./types";
import { getDemoScenario } from "./scenarios";
import { demoSessionSchema } from "./schemas";

const sessions = new Map<string, DemoSession>();

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function sessionNotFound(sessionId: string): SessionStoreError {
  return { code: "SESSION_NOT_FOUND", message: `Demo session ${sessionId} was not found. Recreate or reset the selected scenario.`, recoverable: true, sessionId };
}

function buildSession(scenarioId: DemoScenarioId, sessionId: string = randomUUID(), createdAt = new Date()): DemoSession {
  const scenario = getDemoScenario(scenarioId);
  return demoSessionSchema.parse({
    sessionId,
    scenarioId,
    transcript: scenario.defaultEditableTranscript,
    recommendations: [],
    crmSnapshot: clone(scenario.initialCrmSnapshot),
    writebackSnapshot: clone(scenario.initialWritebackSnapshot),
    auditEvents: [],
    writebackAttempts: [],
    version: 0,
    createdAt,
    updatedAt: createdAt,
  });
}

export function createSession(scenarioId: DemoScenarioId): DemoSession {
  const session = buildSession(scenarioId);
  sessions.set(session.sessionId, session);
  return clone(session);
}

export function getSession(sessionId: string): DemoSession | SessionStoreError {
  const session = sessions.get(sessionId);
  return session ? clone(session) : sessionNotFound(sessionId);
}

export function updateSession(sessionId: string, update: DemoSessionUpdate): DemoSession | SessionStoreError {
  const existing = sessions.get(sessionId);
  if (!existing) return sessionNotFound(sessionId);

  const next = demoSessionSchema.parse({
    ...existing,
    ...update,
    crmSnapshot: update.crmSnapshot ? clone(update.crmSnapshot) : existing.crmSnapshot,
    writebackSnapshot: update.writebackSnapshot ? clone(update.writebackSnapshot) : existing.writebackSnapshot,
    auditEvents: update.auditEvents ? clone(update.auditEvents) : existing.auditEvents,
    writebackAttempts: update.writebackAttempts ? clone(update.writebackAttempts) : existing.writebackAttempts,
    recommendations: update.recommendations ? clone(update.recommendations) : existing.recommendations,
    workflowResult: update.workflowResult ? clone(update.workflowResult) : existing.workflowResult,
    version: existing.version + 1,
    updatedAt: new Date(),
  });
  sessions.set(sessionId, next);
  return clone(next);
}

export function resetSession(sessionId: string): DemoSession | SessionStoreError {
  const existing = sessions.get(sessionId);
  if (!existing) return sessionNotFound(sessionId);

  const reset = buildSession(existing.scenarioId, existing.sessionId, existing.createdAt);
  const next = demoSessionSchema.parse({ ...reset, version: existing.version + 1, updatedAt: new Date() });
  sessions.set(sessionId, next);
  return clone(next);
}

export function clearSessionsForTests(): void {
  sessions.clear();
}
