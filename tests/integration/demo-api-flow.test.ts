import { beforeEach, describe, expect, it } from "vitest";

import { clearSessionsForTests } from "../../lib/demo/session-store";
import { POST as createSession } from "../../app/api/demo/sessions/route";
import { POST as analyze } from "../../app/api/demo/analyze/route";
import { POST as transition } from "../../app/api/demo/recommendations/[id]/route";
import { POST as writeback } from "../../app/api/demo/writeback/route";
import { POST as reset } from "../../app/api/demo/reset/route";

const actor = { id: "mgr-1", name: "Morgan Manager", role: "manager" as const };

function request(body: unknown) {
  return new Request("http://localhost/api/demo", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

async function json<T = any>(response: Response): Promise<T> {
  return response.json();
}

async function newSession(scenarioId: string) {
  const body = await json(await createSession(request({ scenarioId })));
  expect(body.ok).toBe(true);
  return body.data.session;
}

async function analyzeSession(session: any, transcript = session.transcript) {
  const body = await json(await analyze(request({ sessionId: session.sessionId, transcript, expectedSessionVersion: session.version })));
  expect(body.ok).toBe(true);
  return body.data.session;
}

describe("demo backend API vertical slice", () => {
  beforeEach(() => clearSessionsForTests());

  it("proves Analyze → approve → write back → audit without React or browser storage", async () => {
    const session = await analyzeSession(await newSession("nimbus-happy-path"));
    expect(session.recommendations.length).toBeGreaterThan(0);
    const rec = session.recommendations.find((item: any) => item.status === "pending");
    const approved = await json(await transition(request({ sessionId: session.sessionId, action: "approve", actor, expectedVersion: rec.version }), { params: Promise.resolve({ id: rec.id }) }));
    expect(approved.ok).toBe(true);
    const written = await json(await writeback(request({ sessionId: session.sessionId, recommendationIds: [rec.id], actor, expectedSessionVersion: approved.data.session.version, idempotencyKey: "flow-1" })));
    expect(written.ok).toBe(true);
    expect(written.data.results[0].crmChanged).toBe(true);
    expect(written.data.session.auditEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("supports partial approval by writing only selected approved recommendations", async () => {
    const session = await analyzeSession(await newSession("nimbus-happy-path"));
    const first = session.recommendations[0];
    const approved = await json(await transition(request({ sessionId: session.sessionId, action: "approve", actor, expectedVersion: first.version }), { params: Promise.resolve({ id: first.id }) }));
    const written = await json(await writeback(request({ sessionId: session.sessionId, recommendationIds: [first.id], actor, expectedSessionVersion: approved.data.session.version })));
    expect(written.ok).toBe(true);
    expect(written.data.results).toHaveLength(1);
  });

  it("reject requires a reason", async () => {
    const session = await analyzeSession(await newSession("nimbus-happy-path"));
    const body = await json(await transition(request({ sessionId: session.sessionId, action: "reject", actor, expectedVersion: 0 }), { params: Promise.resolve({ id: session.recommendations[0].id }) }));
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("edit requires a value", async () => {
    const session = await analyzeSession(await newSession("nimbus-happy-path"));
    const body = await json(await transition(request({ sessionId: session.sessionId, action: "edit", actor, expectedVersion: 0 }), { params: Promise.resolve({ id: session.recommendations[0].id }) }));
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("ambiguous evidence returns clarification/review-only behavior", async () => {
    const session = await analyzeSession(await newSession("ambiguous-close-date"));
    expect(session.workflowResult.finalStatus).toBe("clarification_required");
    expect(session.recommendations).toHaveLength(0);
  });

  it("Solo no-op returns no approved recommendations for writeback", async () => {
    const session = await analyzeSession(await newSession("solo-healthy-crm"));
    expect(session.workflowResult.finalStatus).toBe("no_action_required");
    const body = await json(await writeback(request({ sessionId: session.sessionId, actor })));
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NO_APPROVED_RECOMMENDATIONS");
  });

  it("Orbit timeout preserves CRM and reports retry count", async () => {
    const session = await analyzeSession(await newSession("orbit-crm-timeout"));
    const rec = session.recommendations[0];
    const approved = await json(await transition(request({ sessionId: session.sessionId, action: "approve", actor, expectedVersion: rec.version }), { params: Promise.resolve({ id: rec.id }) }));
    const before = approved.data.session.writebackSnapshot.opportunities[rec.opportunityId].fields.NextStep.value;
    const body = await json(await writeback(request({ sessionId: session.sessionId, recommendationIds: [rec.id], actor, expectedSessionVersion: approved.data.session.version })));
    expect(body.ok).toBe(true);
    expect(body.data.results[0].errorCode).toBe("API_TIMEOUT");
    expect(body.data.results[0].retryCount).toBe(2);
    expect(body.data.session.writebackSnapshot.opportunities[rec.opportunityId].fields.NextStep.value).toBe(before);
  });

  it("duplicate writeback is idempotent", async () => {
    const session = await analyzeSession(await newSession("nimbus-happy-path"));
    const rec = session.recommendations[0];
    const approved = await json(await transition(request({ sessionId: session.sessionId, action: "approve", actor, expectedVersion: rec.version }), { params: Promise.resolve({ id: rec.id }) }));
    const first = await json(await writeback(request({ sessionId: session.sessionId, recommendationIds: [rec.id], actor, expectedSessionVersion: approved.data.session.version, idempotencyKey: "dup" })));
    const second = await json(await writeback(request({ sessionId: session.sessionId, recommendationIds: [rec.id], actor, expectedSessionVersion: first.data.session.version, idempotencyKey: "dup" })));
    expect(second.ok).toBe(true);
    expect(second.data.results[0].attempt.status).toBe("duplicate");
  });

  it("returns version conflict for stale session writes", async () => {
    const session = await newSession("nimbus-happy-path");
    const body = await json(await analyze(request({ sessionId: session.sessionId, transcript: session.transcript, expectedSessionVersion: 99 })));
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VERSION_CONFLICT");
  });

  it("reset restores an existing scenario session", async () => {
    const session = await analyzeSession(await newSession("nimbus-happy-path"));
    const body = await json(await reset(request({ sessionId: session.sessionId, scenarioId: "nimbus-happy-path" })));
    expect(body.ok).toBe(true);
    expect(body.data.session.sessionId).toBe(session.sessionId);
    expect(body.data.session.recommendations).toHaveLength(0);
  });
});
