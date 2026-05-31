import type { z } from "zod";

import type {
  crmFieldDataTypeSchema,
  crmFieldSnapshotSchema,
  crmFieldValueSchema,
  executeWritebackInputSchema,
  rollbackWritebackInputSchema,
  simulatedCrmOpportunitySchema,
  simulatedCrmSnapshotSchema,
  simulatedCrmTaskSchema,
  simulatedNoteSummarySchema,
  simulatedOwnerAssignmentSchema,
  simulatedRiskTagSchema,
  writebackAttemptSchema,
  writebackChangeSchema,
  writebackOptionsSchema,
} from "./schemas";
import type { ApprovalAuditEvent } from "../approval";

export type CrmFieldValue = z.infer<typeof crmFieldValueSchema>;
export type CrmFieldDataType = z.infer<typeof crmFieldDataTypeSchema>;
export type CrmFieldSnapshot = z.infer<typeof crmFieldSnapshotSchema>;
export type SimulatedCrmOpportunity = z.infer<typeof simulatedCrmOpportunitySchema>;
export type SimulatedCrmTask = z.infer<typeof simulatedCrmTaskSchema>;
export type SimulatedRiskTag = z.infer<typeof simulatedRiskTagSchema>;
export type SimulatedNoteSummary = z.infer<typeof simulatedNoteSummarySchema>;
export type SimulatedOwnerAssignment = z.infer<typeof simulatedOwnerAssignmentSchema>;
export type WritebackChange = z.infer<typeof writebackChangeSchema>;
export type WritebackAttempt = z.infer<typeof writebackAttemptSchema>;
export type SimulatedCrmSnapshot = z.infer<typeof simulatedCrmSnapshotSchema>;
export type WritebackOptions = z.input<typeof writebackOptionsSchema>;
export type ExecuteWritebackInput = z.input<typeof executeWritebackInputSchema>;
export type RollbackWritebackInput = z.input<typeof rollbackWritebackInputSchema>;

export type WritebackResult = {
  snapshot: SimulatedCrmSnapshot;
  attempt: WritebackAttempt;
  auditEvent: ApprovalAuditEvent;
};
