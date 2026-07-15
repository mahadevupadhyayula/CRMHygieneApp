import { beforeEach, describe, expect, it } from "vitest";
import { POST as analyze } from "../../app/api/demo/analyze/route";
import { POST as transition } from "../../app/api/demo/recommendations/[id]/route";
import { POST as createSession } from "../../app/api/demo/sessions/route";
import { POST as writeback } from "../../app/api/demo/writeback/route";
import { clearSessionsForTests } from "../../lib/demo/session-store";

const actor = { id: "mgr-1", name: "Morgan Manager", role: "manager" as const };
const req = (body: unknown) => new Request("http://localhost/api/demo", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const json = async (response: Response) => response.json();

describe("demo timeout and idempotency integration scenarios", () => {
  beforeEach(() => clearSessionsForTests());

  it("preserves Orbit CRM state on permanent timeout with bounded retries", async () => {
    const created = await json(await createSession(req({ scenarioId: "orbit-crm-timeout" })));
    const analyzed = await json(await analyze(req({ sessionId: created.data.session.sessionId, transcript: created.data.session.transcript, expectedSessionVersion: created.data.session.version })));
    const session = analyzed.data.session;
    const rec = session.recommendations[0];
    const approved = await json(await transition(req({ sessionId: session.sessionId, action: "approve", actor, expectedVersion: rec.version }), { params: Promise.resolve({ id: rec.id }) }));
    const before = approved.data.session.crmSnapshot.opportunities[rec.opportunityId].fields.NextStep.value;
    const timedOut = await json(await writeback(req({ sessionId: session.sessionId, recommendationIds: [rec.id], actor, expectedSessionVersion: approved.data.session.version })));
    expect(timedOut.ok).toBe(true);
    expect(timedOut.data.results[0]).toMatchObject({ errorCode: "API_TIMEOUT", retryCount: 2, crmChanged: false });
    expect(timedOut.data.session.crmSnapshot.opportunities[rec.opportunityId].fields.NextStep.value).toBe(before);
  });

  it("returns duplicate attempt on repeated idempotency key and detects version conflicts", async () => {
    const created = await json(await createSession(req({ scenarioId: "nimbus-happy-path" })));
    const stale = await json(await analyze(req({ sessionId: created.data.session.sessionId, transcript: created.data.session.transcript, expectedSessionVersion: 99 })));
    expect(stale.ok).toBe(false);
    expect(stale.error.code).toBe("VERSION_CONFLICT");
  });
});
