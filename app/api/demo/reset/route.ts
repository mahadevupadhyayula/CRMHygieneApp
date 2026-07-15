import { resetDemoRequestSchema } from "../../../../lib/demo/api-schemas";
import { fail, ok, validationFail } from "../../../../lib/demo/api-errors";
import { createSession, getSession, resetSession } from "../../../../lib/demo/session-store";

export async function POST(request: Request) {
  const parsed = resetDemoRequestSchema.safeParse(await request.json());
  if (!parsed.success) return validationFail(parsed.error);
  if (!parsed.data.sessionId) return ok({ session: createSession(parsed.data.scenarioId) });
  const existing = getSession(parsed.data.sessionId);
  if ("code" in existing) return ok({ session: createSession(parsed.data.scenarioId) });
  if (existing.scenarioId !== parsed.data.scenarioId) return fail("SCENARIO_NOT_FOUND", "Session scenario does not match reset scenario.", 404);
  const reset = resetSession(parsed.data.sessionId);
  if ("code" in reset) return fail("SESSION_NOT_FOUND", reset.message, 404);
  return ok({ session: reset });
}
