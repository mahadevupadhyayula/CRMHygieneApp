import { executeWriteback } from "../../../../lib/agents/writeback";
import { getDemoScenario } from "../../../../lib/demo/scenarios";
import { writebackDemoRequestSchema } from "../../../../lib/demo/api-schemas";
import { fail, ok, validationFail } from "../../../../lib/demo/api-errors";
import { assertSessionVersion } from "../../../../lib/demo/api-utils";
import { getSession, updateSession } from "../../../../lib/demo/session-store";

export async function POST(request: Request) {
  const parsed = writebackDemoRequestSchema.safeParse(await request.json());
  if (!parsed.success) return validationFail(parsed.error);
  const session = getSession(parsed.data.sessionId);
  if ("code" in session) return fail("SESSION_NOT_FOUND", session.message, 404);
  const version = assertSessionVersion(session, parsed.data.expectedSessionVersion);
  if (!version.ok) return fail("VERSION_CONFLICT", version.message, 409);
  const ids = parsed.data.recommendationIds;
  const selected = session.recommendations.filter((item) => (!ids || ids.includes(item.id)) && (item.status === "approved" || item.status === "edited"));
  if (selected.length === 0) return fail("NO_APPROVED_RECOMMENDATIONS", "No approved or edited recommendations are available for write-back.", 400);
  const scenario = getDemoScenario(session.scenarioId);
  let timeoutRecommendationIds: string[] = [];
  let maxRetries = 1;
  if (scenario.failurePolicy.mode === "api_timeout") {
    timeoutRecommendationIds = selected.map((item) => item.id);
    maxRetries = scenario.failurePolicy.maxRetries;
  }
  let snapshot = session.writebackSnapshot;
  const results = [];
  for (const recommendation of selected) {
    const before = structuredClone(snapshot);
    const result = executeWriteback({ snapshot, recommendation: { ...recommendation, status: "approved" }, actor: parsed.data.actor, options: { idempotencyKey: parsed.data.idempotencyKey ? `${parsed.data.idempotencyKey}:${recommendation.id}` : undefined, expectedOpportunityVersion: parsed.data.expectedOpportunityVersion, timeoutRecommendationIds, maxRetries, staleSourcePolicy: "allow", writableFields: ["NextStep", "NextStepDueDate__c", "Risk__c", "DecisionMaker__c", "ProcurementStatus__c", "LegalStatus__c", "SecurityStatus__c", "CloseDate", "StageName", "ForecastCategoryName"] } });
    snapshot = result.attempt.status === "failed" ? { ...before, writebackAttempts: result.snapshot.writebackAttempts, auditEvents: result.snapshot.auditEvents } : result.snapshot;
    results.push({ recommendationId: recommendation.id, attempt: result.attempt, retryCount: result.attempt.retryCount, errorCode: result.attempt.errorCode, errorMessage: result.attempt.errorMessage, crmChanged: result.attempt.status === "success" });
  }
  const updated = updateSession(session.sessionId, { writebackSnapshot: snapshot, crmSnapshot: snapshot, writebackAttempts: snapshot.writebackAttempts, auditEvents: [...session.auditEvents, ...snapshot.auditEvents] });
  if ("code" in updated) return fail("SESSION_NOT_FOUND", updated.message, 404);
  return ok({ session: updated, results });
}
