import { ZodError } from "zod";

export type DemoApiErrorCode =
  | "SESSION_NOT_FOUND"
  | "SCENARIO_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RECOMMENDATION_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "APPROVAL_ERROR"
  | "WRITEBACK_ERROR"
  | "NO_APPROVED_RECOMMENDATIONS";

export type DemoApiError = { code: DemoApiErrorCode; message: string; details?: unknown };
export type DemoApiResponse<T> = { ok: true; data: T } | { ok: false; error: DemoApiError };

export function ok<T>(data: T): Response {
  return Response.json({ ok: true, data } satisfies DemoApiResponse<T>);
}

export function fail(code: DemoApiErrorCode, message: string, status = 400, details?: unknown): Response {
  return Response.json({ ok: false, error: { code, message, details } } satisfies DemoApiResponse<never>, { status });
}

export function validationFail(error: ZodError): Response {
  return fail("VALIDATION_ERROR", "Request validation failed.", 400, error.flatten());
}
