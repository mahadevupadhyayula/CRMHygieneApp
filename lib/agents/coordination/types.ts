import type { z } from "zod";

import type {
  coordinationActionListSchema,
  coordinationActionSchema,
  coordinationActionStatusSchema,
  coordinationActionTypeSchema,
  coordinationContextSchema,
  coordinationEvidenceSchema,
  coordinationOptionsSchema,
  coordinationOwnerRoleSchema,
  existingCoordinationActionSchema,
} from "./schemas";

export type CoordinationActionType = z.infer<typeof coordinationActionTypeSchema>;
export type CoordinationOwnerRole = z.infer<typeof coordinationOwnerRoleSchema>;
export type CoordinationActionStatus = z.infer<typeof coordinationActionStatusSchema>;
export type CoordinationEvidence = z.infer<typeof coordinationEvidenceSchema>;
export type CoordinationAction = z.infer<typeof coordinationActionSchema>;
export type CoordinationActionList = z.infer<typeof coordinationActionListSchema>;
export type ExistingCoordinationAction = z.infer<typeof existingCoordinationActionSchema>;
export type CoordinationOptions = z.input<typeof coordinationOptionsSchema>;
export type CoordinationContext = z.input<typeof coordinationContextSchema>;
