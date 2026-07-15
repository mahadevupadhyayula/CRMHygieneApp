import { beforeEach, describe, expect, it } from "vitest";
import { POST as analyze } from "../../app/api/demo/analyze/route";
import { POST as createSession } from "../../app/api/demo/sessions/route";
import { POST as reset } from "../../app/api/demo/reset/route";
import { clearSessionsForTests } from "../../lib/demo/session-store";
import { demoScenarios } from "../../lib/demo/scenarios";

const req = (body: unknown) => new Request("http://localhost/api/demo", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const json = async (response: Response) => response.json();

describe("demo reset integration scenarios", () => {
  beforeEach(() => clearSessionsForTests());

  it("resets and reruns every founder demo scenario without process restart", async () => {
    for (const scenario of demoScenarios) {
      const created = await json(await createSession(req({ scenarioId: scenario.scenarioId })));
      const analyzed = await json(await analyze(req({ sessionId: created.data.session.sessionId, transcript: created.data.session.transcript, expectedSessionVersion: created.data.session.version })));
      expect(analyzed.ok).toBe(true);
      const resetBody = await json(await reset(req({ sessionId: analyzed.data.session.sessionId, scenarioId: scenario.scenarioId })));
      expect(resetBody.ok).toBe(true);
      expect(resetBody.data.session.sessionId).toBe(analyzed.data.session.sessionId);
      expect(resetBody.data.session.recommendations).toHaveLength(0);
      const rerun = await json(await analyze(req({ sessionId: resetBody.data.session.sessionId, transcript: resetBody.data.session.transcript, expectedSessionVersion: resetBody.data.session.version })));
      expect(rerun.ok).toBe(true);
      expect(["completed", "clarification_required", "no_action_required"]).toContain(rerun.data.session.workflowResult.finalStatus);
    }
  });
});
