import { describe, expect, it, beforeEach } from "vitest";

import { clearSessionsForTests, createSession, getDemoScenario, getSession, resetSession, updateSession, type DemoSession, type RecommendationCard } from "../../lib/demo";
import { executeWriteback, type SimulatedCrmSnapshot } from "../../lib/agents/writeback";
import type { ApprovalRecommendation } from "../../lib/agents/approval";

const now = new Date("2026-07-15T00:00:00.000Z");

function assertSession(value: DemoSession | { code: string }): asserts value is DemoSession {
  expect("sessionId" in value).toBe(true);
}

function orbitCard(): RecommendationCard {
  return {
    id: "rec-orbit-security-follow-up",
    opportunityId: "opp-orbit",
    actionType: "update_crm_field",
    proposedAction: "Update NextStep with security follow-up",
    crmField: "NextStep",
    currentCrmValue: "Wait for security questionnaire",
    suggestedValue: "Send security evidence package and schedule CISO review by 2026-07-18",
    reason: "Security follow-up is explicit in the transcript.",
    evidence: [{ factId: "fact-security", sourceId: "src-orbit-transcript", sourceTimestamp: now, evidenceText: "send the security evidence package and schedule CISO review", crmField: "NextStep", issueType: "security follow-up", validationStatus: "valid", confidence: 0.9 }],
    confidence: 0.9,
    riskLevel: "low",
    requiredApprover: null,
    approvalPolicy: "none",
    approvalLevels: [],
    status: "ready",
    missingRequiredApprover: false,
    duplicateKey: "opp-orbit:NextStep:security-follow-up",
    createdFrom: "comparison",
  };
}

function toApproval(card: RecommendationCard): ApprovalRecommendation {
  return { id: card.id, opportunityId: card.opportunityId!, actionType: card.actionType, crmField: card.crmField, riskLevel: card.riskLevel, status: "approved", currentValue: card.currentCrmValue, suggestedValue: card.suggestedValue, evidence: card.evidence.map((e) => ({ sourceId: e.sourceId, factId: e.factId, evidenceText: e.evidenceText, available: true })), createdAt: now, updatedAt: now, version: 0 };
}

describe("demo session store", () => {
  beforeEach(() => clearSessionsForTests());

  it("isolates sessions and does not use browser localStorage as source of truth", () => {
    const first = createSession("nimbus-happy-path");
    const second = createSession("nimbus-happy-path");
    assertSession(updateSession(first.sessionId, { transcript: "edited transcript" }));

    const firstRead = getSession(first.sessionId);
    const secondRead = getSession(second.sessionId);
    assertSession(firstRead);
    assertSession(secondRead);
    expect(firstRead.transcript).toBe("edited transcript");
    expect(secondRead.transcript).toBe(getDemoScenario("nimbus-happy-path").defaultEditableTranscript);
    expect(firstRead.sessionId).not.toBe(secondRead.sessionId);
  });

  it("reset restores initial state while preserving the server session identity", () => {
    const session = createSession("solo-healthy-crm");
    assertSession(updateSession(session.sessionId, { transcript: "mutated", recommendations: [] }));
    const reset = resetSession(session.sessionId);
    assertSession(reset);

    expect(reset.sessionId).toBe(session.sessionId);
    expect(reset.transcript).toBe(getDemoScenario("solo-healthy-crm").defaultEditableTranscript);
    expect(reset.crmSnapshot).toEqual(getDemoScenario("solo-healthy-crm").initialCrmSnapshot);
    expect(reset.version).toBe(2);
  });

  it("missing session returns recoverable SESSION_NOT_FOUND", () => {
    expect(getSession("missing-session")).toEqual({ code: "SESSION_NOT_FOUND", message: expect.stringContaining("Recreate or reset"), recoverable: true, sessionId: "missing-session" });
  });

  it("Orbit failure policy resolves against generated recommendations and keeps CRM unchanged on timeout", () => {
    const scenario = getDemoScenario("orbit-crm-timeout");
    if (scenario.failurePolicy.mode !== "api_timeout") throw new Error("Orbit scenario must use API timeout policy");
    const card = orbitCard();
    expect(`${card.proposedAction} ${card.reason}`.toLowerCase()).toContain(scenario.failurePolicy.targetRecommendationHint);

    const before = structuredClone(scenario.initialWritebackSnapshot) as SimulatedCrmSnapshot;
    const result = executeWriteback({ snapshot: before, recommendation: toApproval(card), actor: { id: "mgr-1", role: "manager" }, options: { now, timeoutRecommendationIds: [card.id], maxRetries: scenario.failurePolicy.maxRetries } });

    expect(result.attempt.status).toBe("failed");
    expect(result.attempt.errorCode).toBe("API_TIMEOUT");
    expect(result.attempt.retryCount).toBe(2);
    expect(result.snapshot.opportunities["opp-orbit"].fields.NextStep.value).toBe(scenario.initialWritebackSnapshot.opportunities["opp-orbit"].fields.NextStep.value);
  });

  it("Solo scenario supports no-op state", () => {
    const session = createSession("solo-healthy-crm");
    expect(session.recommendations).toHaveLength(0);
    expect(session.writebackAttempts).toHaveLength(0);
    expect(getDemoScenario("solo-healthy-crm").expectedDemoBehavior.finalStatus).toBe("no_action_required");
  });
});
