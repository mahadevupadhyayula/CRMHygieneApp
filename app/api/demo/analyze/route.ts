import { runHygieneWorkflow } from "../../../../lib/workflows";
import { getDemoScenario } from "../../../../lib/demo/scenarios";
import { getSession, updateSession } from "../../../../lib/demo/session-store";
import { analyzeDemoRequestSchema } from "../../../../lib/demo/api-schemas";
import { fail, ok, validationFail } from "../../../../lib/demo/api-errors";
import { assertSessionVersion, crmSnapshotToWorkflowFields, sourceItemForSession } from "../../../../lib/demo/api-utils";
import { recommendationCardsToApprovalRecommendations } from "../../../../lib/demo/recommendation-conversion";

export async function POST(request: Request) {
  const parsed = analyzeDemoRequestSchema.safeParse(await request.json());
  if (!parsed.success) return validationFail(parsed.error);
  const session = getSession(parsed.data.sessionId);
  if ("code" in session) return fail("SESSION_NOT_FOUND", session.message, 404);
  const version = assertSessionVersion(session, parsed.data.expectedSessionVersion);
  if (!version.ok) return fail("VERSION_CONFLICT", version.message, 409);
  const scenario = getDemoScenario(session.scenarioId);
  const workflowResult = await runHygieneWorkflow({ opportunity: scenario.opportunity, sourceItems: [sourceItemForSession(session, parsed.data.transcript)], crmSnapshot: crmSnapshotToWorkflowFields(session.crmSnapshot), options: { referenceDate: new Date("2026-07-15T00:00:00.000Z") } });
  const recommendations = recommendationCardsToApprovalRecommendations(workflowResult.recommendations, new Date("2026-07-15T00:00:00.000Z"));
  const updated = updateSession(session.sessionId, { transcript: parsed.data.transcript, workflowResult, recommendations });
  if ("code" in updated) return fail("SESSION_NOT_FOUND", updated.message, 404);
  return ok({ session: updated, workflowResult, recommendations });
}
