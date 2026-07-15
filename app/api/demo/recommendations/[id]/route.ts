import { transitionRecommendation } from "../../../../../lib/agents/approval";
import { transitionDemoRecommendationRequestSchema } from "../../../../../lib/demo/api-schemas";
import { fail, ok, validationFail } from "../../../../../lib/demo/api-errors";
import { getSession, updateSession } from "../../../../../lib/demo/session-store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = transitionDemoRecommendationRequestSchema.safeParse(await request.json());
  if (!parsed.success) return validationFail(parsed.error);
  if (parsed.data.action === "reject" && !parsed.data.rejectionReason) return fail("VALIDATION_ERROR", "Rejection reason is required.");
  if (parsed.data.action === "edit" && !parsed.data.editedValue) return fail("VALIDATION_ERROR", "Edited value is required.");
  const session = getSession(parsed.data.sessionId);
  if ("code" in session) return fail("SESSION_NOT_FOUND", session.message, 404);
  const index = session.recommendations.findIndex((item) => item.id === id);
  if (index < 0) return fail("RECOMMENDATION_NOT_FOUND", `Recommendation ${id} was not found.`, 404);
  try {
    const result = transitionRecommendation({ recommendation: session.recommendations[index], actor: parsed.data.actor, action: parsed.data.action, editedValue: parsed.data.editedValue, rejectionReason: parsed.data.rejectionReason, snoozedUntil: parsed.data.snoozedUntil, comment: parsed.data.comment, options: { expectedVersion: parsed.data.expectedVersion, staleRecommendationPolicy: "allow" } });
    const recommendations = session.recommendations.map((item, i) => (i === index ? result.recommendation : item));
    const updated = updateSession(session.sessionId, { recommendations, auditEvents: [...session.auditEvents, result.auditEvent] });
    if ("code" in updated) return fail("SESSION_NOT_FOUND", updated.message, 404);
    return ok({ session: updated, recommendation: result.recommendation, auditEvent: result.auditEvent, feedbackEvent: result.feedbackEvent });
  } catch (error) {
    const code = error instanceof Error && "code" in error && error.code === "VERSION_CONFLICT" ? "VERSION_CONFLICT" : "APPROVAL_ERROR";
    return fail(code, error instanceof Error ? error.message : String(error), code === "VERSION_CONFLICT" ? 409 : 400);
  }
}
