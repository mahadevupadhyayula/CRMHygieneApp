import { createSession } from "../../../../lib/demo/session-store";
import { createDemoSessionRequestSchema } from "../../../../lib/demo/api-schemas";
import { fail, ok, validationFail } from "../../../../lib/demo/api-errors";

export async function POST(request: Request) {
  const parsed = createDemoSessionRequestSchema.safeParse(await request.json());
  if (!parsed.success) return validationFail(parsed.error);
  try {
    return ok({ session: createSession(parsed.data.scenarioId) });
  } catch (error) {
    return fail("SCENARIO_NOT_FOUND", error instanceof Error ? error.message : String(error), 404);
  }
}
