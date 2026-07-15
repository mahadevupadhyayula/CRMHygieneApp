import { beforeEach, describe, expect, it } from "vitest";

import { POST as analyze } from "../../app/api/demo/analyze/route";
import { POST as transition } from "../../app/api/demo/recommendations/[id]/route";
import { POST as createSession } from "../../app/api/demo/sessions/route";
import { POST as writeback } from "../../app/api/demo/writeback/route";
import { clearSessionsForTests } from "../../lib/demo/session-store";

const actor = { id: "mgr-1", name: "Morgan Manager", role: "manager" as const };
const req = (body: unknown) => new Request("http://localhost/api/demo", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const json = async (response: Response) => response.json();

async function analyzed(scenarioId: string) {
  const created = await json(await createSession(req({ scenarioId })));
  const session = created.data.session;
  const analyzed = await json(await analyze(req({ sessionId: session.sessionId, transcript: session.transcript, expectedSessionVersion: session.version })));
  expect(analyzed.ok).toBe(true);
  return analyzed.data.session;
}

describe("demo happy path integration scenarios", () => {
  beforeEach(() => clearSessionsForTests());

  it("runs Nimbus happy path through partial approval and writeback", async () => {
    const session = await analyzed("nimbus-happy-path");
    expect(["completed", "clarification_required"]).toContain(session.workflowResult.finalStatus);
    const first = session.recommendations.find((rec: any) => rec.crmField === "NextStep") ?? session.recommendations[0];
    const approved = await json(await transition(req({ sessionId: session.sessionId, action: "approve", actor, expectedVersion: first.version }), { params: Promise.resolve({ id: first.id }) }));
    expect(approved.ok).toBe(true);
    const written = await json(await writeback(req({ sessionId: session.sessionId, recommendationIds: [first.id], actor, expectedSessionVersion: approved.data.session.version, idempotencyKey: "happy-partial" })));
    expect(written.ok).toBe(true);
    expect(written.data.results).toHaveLength(1);
    expect(written.data.results[0].crmChanged).toBe(true);
  });

  it("keeps ambiguous evidence review-only and Solo healthy as a no-op", async () => {
    const ambiguous = await analyzed("ambiguous-close-date");
    expect(ambiguous.workflowResult.finalStatus).toBe("clarification_required");
    expect(ambiguous.recommendations).toHaveLength(0);

    const solo = await analyzed("solo-healthy-crm");
    expect(solo.workflowResult.finalStatus).toBe("no_action_required");
    expect(solo.recommendations).toHaveLength(0);
  });
});
