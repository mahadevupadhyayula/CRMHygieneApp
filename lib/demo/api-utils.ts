import { getDemoScenario } from "./scenarios";
import type { DemoSession, SimulatedCrmSnapshot } from "./types";

export function crmSnapshotToWorkflowFields(snapshot: SimulatedCrmSnapshot) {
  return Object.values(snapshot.opportunities).flatMap((opportunity) =>
    Object.entries(opportunity.fields).map(([fieldName, field]) => ({ id: opportunity.id, fieldName, value: field.value == null ? null : String(field.value), capturedAt: opportunity.sourceCapturedAt ?? field.updatedAt ?? opportunity.updatedAt }))
  );
}

export function sourceItemForSession(session: DemoSession, transcript: string) {
  const scenario = getDemoScenario(session.scenarioId);
  return { ...scenario.sourceItemTemplate, body: String(scenario.sourceItemTemplate.body ?? "").replace("{{transcript}}", transcript) };
}

export function assertSessionVersion(session: DemoSession, expected?: number): { ok: true } | { ok: false; message: string } {
  return expected !== undefined && session.version !== expected ? { ok: false, message: `Session version ${session.version} does not match expected version ${expected}.` } : { ok: true };
}
